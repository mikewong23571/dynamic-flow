/** Real author/save/node integration probe. Temporary work is removed on completion. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFiles } from '../files/index.ts';
import { createFlow, validateForRun } from '../flow/index.ts';
import { createWorkService } from '../work/index.ts';
import { createAssistant, runPiSession } from './index.ts';
import { loadConfig, safeError } from './config.ts';

const dir = await mkdtemp(join(tmpdir(), 'dynamic-flow-real-author-'));
const config = loadConfig();
try {
  const streamCounts: Record<string, number> = {};
  const files = createFiles(dir),
    flow = createFlow(files),
    assistant = createAssistant(files, flow, {
      runSession: (input) =>
        runPiSession({
          ...input,
          onProgress: (kind, characters) => {
            streamCounts[kind] = (streamCounts[kind] ?? 0) + characters;
          },
        }),
    });
  const work = await createWorkService(files).createWork(
    '整理客户反馈，区分问题、需求与称赞，报告必须引用反馈编号，提出有依据的建议。',
    [
      '界面很顺手，但导出报告经常失败，影响交付。',
      '希望支持批量导出，逐条操作太慢。',
      '搜索比以前快很多，团队很满意。',
    ],
  );
  const requestId = await assistant.requestEdit(work.id, {
    text: '生成分类反馈与汇总建议的可运行工作流。分类保留原文依据；报告引用原始材料编号。',
  });
  let state = await files.read(work.id);
  const deadline = Date.now() + 180000;
  let lastProgress = Date.now();
  while (state.messages.at(-1)?.status === 'running' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    state = await files.read(work.id);
    if (Date.now() - lastProgress > 15000) {
      lastProgress = Date.now();
      const m = state.messages.at(-1);
      console.log(
        JSON.stringify({
          test: 'author-progress',
          streamCounts,
          textLength: m?.text.length,
          activities: m?.activities?.map((a) => ({
            name: a.toolName,
            status: a.status,
            result:
              a.status === 'failed'
                ? JSON.stringify(a.result).slice(0, 180)
                : undefined,
          })),
        }),
      );
    }
  }
  const message = state.messages.find(
    (message) =>
      message.role === 'assistant' && message.requestId === requestId,
  )!;
  if (message.status !== 'completed') {
    if (message.status === 'running') {
      await assistant.stopEdit(work.id, requestId);
      for (let i = 0; i < 100; i++) {
        if ((await files.read(work.id)).messages.at(-1)?.status !== 'stopping')
          break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    throw new Error(message.error ?? 'author timeout');
  }
  const definition = await files.readDefinition(work.id, state.draftId!);
  validateForRun(definition);
  console.log(
    JSON.stringify({
      test: 'real-author-saves-runnable-definition',
      ok: true,
      nodeCount: definition.nodes.length,
      toolActivities: message.activities?.map((activity) => ({
        tool: activity.toolName,
        status: activity.status,
      })),
      materialCitationRequirement: definition.nodes.some((node) =>
        node.task?.includes('引用'),
      ),
    }),
  );
  const node = definition.nodes.find(
    (node) => node.kind === 'agent' && node.mode === 'each',
  )!;
  if (!node) throw new Error('No per-item agent generated');
  const material = work.materials[0],
    controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  const output = await assistant
    .executeNode({
      workId: work.id,
      runId: 'probe',
      definitionId: state.draftId!,
      node,
      instanceId: 'probe',
      inputs: {
        input: [
          {
            sampleId: material.id,
            value: material.text,
            materialIds: [material.id],
            sourceResultIds: [],
          },
        ],
      },
      materials: work.materials,
      signal: controller.signal,
      onActivity: async () => {},
    })
    .finally(() => clearTimeout(timer));
  console.log(
    JSON.stringify({ test: 'real-node-schema-and-evidence', ok: true, output }),
  );
  const editId = await assistant.requestEdit(work.id, {
    text: '同时表达赞扬和问题时，归为问题，并保留两方面原文依据。',
    expectedDraftId: state.draftId,
    nodeId: node.id,
    sampleIds: [material.id],
  });
  const editDeadline = Date.now() + 180000;
  let changed = await files.read(work.id);
  while (
    changed.messages.at(-1)?.status === 'running' &&
    Date.now() < editDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    changed = await files.read(work.id);
  }
  const editMessage = changed.messages.at(-1)!;
  if (editMessage.status !== 'completed') {
    if (editMessage.status === 'running')
      await assistant.stopEdit(work.id, editId);
    throw new Error(editMessage.error ?? 'edit timeout');
  }
  const updated = await files.readDefinition(work.id, changed.draftId!);
  console.log(
    JSON.stringify({
      test: 'real-selected-node-edit',
      ok:
        JSON.stringify(updated.nodes.find((item) => item.id === node.id)) !==
          JSON.stringify(node) &&
        JSON.stringify(updated.nodes.filter((item) => item.id !== node.id)) ===
          JSON.stringify(
            definition.nodes.filter((item) => item.id !== node.id),
          ),
      versionChanged: changed.draftId !== state.draftId,
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      test: 'real-author-node-integration',
      ok: false,
      error: safeError(error, config),
    }),
  );
  process.exitCode = 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
