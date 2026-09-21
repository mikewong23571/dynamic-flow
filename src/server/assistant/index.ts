import { validateExpansion } from '../flow/expansion.ts';
import { semanticGuide, dynamicInstructions } from './semantic-guide.ts';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Type } from '@earendil-works/pi-ai';
import { defineTool } from '@earendil-works/pi-coding-agent';
import type {
  Activity,
  ChatMessage,
  Definition,
  EditRequest,
  Json,
  ModelSelection,
  NodeExecution,
} from '../../shared/records.ts';
import type { FileStore } from '../files/index.ts';
import {
  checkDefinition,
  validateForRun,
  type FlowService,
} from '../flow/index.ts';
import { safeError, type ModelConfig } from './config.ts';
import type { CatalogInput } from './catalog.ts';
import { runPiSession, throwIfAborted, type SessionRunner } from './pi.ts';
import { parseOutput, validateEvidence } from './validation.ts';
import { createModelSettings } from './settings.ts';
import { expressionGuide } from './expression-guide.ts';
import { collectionGuide } from './collection-guide.ts';

export { runPiSession } from './pi.ts';

const definitionSchema = Type.Object({
  schemaVersion: Type.Literal(1),
  problem: Type.Optional(
    Type.Object({
      framing: Type.String(),
      known: Type.String(),
      unknown: Type.String(),
      constraints: Type.String(),
      evidence: Type.String(),
    }),
  ),
  inputs: Type.Array(Type.String()),
  nodes: Type.Array(
    Type.Object({
      id: Type.String(),
      label: Type.String(),
      kind: Type.Union([
        Type.Literal('agent'),
        Type.Literal('function'),
        Type.Literal('branch'),
        Type.Literal('wait'),
        Type.Literal('milestone'),
        Type.Literal('file'),
        Type.Literal('dynamic'),
      ]),
      mode: Type.Union([Type.Literal('each'), Type.Literal('all')]),
      contract: Type.Optional(
        Type.Object({
          responsibility: Type.String(),
          done: Type.String(),
          rationale: Type.String(),
          semanticRole: Type.Optional(Type.String()),
        }),
      ),
      dynamic: Type.Optional(
        Type.Object({
          boundary: Type.String(),
          maxNodes: Type.Integer({ minimum: 1, maximum: 20 }),
        }),
      ),
      repeat: Type.Optional(
        Type.Object({
          max: Type.Integer({ minimum: 1, maximum: 10 }),
          until: Type.Optional(Type.Any()),
        }),
      ),
      task: Type.Optional(Type.String()),
      file: Type.Optional(Type.Object({ name: Type.String({ minLength: 1 }) })),
      operation: Type.Optional(
        Type.Union([
          Type.Literal('map'),
          Type.Literal('flatMap'),
          Type.Literal('aggregate'),
        ]),
      ),
      concurrency: Type.Optional(Type.Integer({ minimum: 1, maximum: 8 })),
      inputSchema: Type.Optional(Type.Any()),
      wait: Type.Optional(
        Type.Object({
          event: Type.String(),
          reason: Type.String(),
          timeoutSeconds: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
        }),
      ),
      milestone: Type.Optional(
        Type.Object({ stage: Type.String(), summary: Type.String() }),
      ),
      expectedOutput: Type.Optional(Type.Any()),
      functionName: Type.Optional(
        Type.Union([
          Type.Literal('identity'),
          Type.Literal('select-fields'),
          Type.Literal('merge'),
          Type.Literal('collect'),
          Type.Literal('join'),
          Type.Literal('expression'),
        ]),
      ),
      inputNames: Type.Optional(Type.Array(Type.String())),
      join: Type.Optional(
        Type.Object({
          type: Type.Union([
            Type.Literal('inner'),
            Type.Literal('left'),
            Type.Literal('right'),
            Type.Literal('full'),
          ]),
          leftKey: Type.Array(
            Type.Union([Type.String(), Type.Integer({ minimum: 0 })]),
          ),
          rightKey: Type.Array(
            Type.Union([Type.String(), Type.Integer({ minimum: 0 })]),
          ),
          duplicates: Type.Union([Type.Literal('all'), Type.Literal('error')]),
        }),
      ),
      expression: Type.Optional(
        Type.Object(
          {
            kind: Type.Union(
              [
                'literal',
                'variable',
                'object',
                'array',
                'call',
                'pipe',
                'map',
                'flatMap',
                'filter',
                'reduce',
                'let',
                'match',
              ].map((kind) => Type.Literal(kind)),
            ),
          },
          {
            additionalProperties: true,
            description:
              '纯表达式树；各 kind 的字段、变量作用域与模式形状见系统说明。完整树在保存前校验。',
          },
        ),
      ),
      params: Type.Optional(
        Type.Object({ fields: Type.Optional(Type.Array(Type.String())) }),
      ),
      condition: Type.Optional(
        Type.Object({
          field: Type.String(),
          operator: Type.Union([
            Type.Literal('equals'),
            Type.Literal('contains'),
            Type.Literal('exists'),
          ]),
          value: Type.Optional(Type.Any()),
        }),
      ),
    }),
  ),
  edges: Type.Array(
    Type.Object({
      from: Type.Array(Type.String(), { minItems: 2, maxItems: 2 }),
      to: Type.Array(Type.String(), { minItems: 2, maxItems: 2 }),
    }),
  ),
  outputs: Type.Object(
    {},
    {
      additionalProperties: Type.Array(Type.String(), {
        minItems: 2,
        maxItems: 2,
      }),
    },
  ),
});

