import { materializeDefinition } from '../../shared/expansion.ts';
import { validateExpansion } from '../flow/expansion.ts';
import {
  collectionFunction,
  nodeInputPorts,
  nodeOutputPorts,
  nodeOperation,
} from '../../shared/node-ports.ts';
export { nodeInputPorts } from '../../shared/node-ports.ts';
import { executeCollection, namedValues } from './collections.ts';
import { invocationBatches, invocationValue } from './invocation.ts';
import { isDeepStrictEqual } from 'node:util';
import { parseCandidates } from '../../shared/workitem-candidates.ts';
import { randomUUID } from 'node:crypto';
import type { FileStore } from '../files/index.ts';
import { validateValue } from '../flow/schema.ts';
import { evaluateExpression } from '../flow/expressions.ts';
import { validateForRun } from '../flow/index.ts';
import { validateCallReferences } from '../flow/calls.ts';
import { validateInvocation } from '../flow/contracts.ts';
import type {
  CandidateSource,
  ChildCreationReceipt,
  Definition,
  FlowNode,
  Inputs,
  InputItem,
  Json,
  NodeExecution,
  NodeResult,
  OutputReference,
  Run,
  WorkItemInput,
  Work,
  StartRun,
} from '../../shared/records.ts';
const now = () => new Date().toISOString();
const copy = <T>(value: T): T => structuredClone(value);
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const items = (inputs: Inputs) => Object.values(inputs).flat();
function field(value: Json, path: string): Json | undefined {
  if (!path) return value;
  return path
    .split('.')
    .reduce<Json | undefined>(
      (v, k) =>
        v && typeof v === 'object' && !Array.isArray(v) ? v[k] : undefined,
      value,
    );
}
export function validateInputs(inputs: Inputs, ports: string[]) {
  for (const p of ports)
    if (!Array.isArray(inputs[p]))
      throw Error(`缺少输入端口 ${p}，请选择材料或已有结果。`);
  for (const [p, list] of Object.entries(inputs)) {
    if (!ports.includes(p))
      throw Error(`不支持输入端口 ${p}，需要 ${ports.join('、')}。`);
    for (const i of list) {
      if (i.contentUrl)
        throw Error('输入正文尚未加载，请使用固定来源选择原始输入。');
      if (
        !i.sampleId ||
        !Array.isArray(i.materialIds) ||
        !Array.isArray(i.sourceResultIds) ||
        i.value === undefined
      )
        throw Error('输入项缺少内容或来源。');
    }
  }
}
export interface RunHooks {
  onCreateItems?: (
    parentId: string,
    source: CandidateSource,
    signal: AbortSignal,
  ) => Promise<ChildCreationReceipt[]>;
  onMilestone?: (
    workId: string,
    run: Run,
    node: FlowNode,
    inputs: Inputs,
  ) => Promise<void>;
  /** 运行进入终态（completed/failed/cancelled）后调用；用于系统流程的收尾登记。 */
  onFinish?: (workId: string, run: Run) => Promise<void>;
  now?: () => number;
}
export function createRuns(
  files: FileStore,
  executeNode: (context: NodeExecution) => Promise<Json>,
  hooks: RunHooks = {},
) {
  const active = new Map<
    string,
    { workId: string; owner: string; controller: AbortController }
  >();
  const reservations = new Map<string, string>();
  const jobs = new Map<string, Promise<void>>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const clock = hooks.now ?? Date.now;
  const timestamp = () => new Date(clock()).toISOString();
  const checkedCalls = new Map<string, Set<string>>();
  let closed = false;
  const owner = (workId: string, itemId?: string) =>
    itemId ? `item:${itemId}` : `work:${workId}`;
  const occupied = (key: string) =>
    [...active.values()].some((a) => a.owner === key);
  const terminal = (run: Run) =>
    ['completed', 'failed', 'cancelled'].includes(run.status);
  function reserve(workId: string, value: string) {
    if (occupied(owner(workId)) || reservations.has(workId))
      throw Error('当前工作已有运行，请等待完成或停止。');
    reservations.set(workId, value);
  }
  function release(workId: string, value: string) {
    if (reservations.get(workId) === value) reservations.delete(workId);
  }
  async function readRun(workId: string, id: string) {
    const run = await files.select(workId, (w) =>
      w.runs.find((r) => r.id === id),
    );
    if (!run) throw Error('运行不存在');
    return run;
  }
  async function changeRun(
    workId: string,
    id: string,
    edit: (run: Run) => void,
  ) {
    if (closed) return;
    await files.changeRun(workId, id, (r) => {
      if (!closed) edit(r);
    });
  }
  function clearTimer(id: string) {
    clearTimeout(timers.get(id));
    timers.delete(id);
  }
  function schedule(workId: string, id: string) {
    if (closed) return;
    clearTimer(id);
    const job = (jobs.get(id) ?? Promise.resolve()).then(async () => {
      if (closed) return;
      const run = await readRun(workId, id);
      if (terminal(run) || run.status === 'interrupted') {
        active.delete(id);
        checkedCalls.delete(id);
        return;
      }
      const entry = active.get(id);
      if (!entry) return;
      try {
        await perform(
          workId,
          run,
          await files.readDefinition(workId, run.definitionId),
          entry.controller,
        );
      } catch (error) {
        await changeRun(workId, id, (r) => {
          if (!terminal(r)) {
            r.status = entry.controller.signal.aborted ? 'cancelled' : 'failed';
            r.error = message(error);
            r.finishedAt = timestamp();
          }
        });
      }
      if (closed) return;
      const latest = await readRun(workId, id);
      if (terminal(latest) || latest.status === 'interrupted') {
        active.delete(id);
        checkedCalls.delete(id);
        clearTimer(id);
      } else arm(workId, latest);
      if (
        latest.parentCall &&
        (terminal(latest) || latest.status === 'interrupted')
      )
        schedule(latest.parentCall.workId, latest.parentCall.runId);
    });
    jobs.set(id, job);
    void job
      .finally(() => {
        if (jobs.get(id) === job) jobs.delete(id);
      })
      .catch(() => {});
  }
  function arm(workId: string, run: Run) {
    clearTimer(run.id);
    const deadlines = (run.waits ?? [])
      .filter((w) => w.status === 'pending' && w.dueAt)
      .map((w) => Date.parse(w.dueAt!));
    if (!deadlines.length || closed || terminal(run)) return;
    const timer = setTimeout(
      () => schedule(workId, run.id),
      Math.max(1, Math.min(2_147_483_647, Math.min(...deadlines) - clock())),
    );
    timer.unref();
    timers.set(run.id, timer);
  }
  function sourceWorkItem(
    work: Pick<Work, 'runs'>,
    inputs: Inputs,
  ): WorkItemInput | undefined {
    const contexts: (WorkItemInput | undefined)[] = [];
    for (const item of items(inputs)) {
      if (!item.sourceResultIds.length) contexts.push(undefined);
      for (const id of item.sourceResultIds) {
        const source = work.runs.find((run) =>
          run.results.some((result) => result.id === id),
        );
        if (!source) throw Error('输入引用的结果不存在，无法确定来源上下文。');
        contexts.push(source.workItem);
      }
    }
    const first = contexts.find((context) => context !== undefined);
    if (!first) return undefined;
    if (
      contexts.some(
        (context) =>
          !context ||
          context.id !== first.id ||
          context.revision !== first.revision,
      )
    )
      throw Error(
        '输入混合了不同工作项、不同修订或方法样本，无法确定来源上下文；请分别续做。',
      );
    return copy(first);
  }
  async function start(workId: string, options: StartRun) {
    if (closed) throw Error('运行器已关闭');
    const work = await files.select(workId, (work) => ({
      materials: work.materials,
      runs: work.runs,
    }));
    const workItem = options.workItem ?? sourceWorkItem(work, options.inputs);
    const key = owner(workId, workItem?.id);
    if (
      occupied(key) ||
      (!options.workItem &&
        reservations.has(workId) &&
        reservations.get(workId) !== options.comparisonId)
    )
      throw Error('当前工作已有运行，请等待完成或停止。');
    const id = randomUUID();
    active.set(id, { workId, owner: key, controller: new AbortController() });
    try {
      if (
        work.runs.some(
          (r) =>
            owner(workId, r.workItem?.id) === key &&
            !terminal(r) &&
            (workItem || r.status !== 'interrupted'),
        )
      )
        throw Error('当前工作已有运行，请继续或停止。');
      const definition = await files.readDefinition(
        workId,
        options.definitionId,
      );
      validateForRun(definition);
      await validateCallReferences(
        files,
        workId,
        options.definitionId,
        definition,
        workItem?.id,
      );
      const scope = options.scope;
      const selected =
        typeof scope === 'object'
          ? definition.nodes.find((n) => n.id === scope.nodeId)
          : undefined;
      if (scope !== 'full' && !selected)
        throw Error('该版本中没有选中的节点，请重新选择。');
      if (
        options.workItem &&
        options.effectMode === 'commit' &&
        options.commitScope === 'node' &&
        !options.comparisonId &&
        selected &&
        !['agent', 'function'].includes(selected.kind)
      )
        throw Error('正式单步骤只支持普通Agent或Function。');
      validateInputs(
        options.inputs,
        selected ? nodeInputPorts(selected) : definition.inputs,
      );
      const run: Run = {
        id,
        definitionId: options.definitionId,
        scope: copy(scope),
        inputs: copy(options.inputs),
        materials: copy(
          options.materials ?? workItem?.materials ?? work.materials,
        ).filter((material) =>
          items(options.inputs).some((item) =>
            item.materialIds.includes(material.id),
          ),
        ),
        inputSources: copy(options.inputSources),
        sampleSource: copy(options.sampleSource),
        retrySource: copy(options.retrySource),
        workItem: copy(workItem),
        effectMode:
          options.workItem &&
          !options.comparisonId &&
          (scope === 'full' || options.commitScope === 'node') &&
          options.effectMode === 'commit'
            ? 'commit'
            : 'preview',
        comparisonId: options.comparisonId,
        status: 'queued',
        stopRequested: false,
        nodeStates: Object.fromEntries(
          (selected ? [selected] : definition.nodes).map((n) => [
            n.id,
            'queued',
          ]),
        ),
        nodeTotals: {},
        results: [],
        waits: [],
        signals: [],
        startedAt: timestamp(),
      };
      await files.change(workId, (w) => {
        w.runs.push(run);
      });
      schedule(workId, id);
      return id;
    } catch (error) {
      active.delete(id);
      throw error;
    }
  }
  /** A call is an ordinary nested Run in this same scheduler, never public start(). */
  async function invokeCall(
    parentWorkId: string,
    parent: Run,
    node: FlowNode,
    input: Inputs,
    result: NodeResult,
    signal: AbortSignal,
  ): Promise<
    | { status: 'completed'; outputs: Inputs }
    | { status: 'waiting' | 'interrupted'; outputs?: undefined }
  > {
    const call = node.call!;
    const definition = await files.readDefinition(
      call.workId,
      call.definitionId,
    );
    const checked = checkedCalls.get(parent.id) ?? new Set<string>();
    checkedCalls.set(parent.id, checked);
    const interfaceKey = JSON.stringify([call.workId, call.definitionId]);
    if (!checked.has(interfaceKey)) {
      const ancestors: string[] = [];
      let ancestor = parent,
        ancestorWorkId = parentWorkId;
      for (;;) {
        ancestors.push(JSON.stringify([ancestorWorkId, ancestor.definitionId]));
        if (!ancestor.parentCall) break;
        ancestorWorkId = ancestor.parentCall.workId;
        ancestor = await readRun(ancestorWorkId, ancestor.parentCall.runId);
      }
      await validateCallReferences(
        files,
        call.workId,
        call.definitionId,
        definition,
        parent.workItem?.id,
        ancestors,
      );
      checked.add(interfaceKey);
    }
    if (
      JSON.stringify(definition.inputs) !== JSON.stringify(call.inputNames) ||
      JSON.stringify(Object.keys(definition.outputs)) !==
        JSON.stringify(call.outputNames)
    )
      throw Error('调用端口与固定方法接口不一致。');
    validateInputs(input, definition.inputs);
    const invalid = validateInvocation(
      definition,
      Object.fromEntries(
        Object.entries(input).map(([p, rows]) => [p, rows.map((i) => i.value)]),
      ),
    );
    if (invalid.length) throw Error(invalid.map((i) => i.message).join('\n'));
    signal.throwIfAborted();
    if (closed) throw Error('运行器已关闭');
    if (!result.call) {
      result.call = {
        workId: call.workId,
        definitionId: call.definitionId,
        runId: randomUUID(),
      };
      await changeRun(parentWorkId, parent.id, (r) => {
        if (!r.stopRequested)
          r.results.find((x) => x.id === result.id)!.call = copy(result.call);
      });
    }
    signal.throwIfAborted();
    const ref = result.call;
    let child = await files.select(ref.workId, (work) =>
      work.runs.find((run) => run.id === ref.runId),
    );
    if (!child) {
      const liveParent = await readRun(parentWorkId, parent.id);
      const availableMaterials = parent.materials;
      const materialIds = [
        ...new Set(items(input).flatMap((item) => item.materialIds)),
      ];
      const materials = materialIds.map((id) => {
        const material = availableMaterials.find((m) => m.id === id);
        if (!material)
          throw Error(`调用输入引用的材料 ${id} 不在本轮冻结范围中。`);
        return copy(material);
      });
      const sources = new Map<string, OutputReference>();
      const remember = (source: OutputReference) =>
        sources.set(JSON.stringify(source), copy(source));
      for (const item of items(input)) {
        if (item.source) remember(item.source);
        for (const resultId of item.sourceResultIds) {
          const producer = liveParent.results.find((r) => r.id === resultId);
          if (!producer) {
            if (!item.source)
              for (const source of parent.inputSources ?? [])
                if (source.resultId === resultId) remember(source);
            continue;
          }
          for (const [port, rows] of Object.entries(producer.outputs)) {
            const index = rows.findIndex((row) => isDeepStrictEqual(row, item));
            if (index >= 0)
              remember({
                workId: parentWorkId,
                runId: parent.id,
                resultId,
                port,
                index,
              });
          }
        }
      }
      child = {
        id: ref.runId,
        definitionId: ref.definitionId,
        scope: 'full',
        inputs: copy(input),
        inputSources: [...sources.values()],
        materials,
        workItem: parent.workItem
          ? { ...copy(parent.workItem), materials }
          : undefined,
        effectMode: parent.effectMode,
        comparisonId: parent.comparisonId,
        parentCall: {
          workId: parentWorkId,
          runId: parent.id,
          definitionId: parent.definitionId,
          nodeId: node.id,
          instanceId: result.instanceId,
          resultId: result.id,
        },
        status: 'queued',
        stopRequested: false,
        nodeStates: Object.fromEntries(
          definition.nodes.map((n) => [n.id, 'queued']),
        ),
        nodeTotals: {},
        results: [],
        waits: [],
        signals: [],
        startedAt: timestamp(),
      };
      const pending = child;
      await files.change(ref.workId, (work) => {
        signal.throwIfAborted();
        if (!work.runs.some((r) => r.id === pending.id))
          work.runs.push(pending);
      });
      child = await readRun(ref.workId, ref.runId);
    }
    if (
      child.parentCall?.resultId !== result.id ||
      child.parentCall.runId !== parent.id ||
      child.definitionId !== call.definitionId ||
      !isDeepStrictEqual(child.inputs, input)
    )
      throw Error('调用恢复身份或冻结输入不一致，不能重建另一执行。');
    if (!terminal(child) && child.status !== 'interrupted') {
      if (!active.has(child.id))
        active.set(child.id, {
          workId: ref.workId,
          owner: `call:${child.id}`,
          controller: new AbortController(),
        });
      // Parent await releases the JS turn. Child has its own job key and shares perform().
      if (!jobs.has(child.id)) schedule(ref.workId, child.id);
      while (jobs.has(child.id)) await jobs.get(child.id);
      child = await readRun(ref.workId, child.id);
    }
    signal.throwIfAborted();
    await changeRun(parentWorkId, parent.id, (run) => {
      const prefix = `${result.id}/`;
      run.waits = (run.waits ?? []).filter(
        (w) => !w.source || !w.nodeId.startsWith(prefix),
      );
      if (!run.stopRequested && child!.status === 'waiting')
        run.waits.push(
          ...(child!.waits ?? [])
            .filter((w) => w.status === 'pending')
            .map((w) => ({
              ...copy(w),
              nodeId: `${prefix}${w.nodeId}`,
              source: w.source ?? { ...ref, nodeId: w.nodeId },
            })),
        );
    });
    if (child.status === 'waiting' || child.status === 'interrupted')
      return { status: child.status };
    if (child.status !== 'completed')
      throw Error(
        child.error ??
          child.results.find((r) => r.status === 'failed')?.error ??
          `被调用方法${child.status === 'cancelled' ? '已取消' : '执行失败'}。`,
      );
    const outputs: Inputs = {};
    for (const [name, [nodeId, port]] of Object.entries(definition.outputs)) {
      outputs[name] = child.results
        .filter(
          (r) =>
            r.nodeId === nodeId &&
            r.status === 'completed' &&
            !r.intermediate &&
            !r.purpose,
        )
        .sort(
          (a, b) =>
            Number(a.instanceId.split(':').at(-1)) -
            Number(b.instanceId.split(':').at(-1)),
        )
        .flatMap((r) =>
          (r.outputs[port] ?? []).map((i, index) => ({
            ...copy(i),
            sourceResultIds: [result.id],
            source: {
              workId: call.workId,
              runId: child!.id,
              resultId: r.id,
              port,
              index,
            },
          })),
        );
    }
    return { status: 'completed', outputs };
  }
  async function perform(
    workId: string,
    run: Run,
    definition: Definition,
    controller: AbortController,
  ) {
    const sourceDefinition = definition;
    const selected =
      typeof run.scope === 'object'
        ? definition.nodes.find(
            (n) => n.id === (run.scope as { nodeId: string }).nodeId,
          )
        : undefined;
    const expandedScope = selected?.kind === 'dynamic';
    if (expandedScope)
      definition = {
        ...definition,
        inputs: ['input'],
        nodes: [selected!],
        edges: [{ from: ['$input', 'input'], to: [selected!.id, 'input'] }],
        outputs: { output: [selected!.id, 'output'] },
      };
    definition = materializeDefinition(definition, run.expansions ?? []);
    const graphScope = run.scope === 'full' || expandedScope;
    let expanded = false;
    const signal = controller.signal;
    const values: Record<string, Inputs> = { $input: copy(run.inputs) };
    const states = { ...run.nodeStates };
    for (const node of definition.nodes) {
      const output: Inputs = Object.fromEntries(
        nodeOutputPorts(node).map((port) => [port, []]),
      );
      for (const result of run.results
        .filter(
          (r) =>
            r.nodeId === node.id &&
            r.status === 'completed' &&
            !r.intermediate &&
            !r.purpose,
        )
        .sort(
          (a, b) =>
            Number(a.instanceId.split(':').at(-1)) -
            Number(b.instanceId.split(':').at(-1)),
        ))
        for (const [port, list] of Object.entries(result.outputs))
          (output[port] ??= []).push(...copy(list));
      values[node.id] = output;
    }
    const remaining = new Map(
      definition.nodes
        .filter(
          (n) =>
            (graphScope ||
              (typeof run.scope === 'object' && n.id === run.scope.nodeId)) &&
            states[n.id] !== 'completed' &&
            states[n.id] !== 'failed' &&
            states[n.id] !== 'blocked',
        )
        .map((n) => [n.id, n]),
    );
    await changeRun(workId, run.id, (r) => {
      if (!r.stopRequested) r.status = 'running';
    });
    const runNode = async (node: FlowNode) => {
      const nodeId = node.id;
      // file 来源节点：不调模型，校验文件存在后直接产出文件名
      if (node.kind === 'file') {
        states[nodeId] = 'running';
        await changeRun(workId, run.id, (r) => {
          if (!r.stopRequested) r.nodeStates[nodeId] = 'running';
        });
        const result: NodeResult = {
          id: randomUUID(),
          runId: run.id,
          definitionId: run.definitionId,
          nodeId,
          instanceId: `${nodeId}:file:0`,
          input: {},
          outputs: {},
          status: 'running',
          activities: [],
          startedAt: timestamp(),
        };
        await changeRun(workId, run.id, (r) => {
          (r.nodeTotals ??= {})[nodeId] = 1;
          r.results.push(result);
        });
        const name = node.file?.name?.trim() ?? '';
        try {
          if (!name) throw new Error('文件来源节点未选择工作文件。');
          await files.readUpload(workId, name).catch(() => {
            throw new Error(`工作文件 ${name} 不存在，请重新上传。`);
          });
          result.outputs = {
            output: [
              {
                value: name,
                sampleId: name,
                materialIds: [],
                sourceResultIds: [result.id],
              },
            ],
          };
          result.status = 'completed';
          states[nodeId] = 'completed';
          values[nodeId] = { output: copy(result.outputs.output) };
        } catch (error) {
          result.status = 'failed';
          result.error = message(error);
          states[nodeId] = 'failed';
        }
        result.finishedAt = timestamp();
        await changeRun(workId, run.id, (r) => {
          const saved = r.results.find((x) => x.id === result.id)!;
          saved.outputs = result.outputs;
          saved.status = result.status;
          saved.error = result.error;
          saved.finishedAt = result.finishedAt;
          r.nodeStates[nodeId] = states[nodeId];
        });
        return;
      }
      const edges = definition.edges.filter((e) => e.to[0] === nodeId);
      const input: Inputs = graphScope
        ? Object.fromEntries(
            edges.map((e) => [
              e.to[1],
              copy(values[e.from[0]]?.[e.from[1]] ?? []),
            ]),
          )
        : copy(run.inputs);
      validateInputs(input, nodeInputPorts(node));
      if (node.kind === 'dynamic') {
        states[nodeId] = 'running';
        const result: NodeResult = {
          id: randomUUID(),
          runId: run.id,
          definitionId: run.definitionId,
          nodeId,
          instanceId: `${nodeId}:planning`,
          purpose: 'planning',
          input: copy(input),
          outputs: {},
          status: 'running',
          activities: [],
          startedAt: timestamp(),
        };
        await changeRun(workId, run.id, (r) => {
          r.nodeStates[nodeId] = 'running';
          r.results.push(result);
        });
        let planningExecution: NodeExecution | undefined;
        try {
          validateValue(
            node.inputSchema,
            items(input).map((i) => i.value),
            '输入',
          );
          const context: NodeExecution = (planningExecution = {
            workId,
            runId: run.id,
            definitionId: run.definitionId,
            node,
            instanceId: result.instanceId,
            inputs: copy(input),
            materials: copy(run.materials),
            workItem: run.workItem,
            problem: sourceDefinition.problem,
            signal,
            onActivity: async (activity) => {
              if (signal.aborted || closed) return;
              await changeRun(workId, run.id, (r) => {
                const saved = r.results.find((x) => x.id === result.id)!;
                const at = saved.activities.findIndex(
                  (a) => a.toolCallId === activity.toolCallId,
                );
                if (at < 0) saved.activities.push(activity);
                else saved.activities[at] = activity;
              });
            },
          });
          const proposal = await executeNode(context);
          if (signal.aborted || closed) throw Error('运行已停止');
          await changeRun(workId, run.id, (r) => {
            r.results.find((x) => x.id === result.id)!.proposedDefinition =
              proposal;
          });
          const subtree = validateExpansion(proposal, node);
          const expansion = {
            nodeId,
            definition: subtree,
            resultId: result.id,
            createdAt: timestamp(),
          };
          // 在保存前检查与原图的 ID 冲突；失败不能部分物化。
          materializeDefinition(definition, [expansion]);
          await changeRun(workId, run.id, (r) => {
            if (r.stopRequested) return;
            (r.expansions ??= []).push(expansion);
            const saved = r.results.find((x) => x.id === result.id)!;
            saved.status = 'completed';
            saved.finishedAt = timestamp();
            saved.effectiveModel = context.effectiveModel;
            r.nodeStates[nodeId] = 'queued';
            for (const n of subtree.nodes)
              r.nodeStates[`${nodeId}/${n.id}`] = 'queued';
          });
          states[nodeId] = 'queued';
          expanded = true;
        } catch (error) {
          states[nodeId] = signal.aborted ? 'cancelled' : 'failed';
          await changeRun(workId, run.id, (r) => {
            const saved = r.results.find((x) => x.id === result.id)!;
            saved.status = signal.aborted ? 'cancelled' : 'failed';
            saved.error = message(error);
            saved.rawOutput = planningExecution?.rawOutput;
            saved.effectiveModel = planningExecution?.effectiveModel;
            saved.finishedAt = timestamp();
            r.nodeStates[nodeId] = states[nodeId];
          });
        }
        return;
      }
      if (node.kind === 'wait')
        validateValue(
          node.inputSchema,
          items(input).map((i) => i.value),
          '输入',
        );
      if (node.kind === 'wait' && run.effectMode === 'commit') {
        let waiting = (await readRun(workId, run.id)).waits?.find(
          (w) => w.nodeId === nodeId,
        );
        if (!waiting) {
          await changeRun(workId, run.id, (r) => {
            (r.waits ??= []).push({
              nodeId,
              event: node.wait!.event,
              reason: node.wait!.reason,
              status: 'pending',
              dueAt: node.wait!.timeoutSeconds
                ? new Date(
                    clock() + node.wait!.timeoutSeconds * 1000,
                  ).toISOString()
                : undefined,
            });
            r.nodeStates[nodeId] = 'waiting';
          });
          waiting = (await readRun(workId, run.id)).waits!.find(
            (w) => w.nodeId === nodeId,
          )!;
        }
        if (
          waiting.status === 'pending' &&
          waiting.dueAt &&
          Date.parse(waiting.dueAt) <= clock()
        ) {
          await changeRun(workId, run.id, (r) => {
            const w = r.waits!.find((w) => w.nodeId === nodeId)!;
            if (w.status === 'pending' && !r.stopRequested) {
              w.status = 'released';
              w.releasedBy = 'timer';
            }
          });
          waiting = (await readRun(workId, run.id)).waits!.find(
            (w) => w.nodeId === nodeId,
          )!;
        }
        if (waiting.status === 'pending') {
          states[nodeId] = 'waiting';
          return;
        }
      }
      states[nodeId] = 'running';
      await changeRun(workId, run.id, (r) => {
        if (!r.stopRequested) r.nodeStates[nodeId] = 'running';
      });
      const operation = nodeOperation(node);
      const aggregate = operation === 'aggregate';
      const mappedPort = node.kind === 'call' ? node.call!.eachPort! : 'input';
      const batches = invocationBatches(node, input);
      await changeRun(workId, run.id, (r) => {
        (r.nodeTotals ??= {})[nodeId] = batches.length;
      });
      const producedByIndex: Inputs[] = [];
      let failed = false,
        suspended: 'waiting' | 'interrupted' | undefined,
        cursor = 0;
      async function instance(index: number) {
        let batch = batches[index];
        const baseInstanceId = `${nodeId}:${aggregate ? 'all' : batch[mappedPort][0].sampleId}:${index}`;
        for (
          let iteration = 1;
          iteration <= (node.repeat?.max ?? 1);
          iteration++
        ) {
          const instanceId = node.repeat
            ? `${nodeId}:${batch.input[0].sampleId}:round:${iteration}:${index}`
            : baseInstanceId;
          const previous = run.results.find(
            (r) => r.instanceId === instanceId && r.status === 'completed',
          );
          if (previous) {
            if (previous.intermediate) {
              batch = { input: copy(previous.outputs.output) };
              continue;
            }
            producedByIndex[index] = copy(previous.outputs);
            return;
          }
          // A create-items resume must retain its first persisted input identity.
          const original =
            node.kind === 'create-items' || node.kind === 'call'
              ? run.results.find(
                  (r) => r.nodeId === nodeId && r.instanceId === instanceId,
                )
              : undefined;
          const result: NodeResult = original ?? {
            id: randomUUID(),
            runId: run.id,
            definitionId: run.definitionId,
            nodeId,
            instanceId,
            iteration: node.repeat ? iteration : undefined,
            input: copy(batch),
            outputs: {},
            status: 'running',
            activities: [],
            startedAt: timestamp(),
          };
          await changeRun(workId, run.id, (r) => {
            if (original) {
              const saved = r.results.find((x) => x.id === original.id)!;
              saved.status = 'running';
              delete saved.error;
              delete saved.finishedAt;
            } else r.results.push(result);
          });
          const wrap = (
            value: Json,
            source: InputItem[],
            sampleId?: string,
          ): InputItem => ({
            value,
            sampleId:
              sampleId ??
              (source.length === 1 ? source[0].sampleId : result.id),
            materialIds: [...new Set(source.flatMap((i) => i.materialIds))],
            sourceResultIds: [result.id],
          });
          let execution: NodeExecution | undefined;
          try {
            if (original && !isDeepStrictEqual(original.input, batch))
              throw Error(
                '恢复候选与首次保存输入不一致，不能重新解释原建项来源。',
              );
            const source = items(batch);
            validateValue(
              node.inputSchema,
              invocationValue(node, batch),
              '输入',
            );
            let produced: Inputs;
            if (node.kind === 'call') {
              const outcome = await invokeCall(
                workId,
                run,
                node,
                batch,
                result,
                signal,
              );
              if (!outcome.outputs) {
                suspended =
                  outcome.status === 'interrupted'
                    ? 'interrupted'
                    : (suspended ?? 'waiting');
                await changeRun(workId, run.id, (r) => {
                  const saved = r.results.find((x) => x.id === result.id)!;
                  if (!r.stopRequested) saved.status = outcome.status;
                });
                return;
              }
              produced = outcome.outputs;
              validateValue(
                node.expectedOutput,
                namedValues(
                  {
                    ...node,
                    call: { ...node.call!, inputNames: node.call!.outputNames },
                  },
                  produced,
                ),
                '调用输出',
              );
            } else if (collectionFunction(node)) {
              const rows = executeCollection(node, batch);
              validateValue(
                node.expectedOutput,
                node.functionName === 'collect'
                  ? rows[0].value
                  : rows.map((row) => row.value),
                '输出',
              );
              produced = {
                output: rows.map((row) => ({
                  ...wrap(row.value, row.sources, row.sampleId),
                  sourceResultIds: [
                    ...new Set([
                      result.id,
                      ...row.sources.flatMap((item) => item.sourceResultIds),
                    ]),
                  ],
                })),
              };
            } else if (node.kind === 'create-items') {
              produced = { output: [] };
              let incomplete = false;
              for (const [inputIndex, item] of batch.input.entries()) {
                if (closed) return;
                signal.throwIfAborted();
                const candidates = parseCandidates(item.value);
                const candidateSource: CandidateSource = {
                  kind: 'node-input',
                  workId,
                  runId: run.id,
                  resultId: result.id,
                  port: 'input',
                  index: inputIndex,
                };
                const output = wrap(
                  { source: { ...candidateSource }, receipts: [] },
                  [item],
                  item.sampleId,
                );
                produced.output.push(output);
                // The fixed source also survives a hook-level failure before it returns receipts.
                await changeRun(workId, run.id, (r) => {
                  r.results.find((x) => x.id === result.id)!.outputs =
                    copy(produced);
                });
                const commit =
                  run.workItem &&
                  run.effectMode === 'commit' &&
                  run.scope === 'full' &&
                  !run.comparisonId;
                let value: Json;
                if (commit) {
                  if (!hooks.onCreateItems)
                    throw Error('建立子项业务动作未接线');
                  const receipts = await hooks.onCreateItems(
                    run.workItem!.id,
                    candidateSource,
                    signal,
                  );
                  if (closed) return;
                  incomplete ||= receipts.some((r) =>
                    ['failed', 'needs-input'].includes(r.status),
                  );
                  value = {
                    source: { ...candidateSource },
                    receipts: receipts.map((r) => ({
                      ...r,
                      ...(r.source ? { source: { ...r.source } } : {}),
                    })),
                  } as Json;
                } else {
                  value = {
                    source: { ...candidateSource },
                    preview: true,
                    candidates,
                    receipts: [],
                  } as unknown as Json;
                }
                output.value = value;
                // Preserve successful receipts even when a later container fails or stop arrives.
                await changeRun(workId, run.id, (r) => {
                  r.results.find((x) => x.id === result.id)!.outputs =
                    copy(produced);
                });
              }
              if (incomplete)
                throw Error(
                  '部分子项尚未建立，请检查回执并补充或重试未建立项。',
                );
              validateValue(
                node.expectedOutput,
                produced.output.map((i) => i.value),
                '输出',
              );
            } else if (node.kind === 'branch') {
              validateValue(
                node.expectedOutput,
                source.map((item) => item.value),
                '输出',
              );
              produced = { matched: [], unmatched: [] };
              for (const item of batch.input) {
                const v = field(item.value, node.condition!.field),
                  c = node.condition!;
                const matches =
                  c.operator === 'exists'
                    ? v !== undefined && v !== null
                    : c.operator === 'contains'
                      ? String(v ?? '').includes(String(c.value ?? ''))
                      : JSON.stringify(v) === JSON.stringify(c.value);
                produced[matches ? 'matched' : 'unmatched'].push(
                  wrap(item.value, [item], item.sampleId),
                );
              }
            } else if (node.kind === 'milestone' || node.kind === 'wait') {
              validateValue(
                node.expectedOutput,
                source.map((i) => i.value),
                '输出',
              );
              if (
                node.kind === 'milestone' &&
                run.workItem &&
                run.effectMode === 'commit' &&
                run.scope === 'full' &&
                !signal.aborted &&
                !closed
              ) {
                if (!hooks.onMilestone) throw Error('业务里程碑提交未接线');
                await hooks.onMilestone(workId, run, node, copy(batch));
              }
              produced = {
                output: source.map((i) => wrap(i.value, [i], i.sampleId)),
              };
              if (node.kind === 'wait') {
                const latest = await readRun(workId, run.id),
                  w = latest.waits?.find((w) => w.nodeId === nodeId),
                  event = latest.signals?.find((s) => s.id === w?.signalId);
                produced.event = [
                  wrap(
                    event
                      ? {
                          type: 'event',
                          id: event.id,
                          name: event.name,
                          payload: event.payload ?? null,
                          receivedAt: event.receivedAt,
                        }
                      : {
                          type: w?.releasedBy === 'timer' ? 'timer' : 'preview',
                          name: node.wait!.event,
                          dueAt: w?.dueAt ?? null,
                        },
                    source,
                  ),
                ];
              }
            } else {
              let value: Json;
              if (node.kind === 'function') {
                const argument = aggregate
                  ? source.map((i) => i.value)
                  : source[0].value;
                value =
                  node.functionName === 'expression'
                    ? evaluateExpression(node.expression!, argument)
                    : node.functionName === 'select-fields'
                      ? Object.fromEntries(
                          (node.params?.fields ?? []).map((key) => [
                            key,
                            field(argument, key) ?? null,
                          ]),
                        )
                      : argument;
              } else {
                value = await executeNode(
                  (execution = {
                    workId,
                    runId: run.id,
                    definitionId: run.definitionId,
                    workItem: run.workItem,
                    effectMode: run.effectMode,
                    scope: run.scope,
                    problem: sourceDefinition.problem,
                    iteration: node.repeat ? iteration : undefined,
                    node,
                    instanceId,
                    inputs: copy(batch),
                    materials: copy(run.materials),
                    signal,
                    onActivity: async (activity) => {
                      if (closed || signal.aborted) return;
                      await changeRun(workId, run.id, (r) => {
                        const found = r.results.find(
                          (x) => x.id === result.id,
                        )!;
                        if (found.status !== 'running' || r.stopRequested)
                          return;
                        const at = found.activities.findIndex(
                          (a) => a.toolCallId === activity.toolCallId,
                        );
                        const scoped = {
                          ...activity,
                          id: `${run.id}:${instanceId}:${activity.toolCallId}`,
                        };
                        if (at < 0) found.activities.push(scoped);
                        else found.activities[at] = scoped;
                      });
                    },
                  }),
                );
              }
              validateValue(node.expectedOutput, value, '输出');
              if (operation === 'flatMap' && !Array.isArray(value))
                throw Error('flatMap 必须返回数组');
              produced = {
                output:
                  operation === 'flatMap'
                    ? (value as Json[]).map((v, child) =>
                        wrap(v, source, `${source[0].sampleId}:${child}`),
                      )
                    : [wrap(value, source)],
              };
            }
            if (closed) return;
            if (signal.aborted) throw Error('运行已停止');
            let repeatDone = true;
            if (node.repeat) {
              const decision = node.repeat.until
                ? evaluateExpression(
                    node.repeat.until,
                    produced.output[0].value,
                  )
                : iteration === node.repeat.max;
              if (typeof decision !== 'boolean')
                throw Error('迭代停止条件必须返回布尔值。');
              repeatDone = decision;
              if (!repeatDone && iteration === node.repeat.max) {
                await changeRun(workId, run.id, (r) => {
                  r.results.find((x) => x.id === result.id)!.outputs = produced;
                });
                throw Error(
                  `已达到迭代上限 ${node.repeat.max}，仍未满足完成条件。`,
                );
              }
            }
            if (repeatDone) producedByIndex[index] = produced;
            await changeRun(workId, run.id, (r) => {
              const saved = r.results.find((x) => x.id === result.id)!;
              if (r.stopRequested) return;
              saved.outputs = produced;
              saved.status = 'completed';
              if (node.repeat) {
                saved.repeatDone = repeatDone;
                saved.intermediate = !repeatDone;
              }
              if (execution?.effectiveModel)
                saved.effectiveModel = execution.effectiveModel;
              saved.finishedAt = timestamp();
            });
            if (repeatDone) return;
            batch = { input: copy(produced.output) };
          } catch (error) {
            failed = true;
            await changeRun(workId, run.id, (r) => {
              const saved = r.results.find((x) => x.id === result.id)!;
              saved.status = signal.aborted ? 'cancelled' : 'failed';
              saved.error = signal.aborted ? '已停止' : message(error);
              saved.rawOutput = execution?.rawOutput;
              if (execution?.effectiveModel)
                saved.effectiveModel = execution.effectiveModel;
              saved.finishedAt = timestamp();
            });
            return;
          }
          if (signal.aborted || closed) return;
        }
      }
      await Promise.all(
        Array.from(
          { length: Math.min(batches.length, node.concurrency ?? 1) },
          async () => {
            while (cursor < batches.length && !signal.aborted && !closed)
              await instance(cursor++);
          },
        ),
      );
      const output: Inputs = Object.fromEntries(
        nodeOutputPorts(node).map((port) => [port, []]),
      );
      for (const produced of producedByIndex)
        if (produced)
          for (const [port, list] of Object.entries(produced))
            (output[port] ??= []).push(...list);
      values[nodeId] = output;
      states[nodeId] = signal.aborted
        ? 'cancelled'
        : (suspended ?? (failed ? 'failed' : 'completed'));
      await changeRun(workId, run.id, (r) => {
        r.nodeStates[nodeId] = states[nodeId];
      });
    };
    while (remaining.size && !signal.aborted && !closed) {
      const ready: FlowNode[] = [];
      for (const [id, node] of remaining) {
        const deps = graphScope
          ? definition.edges
              .filter((e) => e.to[0] === id && e.from[0] !== '$input')
              .map((e) => states[e.from[0]])
          : [];
        if (
          deps.some((s) =>
            ['failed', 'cancelled', 'blocked', 'interrupted'].includes(s),
          )
        ) {
          states[id] = 'blocked';
          remaining.delete(id);
          await changeRun(workId, run.id, (r) => {
            r.nodeStates[id] = 'blocked';
          });
        } else if (deps.every((s) => s === 'completed')) ready.push(node);
      }
      if (!ready.length) break;
      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(4, ready.length) }, async () => {
          while (cursor < ready.length && !signal.aborted && !closed) {
            const node = ready[cursor++];
            remaining.delete(node.id);
            try {
              await runNode(node);
            } catch (error) {
              states[node.id] = signal.aborted ? 'cancelled' : 'failed';
              await changeRun(workId, run.id, (r) => {
                r.nodeStates[node.id] = states[node.id];
                r.error = `${node.label}：${message(error)}`;
              });
            }
          }
        }),
      );
      if (expanded && !signal.aborted && !closed) {
        return perform(
          workId,
          await readRun(workId, run.id),
          sourceDefinition,
          controller,
        );
      }
    }
    await changeRun(workId, run.id, (r) => {
      r.status =
        signal.aborted || r.stopRequested
          ? 'cancelled'
          : Object.values(states).includes('interrupted')
            ? 'interrupted'
            : Object.values(states).includes('waiting')
              ? 'waiting'
              : Object.values(states).some(
                    (s) => s === 'failed' || s === 'blocked',
                  )
                ? 'failed'
                : 'completed';
      if (r.status !== 'waiting' && r.status !== 'interrupted') {
        r.finishedAt = timestamp();
        for (const id of Object.keys(r.nodeStates))
          if (['queued', 'running', 'waiting'].includes(r.nodeStates[id]))
            r.nodeStates[id] =
              r.status === 'cancelled' ? 'cancelled' : 'blocked';
      }
    });
    const finished = await readRun(workId, run.id);
    if (hooks.onFinish && terminal(finished) && !finished.parentCall)
      await hooks.onFinish(workId, finished).catch((error) => {
        console.error('运行收尾处理失败：', message(error));
      });
  }
  async function stop(workId: string, runId: string) {
    active.get(runId)?.controller.abort();
    const current = await readRun(workId, runId);
    const children = current.results.flatMap((r) => (r.call ? [r.call] : []));
    clearTimer(runId);
    await changeRun(workId, runId, (r) => {
      if (terminal(r)) return;
      r.stopRequested = true;
      r.status = 'cancelled';
      r.finishedAt = timestamp();
      for (const key of Object.keys(r.nodeStates))
        if (!['completed', 'failed', 'blocked'].includes(r.nodeStates[key]))
          r.nodeStates[key] = 'cancelled';
      for (const result of r.results)
        if (result.status === 'running') {
          result.status = 'cancelled';
          result.finishedAt = timestamp();
        }
    });
    active.delete(runId);
    await Promise.all(
      children.map(async (child) => {
        // The parent receipt is saved before child creation; stop may observe that boundary.
        if (
          await files.select(child.workId, (work) =>
            work.runs.some((run) => run.id === child.runId),
          )
        )
          await stop(child.workId, child.runId);
      }),
    );
    if (current.parentCall)
      schedule(current.parentCall.workId, current.parentCall.runId);
  }
  async function signalRun(
    workId: string,
    runId: string,
    event: { id: string; name: string; payload?: Json },
  ) {
    if (!event.id?.trim() || !event.name?.trim())
      throw Error('事件需要 ID 和名称');
    const current = await readRun(workId, runId);
    const known = current.signals?.find((s) => s.id === event.id);
    const destinations = new Map<string, { workId: string; runId: string }>();
    if (
      known ||
      (!terminal(current) &&
        !current.stopRequested &&
        current.status !== 'interrupted')
    ) {
      for (const wait of current.waits ?? [])
        if (
          (known || wait.status === 'pending') &&
          wait.event === event.name &&
          wait.source
        )
          destinations.set(
            JSON.stringify([wait.source.workId, wait.source.runId]),
            wait.source,
          );
    }
    await changeRun(workId, runId, (r) => {
      const previous = r.signals?.find((s) => s.id === event.id);
      if (previous) {
        if (
          previous.name !== event.name ||
          JSON.stringify(previous.payload) !== JSON.stringify(event.payload)
        )
          throw Error('事件 ID 已用于不同消息');
        return;
      }
      if (terminal(r) || r.stopRequested || r.status === 'interrupted')
        throw Error('运行当前不能接收事件');
      const matches =
        r.waits?.filter(
          (w) => w.status === 'pending' && w.event === event.name,
        ) ?? [];
      if (!matches.length) throw Error('没有匹配的等待事件');
      (r.signals ??= []).push({ ...copy(event), receivedAt: timestamp() });
      for (const w of matches) {
        w.status = 'released';
        w.releasedBy = 'event';
        w.signalId = event.id;
      }
    });
    try {
      for (const destination of destinations.values())
        await signalRun(destination.workId, destination.runId, event);
    } finally {
      schedule(workId, runId);
    }
  }
  async function resume(workId: string, runId: string) {
    const old = await readRun(workId, runId);
    if (old.status !== 'interrupted') throw Error('仅中断运行可显式继续');
    const key = old.parentCall
      ? `call:${old.id}`
      : owner(workId, old.workItem?.id);
    if (occupied(key)) throw Error('已有运行');
    active.set(runId, {
      workId,
      owner: key,
      controller: new AbortController(),
    });
    await changeRun(workId, runId, (r) => {
      r.status = 'queued';
      r.stopRequested = false;
      delete r.finishedAt;
      delete r.error;
      for (const id of Object.keys(r.nodeStates))
        if (
          r.nodeStates[id] === 'interrupted' ||
          r.nodeStates[id] === 'running'
        )
          r.nodeStates[id] = 'queued';
    });
    for (const result of old.results) {
      if (!result.call) continue;
      const child = await readRun(result.call.workId, result.call.runId).catch(
        () => undefined,
      );
      if (child?.status === 'interrupted')
        await resume(result.call.workId, child.id);
    }
    schedule(workId, runId);
  }
  async function recover() {
    for (const work of await files.list((w) => ({
      id: w.id,
      runs: w.runs.map((r) => ({
        id: r.id,
        status: r.status,
        stopRequested: r.stopRequested,
        parentCall: r.parentCall,
        workItem: r.workItem,
      })),
    })))
      for (const run of work.runs)
        if (
          run.status === 'waiting' &&
          !run.stopRequested &&
          !active.has(run.id)
        ) {
          active.set(run.id, {
            workId: work.id,
            owner: run.parentCall
              ? `call:${run.id}`
              : owner(work.id, run.workItem?.id),
            controller: new AbortController(),
          });
          schedule(work.id, run.id);
        }
  }
  async function retry(
    workId: string,
    runId: string,
    resultIds: string[],
    definitionId?: string,
  ) {
    const old = await readRun(workId, runId),
      selected = old.results.filter((r) => resultIds.includes(r.id));
    if (
      !selected.length ||
      selected.length !== new Set(resultIds).size ||
      selected.some((r) => r.status !== 'failed')
    )
      throw Error('请选择失败的输入重试。');
    if (new Set(selected.map((r) => r.nodeId)).size !== 1)
      throw Error('一次重试同一节点的失败输入。');
    const inputs: Inputs = {};
    for (const result of selected)
      for (const [p, list] of Object.entries(result.input))
        (inputs[p] ??= []).push(...copy(list));
    return start(workId, {
      definitionId: definitionId ?? old.definitionId,
      scope: { nodeId: selected[0].nodeId },
      inputs,
      workItem: copy(old.workItem),
      effectMode: 'preview',
      inputSources: copy(old.inputSources),
      materials: copy(old.materials),
    });
  }
  return {
    start,
    stop,
    retry,
    reserve,
    release,
    resume,
    signal: signalRun,
    recover,
    close: () => {
      closed = true;
      for (const id of timers.keys()) clearTimer(id);
      for (const entry of active.values()) entry.controller.abort();
      active.clear();
      checkedCalls.clear();
    },
    wait: async (runId: string) => {
      while (jobs.has(runId)) await jobs.get(runId);
    },
    isBusy: (workId: string) =>
      occupied(owner(workId)) || reservations.has(workId),
  };
}
export type RunService = ReturnType<typeof createRuns>;
