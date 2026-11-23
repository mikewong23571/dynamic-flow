import { readRunSamples } from '../work/run-samples.ts';
import {
  callConfigSchema,
  groupByConfigSchema,
} from '../../shared/node-ports.ts';
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
  FlowNode,
  ChatMessage,
  Definition,
  EditRequest,
  Json,
  ModelSelection,
  NodeExecution,
  WorkItemProgressReport,
  WorkItemView,
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
import { parseOutput, validateOutput } from './validation.ts';
import { createModelSettings } from './settings.ts';
import { expressionGuide } from './expression-guide.ts';
import { collectionGuide } from './collection-guide.ts';
import { mcpConfiguration } from './mcp.ts';
import { createStreamText } from './stream-text.ts';

export { runPiSession } from './pi.ts';

export const definitionSchema = Type.Object({
  schemaVersion: Type.Literal(1),
  sourceNode: Type.Optional(
    Type.Object({
      workId: Type.String({ minLength: 1 }),
      definitionId: Type.String({ minLength: 1 }),
      nodeId: Type.String({ minLength: 1 }),
    }),
  ),
  problem: Type.Optional(
    Type.Object({
      framing: Type.String(),
      known: Type.String(),
      unknown: Type.String(),
      constraints: Type.String(),
      evidence: Type.String(),
    }),
  ),
  inputContracts: Type.Optional(
    Type.Record(
      Type.String(),
      Type.Object({
        item: Type.Optional(Type.Any()),
        required: Type.Optional(Type.Boolean()),
        onInvalid: Type.Optional(
          Type.Union([Type.Literal('reject'), Type.Literal('interpret')]),
        ),
      }),
    ),
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
        Type.Literal('create-items'),
        Type.Literal('file'),
        Type.Literal('dynamic'),
        Type.Literal('call'),
      ]),
      call: Type.Optional(
        Type.Unsafe<NonNullable<FlowNode['call']>>(
          callConfigSchema as Record<string, unknown>,
        ),
      ),
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
      tools: Type.Optional(
        Type.Object(
          {
            builtin: Type.Array(
              Type.Union(
                ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write'].map(
                  (name) => Type.Literal(name),
                ),
              ),
            ),
            mcp: Type.Array(
              Type.Union(
                ['websearch', 'sourcegraph', 'cveawg'].map((name) =>
                  Type.Literal(name),
                ),
              ),
            ),
          },
          { additionalProperties: false },
        ),
      ),
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
          Type.Literal('groupBy'),
        ]),
      ),
      inputNames: Type.Optional(Type.Array(Type.String())),
      groupBy: Type.Optional(
        Type.Unsafe<NonNullable<FlowNode['groupBy']>>(
          groupByConfigSchema as Record<string, unknown>,
        ),
      ),
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
  summaryOutput: Type.Optional(
    Type.String({
      description:
        'outputs 中可选的摘要展示绑定；输出合同仍由节点 expectedOutput 明确',
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

const authorInstructions = `业务方法应按后续处理需要输出原始结构化值，集合或列表可以直接作为最终输出，不必生成总结文字。expectedOutput 是节点输出的唯一运行校验合同。可选设置 summaryOutput 为 outputs 中普通 aggregate agent/function 节点的 output 名称，作为摘要展示绑定（不可 repeat/dynamic）；它不引入额外输出schema。需要标准摘要卡片时，可明确在 expectedOutput 声明 {title:非空字符串, summary:非空字符串, scope:非空字符串, metrics?:[{label:非空字符串,value:非空字符串或数字}], limitations?:非空字符串数组, nextAction?:非空字符串} 且不接受其它字段；其它合法输出按原值展示。scope 只描述本轮实际输入范围，不可凭运行成功宣称业务结项，限制和缺口如实说明。可确定的计数和摘要优先使用函数，不为格式化再次调用模型。
你是工作流作者。初次生成流程时请在 update_flow 的 title 字段给出简短中文工作标题（建议 4–12 字），概括本次真实目标，不写 UUID。根据本次目标与材料创建或修改实际可执行的工作流，使用中文回答。
修改类请求必须调用 update_flow 保存实际定义才算完成编辑，不得只说已修改；纯分析或问答可直接回复说明，不要为凑变更保存无关修改。工具失败要说明原因，不得声称已保存。不满足可运行条件的提案会被工具拒绝且不会写入草稿；收到校验错误应修正后再次保存，无法修正时说明未完成事项。
工作流形状由工具 schema 定义，完整定义必须显式包含 schemaVersion:1。保持任务与输出结构简洁，只包含完成目标需要的字段，不为每个字段重复编写 description。仅在用户需要文字报告时，报告节点输出 Markdown 正文，expectedOutput 使用 {"type":"string"}，不为报告建立庞大的嵌套 JSON 结构。普通节点输入端口 input、输出 output；branch 输入 input、输出 matched/unmatched；集合函数的端口和schema见后述规则；merge/collect均明确具名输入。file 来源节点（kind:file, file:{name}）引用工作 uploads 中的文件，无入边、输出 output，下游 agent 节点可在会话中用 Node 运行时（xlsx/mammoth/unpdf 已预装）读取该文件。不存在 $output 虚拟节点，不要向它连线；最终输出只能声明在 outputs 映射中，例如 outputs:{report:["实际节点id","output"]}。外部输入用 ['$input', '<inputs中的名字>']。edges 决定顺序；不允许回连。
operation 明确计算组合：map 对每条输入调用一次，返回一个值（数组也保留为一个值）；flatMap 对每条输入调用一次并将返回数组展开一层；aggregate 一次处理集合。agent与普通function必须显式声明operation，不存在mode字段；concurrency 可设 1–8，默认1。inputSchema/expectedOutput 分别定义单次调用输入/输出，普通 aggregate 输入为数组；merge/collect必须明确inputNames，不隐含端口。新集合函数使用后述具名数组对象输入与固定输出分发规则。函数允许 identity/select-fields/merge/collect/join/expression/groupBy。groupBy按整批集合计算，groupBy:{keys:[[字段路径]]}，输入input，输出每组{key,items}。显式kind:call通过call:{workId,definitionId,inputNames,outputNames,eachPort?}调用保存版本；具名端口与目标方法完全相同，aggregate整体调用，map按eachPort逐项调用、其他端口广播。节点 id 稳定保留，label 写用户能理解的业务名称。
子项阶段成果输入的每项是 {item:{id,key,title,goal,data},outputs:[{source:{workId,runId,resultId,port,index},value:原始产物}]}。每个子项可包含多轮所选产物；不要假设最新轮次覆盖全部范围，不要把摘要与其明细重复计数。按任务显式保持分组或展开value；需要整体列表时可用aggregate函数，无需再调用模型概括，也不自动建立业务子项。
${expressionGuide}
${collectionGuide}
${semanticGuide}
明确拆分业务问题使用 kind:create-items，input → output；上游 Agent 输出候选数组或 {candidates:[...]}，每个候选为 {id,title,goal,inputs:[{label,value}],criteria?:string[],trackingKey?:string,data?:object}，id 在容器内唯一，inputs 保留原始 JSON 值。此节点正式完整工作项运行时在当前项下建立子项，输出每份候选容器的 {source,receipts}（每条 candidateId/status/childId?/error?）；预览只返回候选与拟建结果。普通数组输出不自动建立子项，动态规划不得生成此业务动作；不要让 Agent 自行调用应用 HTTP 或指定其它父项。
持续业务流程可以添加 kind:milestone, milestone:{stage,summary}，输入 input、输出 output，透传输入并记录明确的阶段事实，不能在未验证时声称业务完成。kind:wait, wait:{event,reason,timeoutSeconds?} 持久等待指定外部事件或超时，输入 input、输出 output（原输入）/event（消息或到期信号）。等待适用于正式工作项运行；普通试运行跳过持久等待且不提交业务里程碑。业务完成由工作项完成条件显式确认，不能用最后节点成功代替。
根据目标生成必要步骤，不照搬无关示例。逐条分析与总体产物用清楚分工的节点。明确引用要求应写入相关 task；结构化结果用 expectedOutput JSON Schema，支持 type/object/properties/required/enum/items/minItems；保留原始材料编号。证据结构和引用要求由本次expectedOutput/task明确声明；sourceId/references/evidence等普通字段不隐含本地材料编号或逐字引文语义。
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
    readItemContext?: (itemId: string) => Promise<{
      workItem: import('../../shared/records.ts').WorkItemInput;
      inputs: import('../../shared/records.ts').Inputs;
    }>;
    reportProgress?: (
      id: string,
      report: WorkItemProgressReport,
      signal: AbortSignal,
    ) => Promise<WorkItemView>;
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
      for (const work of await files.list((w) => ({
        id: w.id,
        title: w.title,
        modelSelections: w.modelSelections,
      }))) {
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
    /** interpret 逃生通道的修复环：契约违约输入经 agent 修复为合规裸值；修不出如实抛错。 */
    async repairInvocation(
      workId: string,
      input: {
        port: string;
        schema: Record<string, unknown>;
        errors: string[];
        values: unknown[];
      },
    ): Promise<unknown[]> {
      const work = await files.read(workId);
      const { config } = modelSettings.getScopedConfig('assistant', work);
      const text = await runSession({
        config,
        systemPrompt:
          '你是输入修复器。把不符合输入契约的条目修复为符合契约的值，保持原意、逐条对应、数量不变，不编造内容。只输出 JSON 数组，不要其它文字。',
        prompt: JSON.stringify({
          port: input.port,
          schema: input.schema,
          errors: input.errors,
          values: input.values,
        }),
        tools: [],
        // 修复是无状态单轮，不写入作者的持久会话。
        signal: AbortSignal.timeout(120_000),
      });
      const parsed = parseOutput(text, { type: 'array' });
      if (!Array.isArray(parsed) || parsed.length !== input.values.length)
        throw new Error('修复结果与输入条目数量不一致。');
      return parsed;
    },
    async requestEdit(workId: string, request: EditRequest): Promise<string> {
      if (!request.text.trim()) throw new Error('请描述希望生成或修改的做法。');
      const frozen = structuredClone(request);
      const work = await files.read(workId);
      if (frozen.sampleSource && !frozen.nodeId)
        throw Error('请选择原始输入所属的步骤。');
      const sampleContext = frozen.sampleSource
        ? readRunSamples(work, frozen.sampleSource, frozen.nodeId!)
        : undefined;
      const sampleMaterialIds = new Set(
        Object.values(sampleContext?.inputs ?? {})
          .flat()
          .flatMap((entry) => entry.materialIds),
      );
      const sampleMaterials = sampleContext
        ? work.runs
            .find((run) => run.id === frozen.sampleSource!.runId)!
            .materials.filter((material) => sampleMaterialIds.has(material.id))
        : undefined;
      const itemContext = work.ownerItemId
        ? await options.readItemContext?.(work.ownerItemId)
        : undefined;
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
        const streamText = createStreamText((text) =>
          patchMessage(workId, requestId, (message) => {
            message.text = text;
          }),
        );
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
              goal:
                sampleContext?.workItem?.goal ??
                itemContext?.workItem.goal ??
                work.goal,
              workItem:
                sampleContext?.workItem ?? itemContext?.workItem ?? null,
              selectedInputs:
                sampleContext?.inputs ?? itemContext?.inputs ?? null,
              materials: clipList(
                sampleMaterials ??
                  itemContext?.workItem.materials ??
                  work.materials,
                30,
              ),
              definition: initial ?? null,
              selectedNodeId: frozen.nodeId ?? null,
              selectedSampleIds: frozen.sampleIds ?? [],
              expectedDraftId: frozen.expectedDraftId ?? null,
              ...(bootstrap
                ? {
                    recentMessages: work.messages
                      .filter((message) => !message.conversationId)
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
            mcp: mcpConfiguration('author'),
            sessionDir,
            signal: controller.signal,
            onText: async (delta) => {
              streamText.push(delta);
            },
            onActivity: async (activity) => {
              await patchMessage(workId, requestId, (message) =>
                updateActivity(message, activity),
              );
            },
          });
          throwIfAborted(controller.signal);
          if (toolError) throw new Error(toolError);
          await streamText.finish();
          // 无保存不等于失败：声称修改才需要兑现（见用户故事 B3）；
          // 纯分析/说明类回复如实标 unchanged 完成，不误报错误。
          await patchMessage(workId, requestId, (message) => {
            message.text =
              output ||
              streamText.text ||
              (saved ? '做法已保存，可在画布检查。' : '本轮回复仅作说明。');
            message.status = 'completed';
            if (!saved) message.unchanged = true;
          });
        } catch (error) {
          await streamText.finish().catch(() => {});
          await patchMessage(workId, requestId, (message) => {
            message.status = controller.signal.aborted ? 'cancelled' : 'failed';
            message.error = safeError(error, config);
            message.text = streamText.text || message.text;
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
      const explicitTools = context.node.tools;
      const canReport =
        !planning &&
        !explicitTools &&
        context.node.kind === 'agent' &&
        !!context.workItem &&
        context.effectMode === 'commit' &&
        (context.scope === 'full' ||
          (typeof context.scope === 'object' &&
            context.scope.nodeId === context.node.id)) &&
        !!options.reportProgress;
      const reportProgress = defineTool({
        name: 'report_progress',
        label: '记录工作项进展',
        description:
          '阶段成果、明确阻碍或下一步改变时保存工作项进展。仅记录报告，不代表事实已验证、满足完成条件或结项；不记录读取文件或 token 心跳。省略 nextAction/blocker 会清除上次报告值。',
        parameters: Type.Object({
          stage: Type.String({ minLength: 1 }),
          summary: Type.String({ minLength: 1 }),
          nextAction: Type.Optional(Type.String({ minLength: 1 })),
          blocker: Type.Optional(Type.String({ minLength: 1 })),
          materialIds: Type.Optional(Type.Array(Type.String())),
        }),
        executionMode: 'sequential',
        async execute(toolCallId, params) {
          throwIfAborted(context.signal);
          if (!canReport) throw Error('本次执行不能报告工作项进展。');
          const saved = await options.reportProgress!(
            context.workItem!.id,
            {
              ...params,
              id: JSON.stringify([
                context.runId,
                context.instanceId,
                toolCallId,
              ]),
              source: {
                workId: context.workId,
                runId: context.runId,
                definitionId: context.definitionId,
                nodeId: context.node.id,
                instanceId: context.instanceId,
              },
            },
            context.signal,
          );
          throwIfAborted(context.signal);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  saved: true,
                  stage: saved.stage,
                  summary: saved.summary,
                  revision: saved.revision,
                }),
              },
            ],
            details: { saved: true },
          };
        },
      });
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
      let submitted: { value: Json } | undefined;
      const structured = !planning && !!schema && !expectsText;
      const submitResult = defineTool({
        name: 'submit_result',
        label: '提交节点结果',
        description:
          '提交符合expectedOutput的完整结果；校验错误时按反馈修正后再次提交。',
        parameters: Type.Object({
          result: Type.Unsafe<Json>(
            schema && typeof schema === 'object' && !Array.isArray(schema)
              ? schema
              : {},
          ),
        }),
        async execute(_id, params) {
          throwIfAborted(context.signal);
          validateOutput(params.result as Json, schema!);
          submitted = { value: structuredClone(params.result) as Json };
          return {
            content: [{ type: 'text', text: '结果已接受。' }],
            details: { accepted: true },
          };
        },
      });
      const outputInstruction = expectsText
        ? '最终回复只返回完整的 Markdown 正文。'
        : schema
          ? '通过 submit_result 提交符合 expectedOutput 的完整结果；若工具返回校验错误，修正后重新提交。'
          : '最终回复返回节点任务要求的完整产物；报告使用 Markdown，引用写作 [材料编号]。';
      const scoped = modelSettings.getScopedConfig('workflow');
      context.effectiveModel = scoped.effective;
      const inputTexts = new Set(
        Object.values(context.inputs).flatMap((entries) =>
          entries
            .filter((entry) => typeof entry.value === 'string')
            .map((entry) => entry.value),
        ),
      );
      const promptMaterials = materials.map((material) =>
        inputTexts.has(material.text)
          ? { id: material.id, characters: material.text.length }
          : material,
      );
      const text = await runSession({
        config: scoped.config,
        systemPrompt: planning
          ? `${dynamicInstructions}\n${expressionGuide}\n${collectionGuide}`
          : `你正在执行流水线中的一个节点。task 和 contract 描述本步骤任务，problem 提供方法背景，workItem 提供当前业务目标。根据本次 inputs、原始材料及工具实际取得的证据完成任务。
materials 列出本次输入关联的原始材料；正文已在 inputs 中的条目仅列编号和字符数，${explicitTools ? '其余原文随 materials 提供。' : '完整原文可通过 inspect_material 按编号读取。'}引用原始材料使用 [材料编号]，外部证据保留可定位的来源。
${outputInstruction}${canReport ? '\n业务阶段、明确阻碍或下一步发生变化时，通过 report_progress 记录实际进展。' : ''}
${explicitTools ? '' : '工作目录提供本工作的文件及 Node.js 运行时。需要保存的产物使用 cleaned- 开头的文件名或目录名。'}`,
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
                ...(explicitTools ? {} : { data: context.workItem.data }),
              }
            : undefined,
          operation: context.node.operation,
          expectedOutput: context.node.expectedOutput ?? null,
          inputs: context.inputs,
          materials: promptMaterials,
        }),
        tools: [
          ...(explicitTools
            ? []
            : planning
              ? [inspect, submitWorkflow]
              : canReport
                ? [inspect, reportProgress]
                : [inspect]),
          ...(structured ? [submitResult] : []),
        ],
        builtinTools:
          explicitTools?.builtin ??
          (planning ? [] : ['read', 'grep', 'find', 'ls', 'bash']),
        mcp: planning
          ? undefined
          : mcpConfiguration(
              'node',
              process.env,
              undefined,
              explicitTools?.mcp,
            ),
        linkFiles: explicitTools ? [] : await uploadLinks(context.workId),
        linkRuntime: !explicitTools,
        collect: async (dir) => {
          async function collectFiles(directory: string, prefix = '') {
            for (const entry of await readdir(directory, {
              withFileTypes: true,
            })) {
              if (!prefix && !entry.name.startsWith('cleaned-')) continue;
              const name = prefix + entry.name;
              const path = join(directory, entry.name);
              if (entry.isDirectory()) await collectFiles(path, `${name}__`);
              else if (entry.isFile())
                await files.saveUpload(
                  context.workId,
                  name,
                  await readFile(path),
                );
            }
          }
          await collectFiles(dir);
        },
        signal: context.signal,
        onActivity: context.onActivity,
      });
      context.rawOutput = text;
      throwIfAborted(context.signal);
      if (planning) {
        if (!plannedDefinition)
          throw Error(
            '动态规划未通过 submit_workflow 提交有效子图；未执行计划。',
          );
        return plannedDefinition as unknown as Json;
      }
      if (submitted) return submitted.value;
      const output = parseOutput(text, schema);
      return output;
    },
  };
}
export type AssistantService = ReturnType<typeof createAssistant>;
