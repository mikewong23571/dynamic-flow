import {
  openuiInstructions,
  openuiContract,
  validateOpenUIProgram,
  type OpenUIFocus,
} from '../../shared/openui.ts';
import { randomUUID } from 'node:crypto';
import { createStreamText } from './stream-text.ts';
import {
  resolveMethodReferences,
  methodReferenceGuide,
} from './method-references.ts';
import {
  beginItemConversationTurn,
  createItemConversation,
  itemConversationDirectory,
  requireItemConversation,
} from './item-conversations.ts';
import { Type } from '@earendil-works/pi-ai';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { resolveItemInputs } from '../work-items/run-inputs.ts';
import type {
  Activity,
  ChatMessage,
  Definition,
  Json,
} from '../../shared/records.ts';
import type { FileStore } from '../files/index.ts';
import { expressionGuide } from './expression-guide.ts';
import { collectionGuide } from './collection-guide.ts';
import { definitionSchema } from './index.ts';
import { createModelSettings } from './settings.ts';
import { safeError } from './config.ts';
import { runPiSession, throwIfAborted, type SessionRunner } from './pi.ts';
import type { createItemComposition } from '../work-items/composition.ts';

type Composition = ReturnType<typeof createItemComposition>;
export const workItemFlowGuide = `Definition根输入不是节点。inputs声明端口名，例如inputs:["materials"]；外部输入边必须from:["$input","materials"]，连接到真实节点端口to:["step","input"]。中间边from:["step","output"]；outputs:{result:["step","output"]}映射最终节点输出。不要创建名为materials的假节点，也不要把输入变成file节点；file只用于真实已上传文件。
最小无领域图例：{schemaVersion:1,inputs:["materials"],nodes:[{id:"step",label:"保留输入",kind:"function",functionName:"identity",operation:"map"}],edges:[{from:["$input","materials"],to:["step","input"]}],outputs:{result:["step","output"]}}。这只是端口接线例子，实际步骤按用户目标设计。
先check_flow并save_flow保存真实根输入及inputContracts，再select_inputs绑定已有原材料或add_input提交声明端口的新值。add_input不能写到尚未保存的端口。原材料value是文本字符串；add_input每次保存一个JSON值，数组仍是一条输入。map/flatMap节点消费单值，aggregate消费数组，节点运行不能把输入包装元数据当value字段。`;
export const workItemSystemPrinciples = `系统准则
你在一个持续业务工作系统内协助用户。系统提供业务身份、材料与来源、可保存的处理方法、真实执行、进展及成果、可交互的业务界面；你负责在这些能力内组织当前工作。

一、工作以业务目标为中心。工作项承载持续身份、目标、材料、完成要求与历史，方法是推进它的手段，一次执行是具体尝试。按当前问题选择最少且足够的步骤；复用方法不共享业务材料，拆分工作应有独立业务责任。
二、业务事实由系统持有。输入、执行、阶段结果、来源和完成依据通过真实读取与业务命令取得。方法、界面和聊天各有职责：决定业务结果的处理进入方法和运行器，界面可按真实数据筛选、汇总并组织阅读与参与，聊天承担协商和判断。界面状态与文字不能替代业务事实，后来修改不改写已发生的运行。
三、具体业务组织由你负责。根据目标、实际材料和当前进展决定如何处理、用户关心什么、如何呈现成果、何处需要参与。系统不预定各业务的字段、页面数量、图表或操作顺序；存储对象与工具分类不必逐项映射成页面。只安排当前有用的内容与能力，不为填满界面或假设未来需求增加结构。
四、推进需要可感知、可参与。用户应能理解当前工作的实际情况、已获得的内容和需要自己处理的事，并能在相关上下文中采取有效行动。你同时设计处理方法及其观察/参与方式；具体呈现由本项需要决定。变化的事实由真实数据更新，普通阅读不依赖模型反复改写界面。
五、动作与结果必须闭环。改变方法、提交材料、执行和交接使用系统已有命令，并读取回执确认实际影响。遵循用户已给授权与选择；读取、预览和刷新本身不推进业务。失败、等待、缺口和冲突保留真实含义，说明需要的下一步，不能用显示成功掩盖。
六、成果与完成分别判断。实际产物可在处理中观察，固定交付必须保留明确来源；界面产生、运行成功和交付存在均不等于业务完成。完成条件按真实依据由人确认，未确认与未知如实保留。能力不足时指出具体缺口，不在界面或聊天中模拟业务已实现。

以下能力说明提供上述边界内的具体用法，不规定每项工作的页面模板。`;

