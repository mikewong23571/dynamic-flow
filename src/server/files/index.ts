import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
  stat,
} from 'node:fs/promises';
import { join } from 'node:path';
import type { Definition, Work, Run } from '../../shared/records.js';

export interface FileStore {
  create(work: Work): Promise<void>;
  read(workId: string): Promise<Work>;
  /** Project before copying: list/status callers must not clone entire run histories. */
  select<T>(workId: string, project: (work: Readonly<Work>) => T): Promise<T>;
  version(workId: string): Promise<string>;
  list<T = Work>(project?: (work: Readonly<Work>) => T): Promise<T[]>;
  changeRun(
    workId: string,
    runId: string,
    edit: (run: Run) => void,
  ): Promise<void>;
  change(workId: string, edit: (work: Work) => void): Promise<Work>;
  writeDefinition(workId: string, definition: Definition): Promise<string>;
  readDefinition(workId: string, id: string): Promise<Definition>;
  saveUpload(workId: string, name: string, data: Buffer): Promise<string>;
  readUpload(workId: string, name: string): Promise<Buffer>;
  uploadPath(workId: string, name: string): string;
  /** Assistant 持久会话目录（Pi JSONL 会话文件）；只派生路径，不创建。 */
  sessionDir(workId: string): string;
  listUploads(workId: string): Promise<string[]>;
  onChange(listener: (workId: string) => void): () => void;
  onServerStart(): Promise<void>;
}

/** Application-generated JS: literal objects only; never evaluates imported code. */
export function serializeDefinition(definition: Definition): string {
  return `export default ${JSON.stringify(definition, null, 2)};\n`;
}

/** Disk representation of work.json: runs are stored individually under runs/<runId>.json. */
interface StoredWork extends Work {
  runIds?: string[];
}

