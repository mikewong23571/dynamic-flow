import { randomUUID } from 'node:crypto';
import type { FileStore } from '../files/index.ts';
import type { RunService } from '../runs/index.ts';
import { nodeInputPorts, validateInputs } from '../runs/index.ts';
import { validateForRun } from '../flow/index.ts';
import type { Comparison, Inputs } from '../../shared/records.ts';
export function createTrials(files: FileStore, runs: RunService) {
  const jobs = new Map<string, Promise<void>>();
  async function compare(
    workId: string,
    options: {
      baselineId?: string;
      candidateId: string;
      nodeId: string;
      inputs: Inputs;
    },
  ) {
    const id = randomUUID();
    runs.reserve(workId, id);
    try {
      const work = await files.read(workId),
        baselineId = options.baselineId ?? work.draftBaseId;
      if (!baselineId) throw Error('请先选择比较起点。');
      const baseline = await files.readDefinition(workId, baselineId),
        candidate = await files.readDefinition(workId, options.candidateId);
      validateForRun(baseline);
      validateForRun(candidate);
      const oldNode = baseline.nodes.find((n) => n.id === options.nodeId),
        newNode = candidate.nodes.find((n) => n.id === options.nodeId);
      if (!oldNode || !newNode)
        throw Error('所选节点不在两个版本中，请重新选择比较范围。');
      if (
        oldNode.mode !== newNode.mode ||
        JSON.stringify(nodeInputPorts(oldNode)) !==
          JSON.stringify(nodeInputPorts(newNode))
      )
        throw Error(
          '两个版本的执行模式或输入端口不同，不能对齐比较。请调整节点或重新选择范围。',
        );
      validateInputs(options.inputs, nodeInputPorts(newNode));
      const comparison: Comparison = {
        id,
        baselineId,
        candidateId: options.candidateId,
        nodeId: options.nodeId,
        frozenInputs: structuredClone(options.inputs),
        status: 'queued',
        stopRequested: false,
        createdAt: new Date().toISOString(),
      };
      await files.change(workId, (w) => {
        w.comparisons.push(comparison);
      });
      const job = perform(workId, comparison)
        .catch(async (error: unknown) => {
          await files.change(workId, (w) => {
            const c = w.comparisons.find((c) => c.id === id)!;
            c.status = c.stopRequested ? 'cancelled' : 'failed';
            c.error = error instanceof Error ? error.message : String(error);
          });
        })
        .finally(() => runs.release(workId, id));
      jobs.set(id, job);
      void job
        .finally(() => {
          setTimeout(() => jobs.delete(id), 60000).unref();
        })
        .catch(() => {});
      return id;
    } catch (error) {
      runs.release(workId, id);
      throw error;
    }
  }
  async function perform(workId: string, c: Comparison) {
    await files.change(workId, (w) => {
      const saved = w.comparisons.find((x) => x.id === c.id)!;
      if (!saved.stopRequested) saved.status = 'running';
    });
    for (const [key, definitionId] of [
      ['baselineRunId', c.baselineId],
      ['candidateRunId', c.candidateId],
    ] as const) {
      if (
        (await files.read(workId)).comparisons.find((x) => x.id === c.id)!
          .stopRequested
      )
        break;
      const runId = await runs.start(workId, {
        definitionId,
        scope: { nodeId: c.nodeId },
        inputs: c.frozenInputs,
        comparisonId: c.id,
      });
      const updated = await files.change(workId, (w) => {
        w.comparisons.find((x) => x.id === c.id)![key] = runId;
      });
      if (updated.comparisons.find((x) => x.id === c.id)!.stopRequested)
        await runs.stop(workId, runId);
      await runs.wait(runId);
    }
    await files.change(workId, (w) => {
      const saved = w.comparisons.find((x) => x.id === c.id)!;
      saved.status = saved.stopRequested ? 'cancelled' : 'completed';
    });
  }
  async function stopComparison(workId: string, id: string) {
    const w = await files.change(workId, (w) => {
      const c = w.comparisons.find((c) => c.id === id);
      if (!c) throw Error('比较不存在');
      if (
        ['completed', 'failed', 'cancelled', 'interrupted'].includes(c.status)
      )
        return;
      c.stopRequested = true;
      c.status = 'stopping';
    });
    const c = w.comparisons.find((c) => c.id === id)!;
    for (const runId of [c.baselineRunId, c.candidateRunId])
      if (runId) await runs.stop(workId, runId);
  }
  return {
    compare,
    stopComparison,
    wait: async (id: string) => {
      await jobs.get(id);
    },
  };
}
export type TrialService = ReturnType<typeof createTrials>;