export const workItemInstructions = `${workItemSystemPrinciples}

能力使用说明
先inspect_work_item读取实际材料、定义、输入绑定、界面和Run；用find_methods/inspect_method发现并固定引用已有方法。人和Assistant修改同一Definition。
${workItemFlowGuide}
确定性处理用function。save_flow保存处理关系；select_inputs选择原材料；bind_inputs保存精确material/result/received/child/completion引用；add_input提交补充。普通节点operation=map/flatMap/aggregate；call只用map/aggregate，call.map用eachPort明确逐项端口，其他端口广播。计划的problem和节点contract说明实际职责与产物。
业务进展跨Run/子项，需要保存的阶段使用milestone/report_progress。读取当前明确绑定输入使用read_inputs，不统计receivedInputs历史充当当前范围；读取workspace、子项、固定Run阶段产物和交付的具体合同由describe_capabilities提供。
涉及界面安排的每一轮先describe_capabilities取得当前同源OpenUI组件/工具说明，再check_ui_program并save_ui_program。source是唯一当前安排，局部修改用update_ui_program具名patch。字段和表单采用本业务名称，inputContracts用户字段提供可读title。具体组件由阅读/操作需要选择，不为覆盖能力目录逐一放进页面。
每个写工具传最新baseRevision；save_flow传expectedDraftId；保存界面传definitionId；修改已有界面时expectedProgramId取inspect_work_item返回的uiProgram.id，首次保存时省略expectedProgramId。冲突读回不覆盖。uiFocus为用户关注的已保存声明，优先局部修改，不因此重规划或运行。
检查使用check_flow/check_workspace。execute只启动，inspect_run确认终态；发布固定交付时对明确成功commit的runId/output调用publish_delivery并读回检查，不把发布当作观察阶段产物的前提。失败输入补跑为新commit，旧Run保持；旧/新成功显式选来源汇合。等待signal、中断resume继续原固定Run。
continue_records仅准备明确下一轮输入，不自动执行；子项阶段成果显式发现/预览/选择，默认直属，跨层scope=descendants，保留精确Run/result/port/index。完成要求可由你定义，实际依据确认和结项由人操作。
OpenUI语言说明只用于工具source/patch参数，不在聊天重复源码或大段技术交接。最终回复简述实际已保存/执行的工作、未解决事项与下一步。`;

