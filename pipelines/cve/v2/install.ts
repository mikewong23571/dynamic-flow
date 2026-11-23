import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { checkDefinition } from '../../../src/server/flow/index.ts';
import type {
  Definition,
  Snapshot,
  ViewState,
  WorkPage,
} from '../../../src/shared/records.ts';

// 用现有 HTTP 动作安装两个明确的方法；不启动调查，不修改其他流水线。
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4321';
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `${baseUrl}${path}`,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok) throw Error(`${path}: ${JSON.stringify(result)}`);
  return result as T;
}

// 全部定义先校验，再创建任何数据。
const bundles = await Promise.all(
  ['research.json', 'source-check.json'].map(async (name) => {
    const bundle = JSON.parse(
      await readFile(new URL(name, import.meta.url), 'utf8'),
    ) as {
      title: string;
      goal: string;
      definition: Definition;
      view: ViewState;
    };
    const issues = checkDefinition(bundle.definition);
    if (issues.length) throw Error(`${name}: ${JSON.stringify(issues)}`);
    return bundle;
  }),
);

for (const bundle of bundles) {
  const page = await request<WorkPage>(
    `/api/works?query=${encodeURIComponent(bundle.title)}&pageSize=100`,
  );
  const matches = page.works.filter(
    (work) => work.title === bundle.title && work.goal === bundle.goal,
  );
  if (matches.length > 1)
    throw Error(`发现多个同名同目标方法，请明确使用哪一个：${bundle.title}`);
  let snapshot: Snapshot;
  if (matches.length) {
    snapshot = await request<Snapshot>(`/api/works/${matches[0].id}`);
    const current = snapshot.work.draftId ?? snapshot.work.adoptedId;
    if (
      !current ||
      !isDeepStrictEqual(snapshot.definitions[current], bundle.definition)
    ) {
      throw Error(
        `${bundle.title} 已有不同版本；保留现场，请在应用中编辑新版本。`,
      );
    }
  } else {
    snapshot = await request<Snapshot>('/api/works', {
      goal: bundle.goal,
      materials: [],
    });
    const path = `/api/works/${snapshot.work.id}/actions`;
    await request(path, { action: 'rename', title: bundle.title });
    snapshot = await request<Snapshot>(path, {
      action: 'saveDraft',
      expectedDraftId: snapshot.work.draftId,
      definition: bundle.definition,
    });
    await request(path, { action: 'saveLayout', view: bundle.view });
    snapshot = await request<Snapshot>(path, {
      action: 'adopt',
      definitionId: snapshot.work.draftId,
    });
  }
  if (snapshot.issues.length)
    throw Error(`${bundle.title}: ${JSON.stringify(snapshot.issues)}`);
  console.log(
    JSON.stringify({
      title: bundle.title,
      workId: snapshot.work.id,
      definitionId: snapshot.work.adoptedId,
      nodes: bundle.definition.nodes.length,
      issues: snapshot.issues.length,
    }),
  );
}