const authorInstructions = `你是工作流作者。初次生成流程时请在 update_flow 的 title 字段给出简短中文工作标题（建议 4–12 字），概括本次真实目标，不写 UUID。根据本次目标与材料创建或修改实际可执行的工作流，使用中文回答。
修改类请求必须调用 update_flow 保存实际定义才算完成编辑，不得只说已修改；纯分析或问答可直接回复说明，不要为凑变更保存无关修改。工具失败要说明原因，不得声称已保存。不满足可运行条件的提案会被工具拒绝且不会写入草稿；收到校验错误应修正后再次保存，无法修正时说明未完成事项。
工作流形状由工具 schema 定义，完整定义必须显式包含 schemaVersion:1。保持任务与输出结构简洁，只包含完成目标需要的字段，不为每个字段重复编写 description。面向用户的最终报告节点输出 Markdown 正文，expectedOutput 使用 {"type":"string"}，不为报告建立庞大的嵌套 JSON 结构。普通节点输入端口 input、输出 output；branch 输入 input、输出 matched/unmatched；旧 functionName=merge（无inputNames）节点输入 left/right；新集合函数的端口和schema见后述规则。file 来源节点（kind:file, file:{name}）引用工作 uploads 中的文件，无入边、输出 output，下游 agent 节点可在会话中用 Node 运行时（xlsx/mammoth/unpdf 已预装）读取该文件。不存在 $output 虚拟节点，不要向它连线；最终输出只能声明在 outputs 映射中，例如 outputs:{report:["实际节点id","output"]}。外部输入用 ['$input', '<inputs中的名字>']。edges 决定顺序；不允许回连。
operation 明确计算组合：map 对每条输入调用一次，返回一个值（数组也保留为一个值）；flatMap 对每条输入调用一次并将返回数组展开一层；aggregate 一次处理集合。为兼容旧定义，map/flatMap 同时设 mode:each，aggregate 设 mode:all；concurrency 可设 1–8，默认1。inputSchema/expectedOutput 分别定义单次调用输入/输出，普通 aggregate 输入为数组；旧多端口 aggregate 的 schema 输入按端口顺序拼接为值数组；无inputNames的旧merge保留 left/right 端口来源。新集合函数使用后述具名数组对象输入与固定输出分发规则。函数允许 identity/select-fields/merge/collect/join/expression。节点 id 稳定保留，label 写用户能理解的业务名称。
${expressionGuide}
${collectionGuide}
${semanticGuide}
持续业务流程可以添加 kind:milestone, mode:all, milestone:{stage,summary}，输入 input、输出 output，透传输入并记录明确的阶段事实，不能在未验证时声称业务完成。kind:wait, mode:all, wait:{event,reason,timeoutSeconds?} 持久等待指定外部事件或超时，输入 input、输出 output（原输入）/event（消息或到期信号）。等待适用于正式工作项运行；普通试运行跳过持久等待且不提交业务里程碑。业务完成由工作项完成条件显式确认，不能用最后节点成功代替。
根据目标生成必要步骤，不照搬无关示例。逐条分析与总体产物用清楚分工的节点。明确引用要求应写入相关 task；结构化结果用 expectedOutput JSON Schema，支持 type/object/properties/required/enum/items/minItems；保留原始材料编号。依据可用 evidence:[{materialId,quote}]，quote 必须是原文逐字片段。
若有选定节点，本轮仅修改它的任务/参数/名称/输出结构；其它节点、连接、输入输出保持不变。整个流程修改需要用户从全流程上下文发起。
用 inspect_result 查看实际结果，不能编造历史结果。没有历史结果时使用当前真实材料。用户发送后界面的选择变化不改变本轮固定上下文。不要把采用做法与修改草稿混为一谈。最终回复只用两到三句说明改动内容和下一步可做的操作，不展示内部 UUID、源码、JSON 或冗长技术排错过程。`;