export function createWorkItemAssistant(
  files: FileStore,
  composition: Composition,
  dispatch: (id: string, b: Record<string, unknown>) => Promise<unknown>,
  options: {
    settingsPath: string;
    catalogPath: string;
    runSession?: SessionRunner;
  },
) {
  const settings = createModelSettings(
      options.settingsPath,
      options.catalogPath,
    ),
    runner = options.runSession ?? runPiSession;
  const active = new Map<
    string,
    { workId: string; controller: AbortController }
  >();
  const queues = new Map<string, Promise<unknown>>();
  const patch = (
    workId: string,
    requestId: string,
    edit: (m: ChatMessage) => void,
  ) =>
    files.change(workId, (w) => {
      const message = w.messages.find(
        (m) => m.role === 'assistant' && m.requestId === requestId,
      );
      if (!message) throw Error('会话消息不存在。');
      edit(message);
      const conversation = w.assistantConversations?.find(
        (entry) => entry.id === message.conversationId,
      );
      if (conversation) conversation.updatedAt = new Date().toISOString();
    });
  async function context(id: string) {
    const ws = await composition.snapshot(id),
      current = ws.work?.work;
    return {
      uiProgram: ws.uiProgram ?? null,
      item: {
        ...ws.item,
        materials: ws.item.materials.slice(0, 10).map((m) => ({
          ...m,
          text: m.text.slice(0, 2000),
          characters: m.characters ?? m.text.length,
        })),
        materialCount: ws.item.materials.length,
        receivedInputs: ws.item.receivedInputs
          ?.slice(-10)
          .map((i) => ({ id: i.id, label: i.label, source: i.source })),
        history: ws.item.history.slice(-6).map((h) => ({
          id: h.id,
          kind: h.kind,
          summary: h.summary,
          at: h.at,
        })),
      },
      work: current
        ? {
            id: current.id,
            draftId: current.draftId,
            adoptedId: current.adoptedId,
            definition:
              ws.work!.definitions[current.draftId ?? current.adoptedId ?? ''],
            runs: current.runs.slice(-10).map((r) => ({
              id: r.id,
              status: r.status,
              definitionId: r.definitionId,
              error: r.error,
              resultCount: r.results.length,
              results: r.results.slice(0, 20).map((x) => ({
                id: x.id,
                nodeId: x.nodeId,
                status: x.status,
                error: x.error,
                ports: Object.keys(x.outputs),
              })),
            })),
            runCount: current.runs.length,
          }
        : undefined,
      methodCount: ws.methods.length,
      methodsHasMore: ws.methods.length > 30,
      methods: ws.methods.slice(0, 30).map(({ definition, ...m }) => m),
      uploads: ws.uploads,
      deliveries: ws.deliveries?.map(({ rows, value, sources, ...d }) => ({
        ...d,
        rows: rows?.slice(0, 3),
        rowCount: rows?.length,
      })),
      note: '材料和运行列表为预览；完整材料和成果使用read_artifact按ID/来源读取。',
    };
  }
  async function request(
    id: string,
    text: string,
    selection: {
      nodeId?: string;
      expectedDraftId?: string;
      uiFocus?: OpenUIFocus;
      conversationId?: string;
      methodReferences?: unknown;
    } = {},
  ) {
    if (typeof text !== 'string' || !text.trim())
      throw Error('请说明本次希望推进的工作。');
    await composition.init(id);
    const initial = await composition.snapshot(id),
      work = initial.work!.work;
    const conversation = requireItemConversation(
      work,
      selection.conversationId,
    );
    if (
      selection.expectedDraftId !== undefined &&
      selection.expectedDraftId !== work.draftId
    )
      throw Object.assign(Error('草稿已变化，请读取最新流程后发送。'), {
        code: 'REVISION_CONFLICT',
      });
    const selectedNode = selection.nodeId
      ? initial.work!.definitions[
          work.draftId ?? work.adoptedId ?? ''
        ]?.nodes.find((n) => n.id === selection.nodeId)
      : undefined;
    if (selection.nodeId && !selectedNode)
      throw Error('所选步骤已不存在，请重新选择。');
    if (selection.uiFocus) {
      const program = initial.uiProgram;
      if (!program || program.id !== selection.uiFocus.programId)
        throw Object.assign(Error('界面安排已变化，请重新选择关注对象。'), {
          code: 'UI_PROGRAM_STALE',
        });
      if (
        !validateOpenUIProgram(program.source).statements.includes(
          selection.uiFocus.block,
        )
      )
        throw Error('所选界面声明不存在。');
    }
    const referencedMethods = resolveMethodReferences(
      selection.methodReferences,
      await composition.methods(),
    );
    const methodReferences = referencedMethods.map(
      ({ workId, definitionId, title }) => ({ workId, definitionId, title }),
    );
    const { config, effective } = settings.getScopedConfig('assistant', work);
    const requestId = randomUUID(),
      controller = new AbortController();
    await files.change(work.id, (w) => {
      beginItemConversationTurn(w, conversation.id, text);
      const createdAt = new Date().toISOString();
      w.messages.push(
        {
          id: randomUUID(),
          role: 'user',
          conversationId: conversation.id,
          createdAt,
          text: text.trim(),
          ...(methodReferences.length ? { methodReferences } : {}),
          requestId,
          nodeId: selection.nodeId,
        },
        {
          id: randomUUID(),
          role: 'assistant',
          conversationId: conversation.id,
          createdAt,
          text: '',
          status: 'running',
          activities: [],
          requestId,
          effectiveModel: effective,
        },
      );
    });
    active.set(requestId, { workId: work.id, controller });
    const perform = async () => {
      const streamText = createStreamText((text) =>
        patch(work.id, requestId, (m) => {
          m.text = text;
        }),
      );
      try {
        throwIfAborted(controller.signal);
        const result = (value: any) => {
          if (value?.work?.work && value.item) {
            const w = value.work.work;
            value = {
              item: {
                id: value.item.id,
                revision: value.item.revision,
                status: value.item.status,
                stage: value.item.stage,
                inputBindings: value.item.inputBindings,
              },
              work: {
                id: w.id,
                draftId: w.draftId,
                adoptedId: w.adoptedId,
                runs: w.runs.slice(-3).map((r: any) => ({
                  id: r.id,
                  status: r.status,
                  definitionId: r.definitionId,
                })),
              },
              deliveries: value.deliveries?.map(
                (delivery: { id: string; output: string; runId: string }) => ({
                  id: delivery.id,
                  output: delivery.output,
                  runId: delivery.runId,
                }),
              ),
              uiProgram: value.uiProgram,
              savedWorkId: value.savedWorkId,
            };
          }
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(value) }],
            details: value,
          };
        };
        const make = (
          name: string,
          description: string,
          parameters: any,
          execute: (params: any) => Promise<unknown>,
        ) =>
          defineTool({
            name,
            label: description,
            description,
            parameters,
            executionMode: 'sequential',
            async execute(_callId, params) {
              throwIfAborted(controller.signal);
              try {
                return result(await execute(params));
              } catch (e) {
                throw Error(
                  JSON.stringify({
                    error: safeError(e, config),
                    ...('code' in Object(e) ? { code: (e as any).code } : {}),
                    ...('issues' in Object(e)
                      ? { issues: (e as any).issues }
                      : {}),
                  }),
                );
              }
            },
          });
        const base = { baseRevision: Type.Integer({ minimum: 0 }) };
        const childSelection = Type.Object({
          kind: Type.Literal('child-results'),
          scope: Type.Optional(
            Type.Union([Type.Literal('children'), Type.Literal('descendants')]),
          ),
          itemId: Type.String(),
          sources: Type.Array(
            Type.Object({
              workId: Type.String(),
              runId: Type.String(),
              resultId: Type.String(),
              port: Type.String(),
              index: Type.Integer({ minimum: 0 }),
            }),
            { minItems: 1 },
          ),
        });
        const tools = [
          make(
            'describe_capabilities',
            '读取真实流程和OpenUI组件/交互合同',
            Type.Object({}),
            async () => ({
              systemPrinciples: workItemSystemPrinciples,
              definitionSchema,
              flowGuide: workItemFlowGuide,
              openuiInstructions,
              openuiSchema: openuiContract.toJSONSchema(),
              expressionGuide,
              collectionGuide,
              inputUnits:
                'add_input每次保存一个JSON值；数组仍是一条输入。map/flatMap接收一条，aggregate接收值数组。call/集合输入为具名端口数组对象。',
            }),
          ),
          make(
            'inspect_work_item',
            '读取工作项真实材料、当前流程、修订、运行及交付',
            Type.Object({}),
            () => context(id),
          ),
          make(
            'find_methods',
            '按用途查找可复用流水线与保存版本合同',
            Type.Object({
              query: Type.Optional(Type.String()),
              offset: Type.Optional(Type.Integer({ minimum: 0 })),
              limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 30 })),
            }),
            async (p) => {
              const methods = await composition.methods(p.query);
              const offset = p.offset ?? 0,
                limit = p.limit ?? 30;
              return {
                total: methods.length,
                offset,
                limit,
                hasMore: offset + limit < methods.length,
                methods: methods
                  .slice(offset, offset + limit)
                  .map(({ definition, ...m }) => m),
              };
            },
          ),
          make(
            'inspect_method',
            '读取指定保存版本的完整定义、端口与schema',
            Type.Object({ workId: Type.String(), definitionId: Type.String() }),
            async (p) => {
              const methods = await composition.methods();
              const method = methods.find(
                (m) =>
                  m.workId === p.workId && m.definitionId === p.definitionId,
              );
              if (!method) throw Error('方法目录中没有此保存版本。');
              return method;
            },
          ),
          make(
            'check_flow',
            '检查未完成的流程草案，返回字段问题；不保存或执行',
            Type.Object({ definition: Type.Any() }),
            async (p) => {
              const checked = await composition.check(id, p.definition);
              return { ...checked, flowGuide: workItemFlowGuide };
            },
          ),
          make(
            'check_workspace',
            '只读联合检查方案、真实输入、界面和指定运行；分别报告能否执行、发布及未验证项',
            Type.Object({
              definition: Type.Optional(Type.Any()),
              source: Type.Optional(Type.String()),
              runId: Type.Optional(Type.String()),
            }),
            (p) => composition.checkWorkspace(id, p),
          ),
          make(
            'inspect_item_scope',
            '分页读取本项有效后代的业务身份与实际运行状态；只读，不调度或采用结果',
            Type.Object({
              page: Type.Optional(Type.Integer({ minimum: 1 })),
              pageSize: Type.Optional(
                Type.Integer({ minimum: 1, maximum: 50 }),
              ),
            }),
            (p) => composition.itemScope(id, p.page, p.pageSize),
          ),
          make(
            'inspect_child_outputs',
            '分页发现正式阶段成果与精确来源；默认直属，scope=descendants显式读取有效后代，不自动选择最新结果',
            Type.Object({
              nodeId: Type.Optional(Type.String()),
              scope: Type.Optional(
                Type.Union([
                  Type.Literal('children'),
                  Type.Literal('descendants'),
                ]),
              ),
              offset: Type.Optional(Type.Integer({ minimum: 0 })),
              limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
            }),
            (p) =>
              composition.childOutputs(
                id,
                p.offset,
                p.limit,
                p.scope,
                p.nodeId,
              ),
          ),
          make(
            'preview_child_output',
            '读取明确子项阶段来源的实际输入包装与值；结果按文本分页，不执行',
            Type.Object({
              selection: childSelection,
              offset: Type.Optional(Type.Integer({ minimum: 0 })),
              limit: Type.Optional(
                Type.Integer({ minimum: 1, maximum: 20000 }),
              ),
            }),
            async (p) => {
              const preview = await composition.previewChildOutput(
                id,
                p.selection,
              );
              const text = JSON.stringify(preview.value);
              const offset = p.offset ?? 0;
              return {
                characters: text.length,
                offset,
                text: text.slice(offset, offset + (p.limit ?? 10000)),
                note: '这是一个{item,outputs}输入值，不是直接展开的记录清单。',
              };
            },
          ),
          make(
            'select_child_outputs',
            '将明确子项阶段来源绑定到输入入口；保留固定来源，不复制业务值、不执行',
            Type.Object({
              ...base,
              inputPort: Type.String(),
              selections: Type.Array(childSelection, { minItems: 1 }),
            }),
            (p) =>
              composition.selectChildOutputs(
                id,
                p.baseRevision,
                p.inputPort,
                p.selections,
              ),
          ),
          make(
            'save_flow',
            '保存工作项组合流程，与画布共用业务入口',
            Type.Object({
              ...base,
              expectedDraftId: Type.Optional(Type.String()),
              definition: definitionSchema,
            }),
            (p) => dispatch(id, { action: 'saveFlow', ...p }),
          ),
          make(
            'select_inputs',
            '将本工作项已有原文直接绑定到输入入口，保留真实来源',
            Type.Object({
              ...base,
              inputPort: Type.String(),
              materialIds: Type.Array(Type.String(), { minItems: 1 }),
            }),
            (p) => dispatch(id, { action: 'selectInputs', ...p }),
          ),
          make(
            'add_input',
            '按保存入口合同补充或修订一条输入，保留原值',
            Type.Object({
              ...base,
              inputPort: Type.String(),
              label: Type.String(),
              value: Type.Any(),
              inputId: Type.Optional(Type.String()),
              materialIds: Type.Optional(Type.Array(Type.String())),
            }),
            (p) =>
              dispatch(id, {
                action: p.inputId ? 'reviseInput' : 'addInput',
                ...p,
              }),
          ),
          make(
            'bind_inputs',
            '明确绑定全部端口的固定来源引用，不复制正文',
            Type.Object({
              ...base,
              inputBindings: Type.Record(Type.String(), Type.Array(Type.Any())),
            }),
            (p) => dispatch(id, { action: 'bindInputs', ...p }),
          ),
          make(
            'execute',
            '启动已保存的当前工作项流程',
            Type.Object({ ...base }),
            (p) => dispatch(id, { action: 'run', ...p }),
          ),
          make(
            'stop_execution',
            '停止本工作项明确的一轮执行及调用',
            Type.Object({ ...base, runId: Type.String() }),
            (p) => dispatch(id, { action: 'stop', ...p }),
          ),
          make(
            'resume_execution',
            '恢复本工作项明确中断的执行',
            Type.Object({ ...base, runId: Type.String() }),
            (p) => dispatch(id, { action: 'resume', ...p }),
          ),
          make(
            'signal_execution',
            '向明确等待投递已声明事件；同eventId重试去重',
            Type.Object({
              ...base,
              runId: Type.String(),
              eventId: Type.String(),
              name: Type.String(),
              payload: Type.Optional(Type.Any()),
            }),
            (p) => dispatch(id, { action: 'signal', ...p }),
          ),
          make(
            'inspect_run',
            '分页读取本工作项运行的实例状态、输出预览与精确来源',
            Type.Object({
              runId: Type.String(),
              workId: Type.Optional(Type.String()),
              offset: Type.Optional(Type.Integer({ minimum: 0 })),
              limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 30 })),
            }),
            async (p) => {
              const snapshot = await composition.snapshot(id);
              const work = await files.read(p.workId ?? snapshot.work!.work.id),
                run = work.runs.find((r) => r.id === p.runId);
              if (!run || run.workItem?.id !== id)
                throw Error('本工作项没有此运行。');
              let root = run,
                rootWorkId = work.id;
              const seen = new Set<string>();
              while (root.parentCall) {
                const parent = root.parentCall;
                if (seen.has(parent.runId)) throw Error('运行关联循环。');
                seen.add(parent.runId);
                rootWorkId = parent.workId;
                const found = (await files.read(parent.workId)).runs.find(
                  (r) => r.id === parent.runId,
                );
                if (!found) throw Error('父运行不存在。');
                root = found;
              }
              if (
                !snapshot.item.runs.some(
                  (ref) => ref.workId === rootWorkId && ref.runId === root.id,
                )
              )
                throw Error('运行未关联到本工作项。');
              return {
                id: run.id,
                status: run.status,
                error: run.error,
                waits: run.waits,
                total: run.results.length,
                results: run.results
                  .slice(p.offset ?? 0, (p.offset ?? 0) + (p.limit ?? 10))
                  .map((r) => ({
                    id: r.id,
                    nodeId: r.nodeId,
                    instanceId: r.instanceId,
                    status: r.status,
                    error: r.error,
                    call: r.call,
                    inputCount: Object.values(r.input).flat().length,
                    outputs: Object.fromEntries(
                      Object.entries(r.outputs).map(([port, values]) => [
                        port,
                        values.slice(0, 3).map((v, index) => ({
                          source: {
                            workId: work.id,
                            runId: run.id,
                            resultId: r.id,
                            port,
                            index,
                          },
                          preview: JSON.stringify(v.value).slice(0, 1200),
                          characters: JSON.stringify(v.value).length,
                        })),
                      ]),
                    ),
                  })),
              };
            },
          ),
          make(
            'read_artifact',
            '按材料编号或精确产物引用读取真实内容，可分段读取长文本',
            Type.Object({
              materialId: Type.Optional(Type.String()),
              source: Type.Optional(
                Type.Object({
                  workId: Type.String(),
                  runId: Type.String(),
                  resultId: Type.String(),
                  port: Type.String(),
                  index: Type.Integer({ minimum: 0 }),
                }),
              ),
              offset: Type.Optional(Type.Integer({ minimum: 0 })),
              limit: Type.Optional(
                Type.Integer({ minimum: 1, maximum: 20000 }),
              ),
            }),
            async (p) => {
              const item = await composition.rawItem(id);
              let value: unknown;
              if (p.materialId) {
                const material = item.materials.find(
                  (m) => m.id === p.materialId,
                );
                if (!material) throw Error('材料不属于当前工作项。');
                value = material.text;
              } else if (p.source) {
                const resolved = await resolveItemInputs(
                  item,
                  { input: [{ kind: 'result', source: p.source }] },
                  files,
                );
                value = resolved.inputs.input[0].value;
              } else throw Error('请选择材料编号或精确成果来源。');
              const text =
                typeof value === 'string' ? value : JSON.stringify(value);
              const offset = p.offset ?? 0,
                limit = p.limit ?? 12000;
              return {
                text: text.slice(offset, offset + limit),
                characters: text.length,
                offset,
                hasMore: offset + limit < text.length,
              };
            },
          ),
          make(
            'check_ui_program',
            '检查完整原生OpenUI程序，不保存或执行',
            Type.Object({ source: Type.String() }),
            async (p) => {
              const parsed = validateOpenUIProgram(p.source);
              return {
                valid: true,
                records: parsed.records,
                outputs: parsed.outputs,
                statements: parsed.statements,
              };
            },
          ),
          make(
            'save_ui_program',
            '保存完整OpenUI程序，界面保存不执行业务',
            Type.Object({
              ...base,
              definitionId: Type.String(),
              expectedProgramId: Type.Optional(
                Type.String({
                  minLength: 1,
                  description:
                    '已有界面的uiProgram.id；首次保存尚无界面时省略此字段。',
                }),
              ),
              source: Type.String(),
            }),
            (p) => dispatch(id, { action: 'saveUiProgram', ...p }),
          ),
          make(
            'update_ui_program',
            '按原生OpenUI具名patch局部修改，保留无关声明',
            Type.Object({
              ...base,
              definitionId: Type.String(),
              expectedProgramId: Type.String(),
              patch: Type.String(),
            }),
            (p) => dispatch(id, { action: 'saveUiProgram', ...p }),
          ),
          make(
            'publish_delivery',
            '把明确输出绑定到实际成功正式Run和保存的OpenUI程序',
            Type.Object({
              ...base,
              runId: Type.String(),
              output: Type.String(),
              programId: Type.String(),
            }),
            (p) => dispatch(id, { action: 'publishDelivery', ...p }),
          ),
          make(
            'continue_failed_inputs',
            '仅补跑明确失败输入，新建正式Run，原失败Run保持历史',
            Type.Object({
              ...base,
              workId: Type.Optional(Type.String()),
              runId: Type.String(),
              resultIds: Type.Array(Type.String(), { minItems: 1 }),
            }),
            (p) => dispatch(id, { action: 'continueFailedInputs', ...p }),
          ),
          make(
            'set_completion_requirements',
            '定义本工作项完成要求，保持未确认；不代替用户验收',
            Type.Object({
              ...base,
              requirements: Type.Array(
                Type.Object({ id: Type.String(), text: Type.String() }),
              ),
            }),
            (p) =>
              dispatch(id, {
                action: 'criteria',
                baseRevision: p.baseRevision,
                criteria: p.requirements.map((entry: any) => ({
                  ...entry,
                  met: false,
                  evidence: '',
                })),
              }),
          ),
          make(
            'continue_records',
            '选取真实交付记录准备下一轮输入',
            Type.Object({
              ...base,
              deliveryId: Type.String(),
              recordIds: Type.Array(Type.String(), { minItems: 1 }),
              inputPort: Type.Optional(Type.String()),
              methodId: Type.Optional(Type.String()),
              methodDefinitionId: Type.Optional(Type.String()),
              draft: Type.Optional(Type.Record(Type.String(), Type.Any())),
              recordField: Type.Optional(Type.String()),
            }),
            (p) => dispatch(id, { action: 'continueRecords', ...p }),
          ),
          make(
            'save_method',
            '将已保存私有处理流程提取为可复用流水线',
            Type.Object({
              ...base,
              title: Type.String({ minLength: 1, maxLength: 80 }),
            }),
            (p) => dispatch(id, { action: 'saveMethod', ...p }),
          ),
        ];
        const output = await runner({
          config,
          systemPrompt:
            workItemInstructions +
            '\n' +
            expressionGuide +
            '\n' +
            collectionGuide +
            '\n' +
            methodReferenceGuide,
          prompt: JSON.stringify({
            instruction: text,
            referencedMethods,
            uiFocus: selection.uiFocus,
            selectedContext: selectedNode
              ? {
                  node: selectedNode,
                  definitionId: work.draftId ?? work.adoptedId,
                  note: '这是关注对象上下文，保存仍是完整流程；保留不相关步骤。',
                }
              : undefined,
            workspace: await context(id),
          }),
          tools,
          sessionDir: itemConversationDirectory(
            files.sessionDir(work.id),
            conversation.id,
          ),
          signal: controller.signal,
          builtinTools: ['read', 'grep', 'find', 'ls'],
          linkFiles: (await files.listUploads(work.id)).map((name) => ({
            path: files.uploadPath(work.id, name),
            as: name,
          })),
          onText: async (delta) => {
            streamText.push(delta);
          },
          onActivity: async (activity: Activity) => {
            await patch(work.id, requestId, (m) => {
              m.activities ??= [];
              const index = m.activities.findIndex((a) => a.id === activity.id);
              if (index < 0) m.activities.push(activity);
              else m.activities[index] = activity;
            });
          },
        });
        throwIfAborted(controller.signal);
        await streamText.finish();
        await patch(work.id, requestId, (m) => {
          m.text =
            output || streamText.text || '本轮已结束，请检查保存的流程及结果。';
          m.status = 'completed';
        });
      } catch (error) {
        await streamText.finish().catch(() => {});
        await patch(work.id, requestId, (m) => {
          m.status = controller.signal.aborted ? 'cancelled' : 'failed';
          m.error = safeError(error, config);
          m.text = streamText.text || m.text;
        });
      } finally {
        active.delete(requestId);
      }
    };
    const pending = (queues.get(work.id) ?? Promise.resolve())
      .catch(() => {})
      .then(perform);
    queues.set(work.id, pending);
    void pending
      .finally(() => {
        if (queues.get(work.id) === pending) queues.delete(work.id);
      })
      .catch(() => {});
    return { requestId, conversationId: conversation.id };
  }
  async function stop(id: string, requestId: string) {
    const item = await composition.snapshot(id),
      current = active.get(requestId);
    if (!current || current.workId !== item.work?.work.id)
      throw Error('此Assistant请求已结束或不存在。');
    await patch(current.workId, requestId, (m) => {
      m.status = 'stopping';
    });
    current.controller.abort();
  }
  async function createConversation(id: string) {
    const ws = await composition.init(id);
    let conversationId = '';
    await files.change(ws.work!.work.id, (work) => {
      conversationId = createItemConversation(work).id;
    });
    return { ...(await composition.snapshot(id)), conversationId };
  }
  return { request, stop, createConversation };
}