export function createFiles(root: string): FileStore {
  const pending = new Map<string, Promise<unknown>>();
  const listeners = new Set<(workId: string) => void>();
  // Cache parsed disk revisions and share concurrent reads; callers still own their copies.
  const reads = new Map<string, { signature: string; value: Promise<Work> }>();
  // Cache individual externalized Run files by (workId, runId) and file stat signature.
  const runReads = new Map<
    string,
    { signature: string; value: Promise<Run> }
  >();
  // Definition files are immutable; share parsing while callers receive their own copy.
  const definitions = new Map<string, Promise<Definition>>();
  const runPath = (workId: string, runId: string) =>
    join(root, workId, 'runs', `${runId}.json`);
  async function statSignature(path: string): Promise<string> {
    const info = await stat(path);
    return `${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
  }
  async function version(id: string) {
    const base = await statSignature(join(root, id, 'work.json'));
    try {
      const runsSig = await statSignature(join(root, id, 'runs'));
      return `${base}|${runsSig}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return base;
      throw error;
    }
  }
  async function readRunFile(workId: string, runId: string): Promise<Run> {
    const path = runPath(workId, runId);
    const signature = await statSignature(path);
    const key = `${workId}:${runId}`;
    let cached = runReads.get(key);
    if (!cached || cached.signature !== signature) {
      const value = readFile(path, 'utf8').then(
        (text) => JSON.parse(text) as Run,
      );
      cached = { signature, value };
      runReads.set(key, cached);
      const current = cached;
      void value.catch(() => {
        if (runReads.get(key) === current) runReads.delete(key);
      });
    }
    return cached.value;
  }
  async function writeRunFile(workId: string, run: Run): Promise<void> {
    const directory = join(root, workId, 'runs');
    await mkdir(directory, { recursive: true });
    const path = runPath(workId, run.id);
    const snapshot = structuredClone(run);
    await atomicWrite(path, JSON.stringify(snapshot, null, 2));
    const signature = await statSignature(path);
    runReads.set(`${workId}:${run.id}`, {
      signature,
      value: Promise.resolve(snapshot),
    });
  }
  async function readWorkWithRuns(id: string): Promise<Work> {
    const raw = JSON.parse(
      await readFile(join(root, id, 'work.json'), 'utf8'),
    ) as StoredWork;
    if (Array.isArray(raw.runIds)) {
      const runs = await Promise.all(
        raw.runIds.map((runId) => readRunFile(id, runId)),
      );
      const { runIds: _runIds, ...rest } = raw;
      return { ...rest, runs };
    }
    return raw;
  }
  async function saved(id: string) {
    const signature = await version(id);
    let cached = reads.get(id);
    if (!cached || cached.signature !== signature) {
      const value = readWorkWithRuns(id);
      cached = { signature, value };
      reads.set(id, cached);
      const current = cached;
      void value.catch(() => {
        if (reads.get(id) === current) reads.delete(id);
      });
    }
    return cached.value;
  }
  async function writeWorkShell(work: Work): Promise<void> {
    const shell: StoredWork = {
      ...work,
      runs: [],
      runIds: work.runs.map((r) => r.id),
    };
    await atomicWrite(
      join(root, work.id, 'work.json'),
      JSON.stringify(shell, null, 2),
    );
  }
  const notify = (id: string) => {
    reads.delete(id);
    for (const listener of listeners) {
      try {
        listener(id);
      } catch (error) {
        console.error('工作已保存，状态通知失败', error);
      }
    }
  };
  async function atomicWrite(path: string, contents: string | Buffer) {
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, contents, { flag: 'wx' });
      await rename(temp, path);
    } finally {
      await rm(temp, { force: true });
    }
  }
  /** 上传文件只取 basename，不接受目录穿越。 */
  function uploadName(name: string): string {
    const base = name.replace(/\\/g, '/').split('/').pop() ?? '';
    const clean = base.replace(/^\.+/, '').trim();
    if (!clean) throw new Error('缺少有效的文件名。');
    return clean;
  }
  function serial<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const next = (pending.get(id) ?? Promise.resolve())
      .catch(() => {})
      .then(operation);
    pending.set(id, next);
    void next
      .finally(() => {
        if (pending.get(id) === next) pending.delete(id);
      })
      .catch(() => {});
    return next;
  }
  const store: FileStore = {
    async create(work) {
      await mkdir(root, { recursive: true });
      await mkdir(join(root, work.id));
      await mkdir(join(root, work.id, 'definitions'));
      await mkdir(join(root, work.id, 'runs'));
      for (const run of work.runs) await writeRunFile(work.id, run);
      await writeWorkShell(work);
      notify(work.id);
    },
    async read(id) {
      return structuredClone(await saved(id));
    },
    async select(id, project) {
      return structuredClone(project(await saved(id)));
    },
    version,
    async list<T = Work>(project?: (work: Readonly<Work>) => T) {
      await mkdir(root, { recursive: true });
      const entries = await readdir(root, { withFileTypes: true });
      const works: { updatedAt: string; value: T }[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          const work = await saved(entry.name);
          works.push({
            updatedAt: work.updatedAt,
            value: structuredClone(project ? project(work) : (work as T)),
          });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      return works
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((w) => w.value);
    },
    changeRun(id, runId, edit) {
      return serial(id, async () => {
        const original = await saved(id);
        const index = original.runs.findIndex((r) => r.id === runId);
        if (index < 0) throw Error('运行不存在');
        const run = structuredClone(original.runs[index]);
        edit(run);
        // Only write the single mutated Run file; work.json stays lightweight without run bodies.
        await writeRunFile(id, run);
        const work: Work = {
          ...original,
          runs: [...original.runs],
          revision: original.revision + 1,
          updatedAt: new Date().toISOString(),
        };
        work.runs[index] = run;
        await writeWorkShell(work);
        notify(id);
      });
    },
    change(id, edit) {
      return serial(id, async () => {
        const previous = await saved(id);
        const previousById = new Map(previous.runs.map((r) => [r.id, r]));
        const work = await store.read(id);
        edit(work);
        work.revision += 1;
        work.updatedAt = new Date().toISOString();
        // Persist only newly added or modified runs to runs/<runId>.json.
        const rawShell = JSON.parse(
          await readFile(join(root, id, 'work.json'), 'utf8'),
        ) as StoredWork;
        const alreadyExternalized = Array.isArray(rawShell.runIds);
        for (const run of work.runs) {
          const prev = previousById.get(run.id);
          if (
            !alreadyExternalized ||
            !prev ||
            JSON.stringify(prev) !== JSON.stringify(run)
          )
            await writeRunFile(id, run);
        }
        await writeWorkShell(work);
        notify(id);
        return structuredClone(work);
      });
    },
    async writeDefinition(workId, definition) {
      const id = randomUUID();
      const directory = join(root, workId, 'definitions');
      await mkdir(directory, { recursive: true });
      await atomicWrite(
        join(directory, `${id}.js`),
        serializeDefinition(definition),
      );
      return id;
    },
    async readDefinition(workId, id) {
      const key = JSON.stringify([workId, id]);
      let pending = definitions.get(key);
      if (!pending) {
        pending = readFile(
          join(root, workId, 'definitions', `${id}.js`),
          'utf8',
        ).then((source) => {
          if (!source.startsWith('export default ') || !source.endsWith(';\n'))
            throw new Error(`定义 ${id} 不是应用保存的 JS 定义`);
          return JSON.parse(
            source.slice('export default '.length, -2),
          ) as Definition;
        });
        if (definitions.size >= 128)
          definitions.delete(definitions.keys().next().value!);
        definitions.set(key, pending);
        const current = pending;
        void pending.catch(() => {
          if (definitions.get(key) === current) definitions.delete(key);
        });
      }
      return structuredClone(await pending);
    },
    async saveUpload(workId, name, data) {
      const clean = uploadName(name);
      const directory = join(root, workId, 'uploads');
      await mkdir(directory, { recursive: true });
      await atomicWrite(join(directory, clean), data);
      return clean;
    },
    async readUpload(workId, name) {
      return readFile(join(root, workId, 'uploads', uploadName(name)));
    },
    uploadPath(workId, name) {
      return join(root, workId, 'uploads', uploadName(name));
    },
    sessionDir(workId) {
      return join(root, workId, 'assistant');
    },
    async listUploads(workId) {
      try {
        return await readdir(join(root, workId, 'uploads'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
      }
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async onServerStart() {
      const active = new Set(['queued', 'running', 'stopping']);
      for (const saved of await store.list((w) => ({
        id: w.id,
        active:
          w.runs.some((r) => active.has(r.status)) ||
          w.comparisons.some((c) => active.has(c.status)) ||
          w.messages.some((m) => m.status && active.has(m.status)),
      }))) {
        if (!saved.active) continue;
        await store.change(saved.id, (work) => {
          const now = new Date().toISOString();
          for (const run of work.runs) {
            if (!active.has(run.status)) continue;
            run.status = 'interrupted';
            run.finishedAt = now;
            run.error =
              '服务重启，活跃调用结果未确定；检查已完成结果后，可显式继续未完成步骤。';
            for (const [id, status] of Object.entries(run.nodeStates))
              if (active.has(status)) run.nodeStates[id] = 'interrupted';
            for (const result of run.results) {
              if (!active.has(result.status)) continue;
              result.status = 'interrupted';
              result.finishedAt = now;
              result.error = run.error;
              for (const activity of result.activities)
                if (activity.status === 'running') {
                  activity.status = 'failed';
                  activity.error = run.error;
                }
            }
          }
          for (const comparison of work.comparisons)
            if (active.has(comparison.status)) {
              comparison.status = 'interrupted';
              comparison.error = '服务重启，比较已中断；请重新试运行。';
            }
          for (const message of work.messages)
            if (message.status && active.has(message.status)) {
              message.status = 'interrupted';
              message.error =
                '服务重启，对话修改已中断；已保存的草稿仍可继续编辑。';
              for (const activity of message.activities ?? [])
                if (activity.status === 'running') {
                  activity.status = 'failed';
                  activity.error = message.error;
                }
            }
        });
      }
    },
  };
  return store;
}