function updateActivity(message: ChatMessage, activity: Activity) {
  message.activities ??= [];
  const index = message.activities.findIndex((item) => item.id === activity.id);
  if (index < 0) message.activities.push(activity);
  else
    message.activities[index] = { ...message.activities[index], ...activity };
}

/** 披露给模型的列表统一裁剪：超限时尾部附加清晰的截断标记，不静默丢弃。 */
function clipList<T>(items: T[], limit: number): (T | string)[] {
  if (items.length <= limit) return items;
  return [
    ...items.slice(0, limit),
    `…已截断：共 ${items.length} 条，仅显示前 ${limit} 条`,
  ];
}

export function createAssistant(
  files: FileStore,
  flow: FlowService,
  options: {
    runSession?: SessionRunner;
    settingsPath?: string;
    catalogPath?: string;
  } = {},
) {
  const runSession = options.runSession ?? runPiSession;
  const active = new Map<
    string,
    { workId: string; controller: AbortController }
  >();
  /** 同一 Work 的作者请求串行：Pi 持久会话文件是追加式单写者，并发会交错损坏。 */
  const sessionQueues = new Map<string, Promise<unknown>>();
  const enqueueSession = (workId: string, run: () => Promise<void>) => {
    const next = (sessionQueues.get(workId) ?? Promise.resolve())
      .catch(() => {})
      .then(run);
    sessionQueues.set(workId, next);
    void next
      .finally(() => {
        if (sessionQueues.get(workId) === next) sessionQueues.delete(workId);
      })
      .catch(() => {});
    return next;
  };
  /** 已有 Pi 会话文件 = 历史已在会话内，无需再用消息文本引导。 */
  const hasPiSession = async (dir: string) => {
    try {
      return (await readdir(dir)).some((file) => file.endsWith('.jsonl'));
    } catch {
      return false;
    }
  };
  const modelSettings = createModelSettings(
    options.settingsPath,
    options.catalogPath,
  );
  /** 工作 uploads 全部文件软链进会话目录，供节点按文件名访问。 */
  const uploadLinks = async (workId: string) =>
    (await files.listUploads(workId)).map((name) => ({
      path: files.uploadPath(workId, name),
      as: name,
    }));
  const patchMessage = (
    workId: string,
    requestId: string,
    update: (message: ChatMessage) => void,
  ) =>
    files.change(workId, (work) => {
      const message = work.messages.find(
        (message) =>
          message.role === 'assistant' && message.requestId === requestId,
      );
      if (!message) throw new Error('找不到本次 Assistant 请求。');
      update(message);
    });

  return {
    configuration: modelSettings.configuration,
    saveDefaultSelection: modelSettings.saveDefaultSelection,
    /** 整份保存目录；被默认选择或任一 Work 对话覆盖引用的别名不得消失。 */
    async saveCatalog(input: CatalogInput) {
      const aliases = new Set(
        (input.models ?? []).map((model) => model.alias?.trim() ?? ''),
      );
      const defaultSelection = modelSettings.getDefaultSelection();
      if (defaultSelection && !aliases.has(defaultSelection.alias))
        throw new Error(
          `默认模型仍选择「${defaultSelection.alias}」，请先更改或清除默认选择。`,
        );
      for (const work of await files.list()) {
        const selection = work.modelSelections?.assistant;
        if (selection && !aliases.has(selection.alias))
          throw new Error(
            `工作「${work.title || work.id}」的对话仍选择「${selection.alias}」，请先在该工作更改或清除选择。`,
          );
      }
      return modelSettings.saveCatalog(input);
    },
    /** 保存本工作对话的模型覆盖；null 清除（跟随默认）。 */
    async saveWorkSelection(workId: string, selection: ModelSelection | null) {
      const frozen = selection ? structuredClone(selection) : null;
      if (frozen) modelSettings.checkSelection(frozen);
      await files.change(workId, (work) => {
        work.modelSelections ??= {};
        if (frozen) work.modelSelections.assistant = frozen;
        else {
          delete work.modelSelections.assistant;
          if (!Object.keys(work.modelSelections).length)
            delete work.modelSelections;
        }
      });
    },
    /** 测试目录条目连通性：跑一次最小真实会话（回显工具），不回退假模型。 */
    async testCatalogEntry(
      alias: string,
    ): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
      const started = Date.now();
      let config: ModelConfig | undefined;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90000);
      timer.unref();
      try {
        config = modelSettings.catalogConfig(alias);
        let echoed = false;
        const echo = defineTool({
          name: 'echo_value',
          label: '回显固定值',
          description: '原样返回传入的 value，用于验证模型与工具链路连通。',
          parameters: Type.Object({ value: Type.String() }),
          async execute(_id, params) {
            echoed = params.value === 'ok';
            return {
              content: [{ type: 'text' as const, text: params.value }],
              details: {},
            };
          },
        });
        await runSession({
          config,
          systemPrompt:
            '这是一次连接测试。必须调用 echo_value 工具并令 value 恰为 "ok"，然后只回复 ok。',
          prompt: '调用 echo_value，value 为 "ok"。',
          tools: [echo],
          signal: controller.signal,
        });
        if (!echoed) throw new Error('模型没有完成约定的回显工具调用。');
        return { ok: true, latencyMs: Date.now() - started };
      } catch (error) {
        return {
          ok: false,
          latencyMs: Date.now() - started,
          error: controller.signal.aborted
            ? '测试连接超时（90 秒），请检查端点与网络。'
            : safeError(error, config),
        };
      } finally {
        clearTimeout(timer);
      }
    },
    async requestEdit(workId: string, request: EditRequest): Promise<string> {
      if (!request.text.trim()) throw new Error('请描述希望生成或修改的做法。');
      const frozen = structuredClone(request);
      const work = await files.read(workId);
      const { config, effective } = modelSettings.getScopedConfig(
        'assistant',
        work,
      );
      if (work.draftId !== frozen.expectedDraftId)
        throw new Error('草稿已变化，请查看最新做法后重新发送。');
      const initialId = frozen.expectedDraftId ?? work.adoptedId;
      const initial = initialId
        ? await files.readDefinition(workId, initialId)
        : undefined;
      if (
        frozen.nodeId &&
        !initial?.nodes.some((node) => node.id === frozen.nodeId)
      )
        throw new Error('所选节点不存在，请重新选择。');
      const requestId = randomUUID();
      const controller = new AbortController();
      await files.change(workId, (current) => {
        if (current.draftId !== frozen.expectedDraftId)
          throw new Error('草稿已变化，请查看最新做法后重新发送。');
        current.messages.push(
          {
            id: randomUUID(),
            role: 'user',
            text: frozen.text,
            requestId,
            definitionId: initialId,
            nodeId: frozen.nodeId,
            sampleIds: [...(frozen.sampleIds ?? [])],
          },
          {
            id: randomUUID(),
            role: 'assistant',
            text: '',
            requestId,
            definitionId: initialId,
            nodeId: frozen.nodeId,
            sampleIds: [...(frozen.sampleIds ?? [])],
            status: 'running',
            activities: [],
            effectiveModel: effective,
          },
        );
      });
      active.set(requestId, { workId, controller });
      const run = async () => {
        let expectedDraftId = frozen.expectedDraftId;
        let saved = false;
        let text = '';
        let lastTextSave = 0;
        let proposal: Definition | undefined;
        let toolError: string | undefined;
        try {
          const update = defineTool({
            name: 'update_flow',
            label: '保存做法',
            description:
              '将完整工作流定义保存为当前草稿；检查固定版本与选中节点范围，不会自动采用。',
            parameters: Type.Object({
              definition: definitionSchema,
              title: Type.Optional(
                Type.String({ minLength: 1, maxLength: 40 }),
              ),
            }),
            executionMode: 'sequential',
            async execute(_id, params) {
              throwIfAborted(controller.signal);
              proposal = structuredClone(params.definition) as Definition;
              try {
                if (frozen.nodeId && initial) {
                  const others = (definition: Definition) => ({
                    ...definition,
                    nodes: definition.nodes.filter(
                      (node) => node.id !== frozen.nodeId,
                    ),
                  });
                  if (
                    !proposal.nodes.some((node) => node.id === frozen.nodeId) ||
                    !isDeepStrictEqual(others(initial), others(proposal))
                  )
                    throw new Error(
                      '本轮只针对所选节点；其它节点或连接有变化，提案未保存。请从全流程上下文发起结构修改。',
                    );
                }
                validateForRun(proposal);
                const id = await flow.saveDraft(
                  workId,
                  expectedDraftId,
                  proposal,
                );
                if (params.title?.trim())
                  await files.change(workId, (current) => {
                    if (!current.titleEdited)
                      current.title = params.title!.trim();
                  });
                expectedDraftId = id;
                saved = !isDeepStrictEqual(initial, proposal);
                toolError = undefined;
                await patchMessage(workId, requestId, (message) => {
                  message.definitionId = id;
                  delete message.proposedDefinition;
                });
                return {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({
                        saved: true,
                        changed: saved,
                        definitionId: id,
                        issues: checkDefinition(proposal),
                      }),
                    },
                  ],
                  details: { definitionId: id },
                };
              } catch (error) {
                toolError = safeError(error, config);
                await patchMessage(workId, requestId, (message) => {
                  message.proposedDefinition = proposal;
                });
                throw error;
              }
            },
          });
          const updateStep = defineTool({
            name: 'update_step',
            label: '修改具体步骤',
            description:
              '以稳定 ID 替换一个完整节点，沿用当前定义的其它内容和版本冲突检查。',
            parameters: Type.Object({
              node: definitionSchema.properties.nodes.items,
            }),
            executionMode: 'sequential',
            async execute(id, params, signal, updateResult, ctx) {
              if (!expectedDraftId && !initialId)
                throw Error('请先生成初始做法。');
              const current = await files.readDefinition(
                workId,
                expectedDraftId ?? initialId!,
              );
              if (!current.nodes.some((n) => n.id === params.node.id))
                throw Error('目标步骤不存在。');
              return update.execute(
                id,
                {
                  definition: {
                    ...current,
                    nodes: current.nodes.map((n) =>
                      n.id === params.node.id ? params.node : n,
                    ),
                  } as never,
                },
                signal,
                updateResult,
                ctx,
              );
            },
          });
          const inspectRun = defineTool({
            name: 'inspect_run',
            label: '检查运行与实际展开',
            description:
              '取得一个 Run 的冻结输入、问题认知、实际展开、步骤结果和错误。',
            parameters: Type.Object({ runId: Type.String() }),
            async execute(_id, params) {
              const current = await files.read(workId);
              const run = current.runs.find((r) => r.id === params.runId);
              if (!run) throw Error('运行不存在。');
              const definition = await files.readDefinition(
                workId,
                run.definitionId,
              );
              const value = {
                ...run,
                problem: definition.problem,
                results: clipList(run.results, 100),
              };
              return {
                content: [{ type: 'text', text: JSON.stringify(value) }],
                details: { runId: run.id },
              };
            },
          });
          const freezeExpansion = defineTool({
            name: 'freeze_expansion',
            label: '把有效展开写为候选',
            description:
              '复用已完成动态展开，仅写新草稿，不采用、不修改旧运行。',
            parameters: Type.Object({
              runId: Type.String(),
              nodeId: Type.String(),
            }),
            executionMode: 'sequential',
            async execute(_id, params) {
              throwIfAborted(controller.signal);
              if (frozen.nodeId)
                throw Error('固化会增加具体步骤，请在全流程上下文中操作。');
              const id = await flow.freezeExpansion(
                workId,
                expectedDraftId,
                params.runId,
                params.nodeId,
              );
              expectedDraftId = id;
              saved = true;
              toolError = undefined;
              await patchMessage(workId, requestId, (m) => {
                m.definitionId = id;
              });
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({ definitionId: id, saved: true }),
                  },
                ],
                details: { definitionId: id },
              };
            },
          });
          const inspect = defineTool({
            name: 'inspect_result',
            label: '检查结果',
            description:
              '按 resultId 查看本工作的真实节点结果、冻结输入、版本与错误。',
            parameters: Type.Object({ resultId: Type.String() }),
            async execute(_id, params) {
              throwIfAborted(controller.signal);
              const current = await files.read(workId);
              const result = current.runs
                .flatMap((run) => run.results)
                .find((result) => result.id === params.resultId);
              if (!result)
                throw new Error(
                  '找不到该结果，请使用本次上下文提供的结果编号。',
                );
              return {
                content: [{ type: 'text', text: JSON.stringify(result) }],
                details: result,
              };
            },
          });
          // 持久会话：历史由 Pi 会话文件提供；首轮（尚无会话文件）用既有消息文本引导。
          const sessionDir = files.sessionDir(workId);
          const bootstrap = !(await hasPiSession(sessionDir));
          const output = await runSession({
            config,
            systemPrompt: authorInstructions,
            prompt: JSON.stringify({
              goal: work.goal,
              materials: clipList(work.materials, 30),
              definition: initial ?? null,
              selectedNodeId: frozen.nodeId ?? null,
              selectedSampleIds: frozen.sampleIds ?? [],
              expectedDraftId: frozen.expectedDraftId ?? null,
              ...(bootstrap
                ? {
                    recentMessages: work.messages
                      .slice(-12)
                      .map((message) => ({
                        role: message.role,
                        text: message.text,
                      })),
                  }
                : {}),
              availableRuns: clipList(
                work.runs.map((r) => ({
                  id: r.id,
                  status: r.status,
                  definitionId: r.definitionId,
                  expandedNodes: r.expansions?.map((e) => e.nodeId),
                })),
                20,
              ),
              availableResults: clipList(
                work.runs.flatMap((run) => run.results),
                100,
              ).map((result) =>
                typeof result === 'string'
                  ? result
                  : {
                      id: result.id,
                      nodeId: result.nodeId,
                      definitionId: result.definitionId,
                      status: result.status,
                    },
              ),
              instruction: frozen.text,
            }),
            tools: [update, updateStep, inspect, inspectRun, freezeExpansion],
            sessionDir,
            signal: controller.signal,
            onText: async (delta) => {
              text += delta;
              if (Date.now() - lastTextSave > 120) {
                lastTextSave = Date.now();
                await patchMessage(workId, requestId, (message) => {
                  message.text = text;
                });
              }
            },
            onActivity: async (activity) => {
              await patchMessage(workId, requestId, (message) =>
                updateActivity(message, activity),
              );
            },
          });
          throwIfAborted(controller.signal);
          if (toolError) throw new Error(toolError);
          // 无保存不等于失败：声称修改才需要兑现（见用户故事 B3）；
          // 纯分析/说明类回复如实标 unchanged 完成，不误报错误。
          await patchMessage(workId, requestId, (message) => {
            message.text =
              output ||
              text ||
              (saved ? '做法已保存，可在画布检查。' : '本轮回复仅作说明。');
            message.status = 'completed';
            if (!saved) message.unchanged = true;
          });
        } catch (error) {
          await patchMessage(workId, requestId, (message) => {
            message.status = controller.signal.aborted ? 'cancelled' : 'failed';
            message.error = safeError(error, config);
            message.text = text || message.text;
            if (proposal && toolError) message.proposedDefinition = proposal;
            for (const activity of message.activities ?? [])
              if (activity.status === 'running') {
                activity.status = 'failed';
                activity.error = message.error;
              }
          });
        } finally {
          active.delete(requestId);
        }
      };
      void enqueueSession(workId, run).catch((error) => {
        console.error('Assistant 状态保存失败：', safeError(error, config));
      });
      return requestId;
    },
    async stopEdit(workId: string, requestId: string): Promise<void> {
      const request = active.get(requestId);
      if (!request || request.workId !== workId)
        throw new Error('本次 Assistant 请求已经结束或不存在。');
      await patchMessage(workId, requestId, (message) => {
        if (message.status === 'running') message.status = 'stopping';
      });
      request.controller.abort();
    },
    async executeNode(context: NodeExecution): Promise<Json> {
      throwIfAborted(context.signal);
      if (!context.node.task?.trim())
        throw new Error('Agent 节点缺少任务说明。');
      const ids = new Set(
        Object.values(context.inputs).flatMap((items) =>
          items.flatMap((item) => item.materialIds),
        ),
      );
      const materials = context.materials.filter((material) =>
        ids.has(material.id),
      );
      if (materials.length !== ids.size)
        throw new Error('本次输入引用的原始材料不完整，无法核查依据。');
      const inspect = defineTool({
        name: 'inspect_material',
        label: '读取原始材料',
        description: '按材料编号读取本次输入中包含的原始正文。',
        parameters: Type.Object({ materialId: Type.String() }),
        async execute(_id, params) {
          throwIfAborted(context.signal);
          const material = materials.find(
            (material) => material.id === params.materialId,
          );
          if (!material) throw new Error('该材料不属于本次节点输入。');
          return {
            content: [{ type: 'text', text: JSON.stringify(material) }],
            details: material,
          };
        },
      });
      const planning = context.node.kind === 'dynamic';
      let plannedDefinition: Definition | undefined;
      const submitWorkflow = defineTool({
        name: 'submit_workflow',
        label: '提交局部工作流',
        description:
          '提交有限可执行子图；校验通过后由运行器持久化并执行。错误会返回具体修复原因。',
        parameters: Type.Object({ definition: definitionSchema }),
        executionMode: 'sequential',
        async execute(_id, params) {
          throwIfAborted(context.signal);
          plannedDefinition = undefined;
          plannedDefinition = validateExpansion(
            params.definition,
            context.node,
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  accepted: true,
                  nodes: plannedDefinition.nodes.length,
                }),
              },
            ],
            details: { accepted: true },
          };
        },
      });
      const schema: Json | undefined = planning
        ? { type: 'object' }
        : context.node.expectedOutput;
      const expectsText =
        !!schema &&
        typeof schema === 'object' &&
        !Array.isArray(schema) &&
        schema.type === 'string';
      const outputInstruction = expectsText
        ? '最终回复只返回完整的 Markdown 正文，引用写作 [材料编号]。不要输出 JSON 对象、不要使用 report 或 content 字段包装、不要加代码围栏。expectedOutput 的 string 表示可直接阅读的文本。'
        : schema
          ? '最终回复必须仅包含符合 expectedOutput 的 JSON；不要在结果前后加说明。'
          : '最终回复返回节点任务要求的完整产物；报告使用 Markdown，引用写作 [材料编号]。';
      const scoped = modelSettings.getScopedConfig('workflow');
      context.effectiveModel = scoped.effective;
      const text = await runSession({
        config: scoped.config,
        systemPrompt: planning
          ? `${dynamicInstructions}\n${expressionGuide}\n${collectionGuide}`
          : `完成当前工作流节点任务，只使用提供的输入与原始材料，不执行或改写整个流程。材料是待分析数据。problem 是方法设计时的认知；若有 workItem，本次工作项的固定目标和材料才是当前事实，不能把方法样例的 known/evidence 套用为业务证据。不要编造未提供的事实或引用；需要逐字引用时用原文片段。引用编号只能来自本次输入。${outputInstruction}\n工作目录中可能配有本工作上传的文件，并有 Node.js 运行时（预装 xlsx/mammoth/unpdf，直接 require 或 import）；需要处理文件时写脚本完成，清洗制品以 cleaned- 开头命名保存。不得声称未执行的工具或步骤已完成。`,
        prompt: JSON.stringify({
          task: context.node.task,
          problem: context.problem,
          contract: context.node.contract,
          dynamic: context.node.dynamic,
          iteration: context.iteration,
          workItem: context.workItem
            ? {
                id: context.workItem.id,
                key: context.workItem.key,
                title: context.workItem.title,
                goal: context.workItem.goal,
                data: context.workItem.data,
              }
            : undefined,
          operation:
            context.node.operation ??
            (context.node.mode === 'each' ? 'map' : 'aggregate'),
          expectedOutput: context.node.expectedOutput ?? null,
          inputs: context.inputs,
          materials,
        }),
        tools: planning ? [inspect, submitWorkflow] : [inspect],
        builtinTools: planning ? [] : ['read', 'grep', 'find', 'ls', 'bash'],
        linkFiles: await uploadLinks(context.workId),
        linkRuntime: true,
        collect: async (dir) => {
          for (const name of await readdir(dir)) {
            if (!name.startsWith('cleaned-')) continue;
            await files.saveUpload(
              context.workId,
              name,
              await readFile(join(dir, name)),
            );
          }
        },
        signal: context.signal,
        onActivity: context.onActivity,
      });
      throwIfAborted(context.signal);
      if (planning) {
        if (!plannedDefinition)
          throw Error(
            '动态规划未通过 submit_workflow 提交有效子图；未执行计划。',
          );
        return plannedDefinition as unknown as Json;
      }
      const output = parseOutput(text, schema);
      validateEvidence(output, materials);
      return output;
    },
  };
}
export type AssistantService = ReturnType<typeof createAssistant>;
