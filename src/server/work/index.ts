import { randomUUID } from 'node:crypto';
import type {
  Inputs,
  NodeResult,
  Work,
  WorkPage,
} from '../../shared/records.js';
import type { FileStore } from '../files/index.js';

function materialTexts(texts: string[]): string[] {
  if (
    !Array.isArray(texts) ||
    !texts.length ||
    texts.some((text) => typeof text !== 'string' || !text.trim())
  )
    throw new Error('请提供至少一条非空材料，删除空白条目后重试。');
  return texts.map((text) => text.trim());
}
function newMaterials(
  existing: Work['materials'],
  texts: string[],
): Work['materials'] {
  let number = existing.reduce((maximum, material) => {
    const match = /^M(\d+)$/.exec(material.id);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);
  return texts.map((text) => ({
    id: `M${String(++number).padStart(2, '0')}`,
    text,
  }));
}
function selectedResults(work: Work, ids: string[]): NodeResult[] {
  if (!Array.isArray(ids) || !ids.length) throw new Error('请先选择结果。');
  return ids.map((id) => {
    const result = work.runs
      .flatMap((run) => run.results)
      .find((result) => result.id === id);
    if (!result) throw new Error(`找不到所选结果 ${id}。`);
    if (result.status !== 'completed')
      throw new Error(
        '只能保留或继续使用成功完成的结果；请检查失败原因后重试。',
      );
    return result;
  });
}
function fallbackTitle(goal: string): string {
  return Array.from(goal.trim()).slice(0, 28).join('');
}

export function createWorkService(files: FileStore) {
  return {
    async createWork(goal: string, materials: string[]): Promise<Work> {
      if (typeof goal !== 'string' || !goal.trim())
        throw new Error('请填写工作目标。');
      const texts = materialTexts(materials),
        now = new Date().toISOString();
      const work: Work = {
        id: randomUUID(),
        title: fallbackTitle(goal),
        goal: goal.trim(),
        createdAt: now,
        updatedAt: now,
        revision: 0,
        materials: newMaterials([], texts),
        definitionIds: [],
        view: { positions: {} },
        runs: [],
        comparisons: [],
        keptResultIds: [],
        messages: [],
      };
      await files.create(work);
      return work;
    },
    async listWorks(
      options: {
        query?: string;
        page?: number;
        pageSize?: number;
        archived?: boolean;
      } = {},
    ): Promise<WorkPage> {
      const requestedPage = options.page ?? 1;
      const pageSize = options.pageSize ?? 10;
      if (
        !Number.isInteger(requestedPage) ||
        requestedPage < 1 ||
        !Number.isInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > 100
      )
        throw new Error('分页参数无效：页码从 1 开始，每页 1–100 条。');
      const query = (options.query ?? '').trim().toLocaleLowerCase();
      const works = (await files.list())
        .filter((work) => {
          if (Boolean(work.archivedAt) !== (options.archived ?? false))
            return false;
          return (
            !query ||
            `${work.title ?? ''} ${work.goal}`
              .toLocaleLowerCase()
              .includes(query)
          );
        })
        .sort(
          (a, b) =>
            b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
        );
      const page = Math.min(
        requestedPage,
        Math.max(1, Math.ceil(works.length / pageSize)),
      );
      return {
        works: await Promise.all(
          works
            .slice((page - 1) * pageSize, page * pageSize)
            .map(async (work) => ({
              id: work.id,
              title: work.title || fallbackTitle(work.goal),
              goal: work.goal,
              updatedAt: work.updatedAt,
              archivedAt: work.archivedAt,
              definitionState: !work.adoptedId
                ? work.draftId
                  ? ('draft' as const)
                  : ('empty' as const)
                : work.draftId && work.draftId !== work.adoptedId
                  ? ('changed' as const)
                  : ('adopted' as const),
              nodeCount:
                work.draftId || work.adoptedId
                  ? (
                      await files.readDefinition(
                        work.id,
                        (work.draftId ?? work.adoptedId)!,
                      )
                    ).nodes.length
                  : 0,
            })),
        ),
        total: works.length,
        page,
        pageSize,
      };
    },
    async rename(id: string, title: string): Promise<void> {
      if (
        typeof title !== 'string' ||
        !title.trim() ||
        Array.from(title.trim()).length > 80
      )
        throw new Error('请输入 1–80 个字符的工作标题。');
      await files.change(id, (work) => {
        work.title = title.trim();
        work.titleEdited = true;
      });
    },
    async archive(id: string, archived: boolean): Promise<void> {
      await files.change(id, (work) => {
        if (archived) work.archivedAt ??= new Date().toISOString();
        else delete work.archivedAt;
      });
    },
    async addMaterials(id: string, texts: string[]): Promise<void> {
      const added = materialTexts(texts);
      await files.change(id, (work) => {
        work.materials.push(...newMaterials(work.materials, added));
      });
    },
    async keepResults(id: string, resultIds: string[]): Promise<void> {
      await files.change(id, (work) => {
        selectedResults(work, resultIds);
        work.keptResultIds = [
          ...new Set([...work.keptResultIds, ...resultIds]),
        ];
      });
    },
    async previewResults(id: string, resultIds: string[]): Promise<Inputs> {
      if (new Set(resultIds).size !== resultIds.length)
        throw new Error('重复选择同一结果，请只保留一次。');
      const selected = selectedResults(await files.read(id), resultIds);
      const materialOwners = new Map<string, string>(),
        sampleOwners = new Map<string, string>();
      const input: Inputs['input'] = [];
      for (const result of selected)
        for (const item of Object.values(result.outputs).flat()) {
          if (sampleOwners.has(item.sampleId))
            throw new Error(
              `材料样本 ${item.sampleId} 有多个结果版本或重复输出；请选择其中一个。`,
            );
          sampleOwners.set(item.sampleId, result.id);
          for (const materialId of new Set(item.materialIds)) {
            if (materialOwners.has(materialId))
              throw new Error(
                `所选结果覆盖重叠材料 ${materialId}；请明确选择一个版本，避免重复计算。`,
              );
            materialOwners.set(materialId, result.id);
          }
          input.push({
            ...structuredClone(item),
            sourceResultIds: [...new Set([...item.sourceResultIds, result.id])],
          });
        }
      if (!input.length)
        throw new Error('所选结果没有可供续做的输出；请选择有产物的成功结果。');
      return { input };
    },
  };
}
