import { randomUUID } from 'node:crypto';
import type { FileStore } from '../files/index.ts';
import { validateValue } from '../flow/schema.ts';
import { evaluateExpression } from '../flow/expressions.ts';
import { validateForRun } from '../flow/index.ts';
import type {
  Definition,
  FlowNode,
  Inputs,
  InputItem,
  Json,
  NodeExecution,
  NodeResult,
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
export function nodeInputPorts(node: FlowNode) {
  return node.kind === 'function' && node.functionName === 'merge'
    ? ['left', 'right']
    : ['input'];
}
export function validateInputs(inputs: Inputs, ports: string[]) {
  for (const p of ports)
    if (!Array.isArray(inputs[p]))
      throw Error(`缺少输入端口 ${p}，请选择材料或已有结果。`);
  for (const [p, list] of Object.entries(inputs)) {
    if (!ports.includes(p))
      throw Error(`不支持输入端口 ${p}，需要 ${ports.join('、')}。`);
    for (const i of list)
      if (
        !i.sampleId ||
        !Array.isArray(i.materialIds) ||
        !Array.isArray(i.sourceResultIds) ||
        i.value === undefined
      )
        throw Error('输入项缺少内容或来源。');
  }
}
export interface RunHooks {
  onMilestone?: (
    workId: string,
    run: Run,
    node: FlowNode,
    inputs: Inputs,
  ) => Promise<void>;
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
    const run = (await files.read(workId)).runs.find((r) => r.id === id);
    if (!run) throw Error('运行不存在');
    return run;
  }
  async function changeRun(
    workId: string,
    id: string,
    edit: (run: Run) => void,
  ) {
    if (closed) return;
    await files.change(workId, (w) => {
      const r = w.runs.find((r) => r.id === id);
      if (!r) throw Error('运行不存在');
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
      if (terminal(run) || run.status === 'interrupted') return;
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
      if (terminal(latest)) {
        active.delete(id);
        clearTimer(id);
      } else arm(workId, latest);
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
    work: Work,
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
    const work = await files.read(workId);
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
      const scope = options.scope;
      const selected =
        typeof scope === 'object'
          ? definition.nodes.find((n) => n.id === scope.nodeId)
          : undefined;
      if (scope !== 'full' && !selected)
        throw Error('该版本中没有选中的节点，请重新选择。');
      validateInputs(
        options.inputs,
        selected ? nodeInputPorts(selected) : definition.inputs,
      );
      const run: Run = {
        id,
        definitionId: options.definitionId,
        scope: copy(scope),
        inputs: copy(options.inputs),
        workItem: copy(workItem),
        effectMode:
          options.workItem &&
          scope === 'full' &&
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
  async function perform(
    workId: string,
    run: Run,
    definition: Definition,
    controller: AbortController,
  ) {
    const signal = controller.signal;
    const values: Record<string, Inputs> = { $input: copy(run.inputs) };
    const states = { ...run.nodeStates };
    for (const node of definition.nodes) {
      const output: Inputs =
        node.kind === 'branch'
          ? { matched: [], unmatched: [] }
          : node.kind === 'wait'
            ? { output: [], event: [] }
            : { output: [] };
      for (const result of run.results
        .filter((r) => r.nodeId === node.id && r.status === 'completed')
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
            (run.scope === 'full' || n.id === run.scope.nodeId) &&
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
      const edges = definition.edges.filter((e) => e.to[0] === nodeId);
      const input: Inputs =
        run.scope === 'full'
          ? Object.fromEntries(
              edges.map((e) => [
                e.to[1],
                copy(values[e.from[0]]?.[e.from[1]] ?? []),
              ]),
            )
          : copy(run.inputs);
      validateInputs(input, nodeInputPorts(node));
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
      const operation =
        node.operation ?? (node.mode === 'each' ? 'map' : 'aggregate');
      const aggregate =
        operation === 'aggregate' ||
        ['branch', 'wait', 'milestone'].includes(node.kind);
      const batches: Inputs[] = aggregate
        ? [input]
        : input.input.map((i) => ({ input: [i] }));
      await changeRun(workId, run.id, (r) => {
        (r.nodeTotals ??= {})[nodeId] = batches.length;
      });
      const producedByIndex: Inputs[] = [];
      let failed = false,
        cursor = 0;
      async function instance(index: number) {
        const batch = batches[index];
        const instanceId = `${nodeId}:${aggregate ? 'all' : batch.input[0].sampleId}:${index}`;
        const previous = run.results.find(
          (r) => r.instanceId === instanceId && r.status === 'completed',
        );
        if (previous) {
          producedByIndex[index] = copy(previous.outputs);
          return;
        }
        const result: NodeResult = {
          id: randomUUID(),
          runId: run.id,
          definitionId: run.definitionId,
          nodeId,
          instanceId,
          input: copy(batch),
          outputs: {},
          status: 'running',
          activities: [],
          startedAt: timestamp(),
        };
        await changeRun(workId, run.id, (r) => {
          r.results.push(result);
        });
        const wrap = (
          value: Json,
          source: InputItem[],
          sampleId?: string,
        ): InputItem => ({
          value,
          sampleId:
            sampleId ?? (source.length === 1 ? source[0].sampleId : result.id),
          materialIds: [...new Set(source.flatMap((i) => i.materialIds))],
          sourceResultIds: [result.id],
        });
        try {
          const source = items(batch);
          validateValue(
            node.inputSchema,
            aggregate ? source.map((i) => i.value) : source[0].value,
            '输入',
          );
          let produced: Inputs;
          if (node.kind === 'branch') {
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
          } else if (
            node.kind === 'function' &&
            !node.operation &&
            node.functionName !== 'expression'
          ) {
            // Legacy collection functions preserve their established one-result-per-input behavior.
            produced = {
              output: source.map((i) => {
                const value =
                  node.functionName === 'select-fields'
                    ? Object.fromEntries(
                        (node.params?.fields ?? []).map((key) => [
                          key,
                          field(i.value, key) ?? null,
                        ]),
                      )
                    : i.value;
                validateValue(node.expectedOutput, value, '输出');
                return wrap(value, [i], i.sampleId);
              }),
            };
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
              const work = await files.read(workId);
              value = await executeNode({
                workId,
                runId: run.id,
                definitionId: run.definitionId,
                workItem: run.workItem,
                node,
                instanceId,
                inputs: copy(batch),
                materials: copy(run.workItem?.materials ?? work.materials),
                signal,
                onActivity: async (activity) => {
                  if (closed || signal.aborted) return;
                  await changeRun(workId, run.id, (r) => {
                    const found = r.results.find((x) => x.id === result.id)!;
                    if (found.status !== 'running' || r.stopRequested) return;
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
              });
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
          producedByIndex[index] = produced;
          await changeRun(workId, run.id, (r) => {
            const saved = r.results.find((x) => x.id === result.id)!;
            if (r.stopRequested) return;
            saved.outputs = produced;
            saved.status = 'completed';
            saved.finishedAt = timestamp();
          });
        } catch (error) {
          failed = true;
          await changeRun(workId, run.id, (r) => {
            const saved = r.results.find((x) => x.id === result.id)!;
            saved.status = signal.aborted ? 'cancelled' : 'failed';
            saved.error = signal.aborted ? '已停止' : message(error);
            saved.finishedAt = timestamp();
          });
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
      const output: Inputs =
        node.kind === 'branch'
          ? { matched: [], unmatched: [] }
          : { output: [] };
      for (const produced of producedByIndex)
        if (produced)
          for (const [port, list] of Object.entries(produced))
            (output[port] ??= []).push(...list);
      values[nodeId] = output;
      states[nodeId] = signal.aborted
        ? 'cancelled'
        : failed
          ? 'failed'
          : 'completed';
      await changeRun(workId, run.id, (r) => {
        r.nodeStates[nodeId] = states[nodeId];
      });
    };
    while (remaining.size && !signal.aborted && !closed) {
      const ready: FlowNode[] = [];
      for (const [id, node] of remaining) {
        const deps =
          run.scope === 'full'
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
    }
    await changeRun(workId, run.id, (r) => {
      r.status =
        signal.aborted || r.stopRequested
          ? 'cancelled'
          : Object.values(states).includes('waiting')
            ? 'waiting'
            : Object.values(states).some(
                  (s) => s === 'failed' || s === 'blocked',
                )
              ? 'failed'
              : 'completed';
      if (r.status !== 'waiting') {
        r.finishedAt = timestamp();
        for (const id of Object.keys(r.nodeStates))
          if (['queued', 'running', 'waiting'].includes(r.nodeStates[id]))
            r.nodeStates[id] =
              r.status === 'cancelled' ? 'cancelled' : 'blocked';
      }
    });
  }
  async function stop(workId: string, runId: string) {
    active.get(runId)?.controller.abort();
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
  }
  async function signalRun(
    workId: string,
    runId: string,
    event: { id: string; name: string; payload?: Json },
  ) {
    if (!event.id?.trim() || !event.name?.trim())
      throw Error('事件需要 ID 和名称');
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
    schedule(workId, runId);
  }
  async function resume(workId: string, runId: string) {
    const old = await readRun(workId, runId);
    if (old.status !== 'interrupted') throw Error('仅中断运行可显式继续');
    const key = owner(workId, old.workItem?.id);
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
    schedule(workId, runId);
  }
  async function recover() {
    for (const work of await files.list())
      for (const run of work.runs)
        if (
          run.status === 'waiting' &&
          !run.stopRequested &&
          !active.has(run.id)
        ) {
          active.set(run.id, {
            workId: work.id,
            owner: owner(work.id, run.workItem?.id),
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
    },
    wait: async (runId: string) => {
      while (jobs.has(runId)) await jobs.get(runId);
    },
    isBusy: (workId: string) =>
      occupied(owner(workId)) || reservations.has(workId),
  };
}
export type RunService = ReturnType<typeof createRuns>;
