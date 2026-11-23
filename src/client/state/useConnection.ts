import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ModelConfiguration,
  Snapshot,
  WorkSummary,
} from '../../shared/records';
import { api } from '../core/api';
import { acceptSnapshot } from '../core/definition';
import { errorText } from '../core/format';

const openedKey = 'dynamic-flow.opened-works';
const currentKey = 'dynamic-flow.work';
const loadingWork = (id: string): WorkSummary => ({
  id,
  title: '加载中…',
  goal: '',
  updatedAt: '',
});

function restoreOpened() {
  const current = localStorage.getItem(currentKey) || '';
  const raw = localStorage.getItem(openedKey);
  let works: WorkSummary[] = [];
  try {
    const saved: unknown = JSON.parse(raw || '[]');
    if (Array.isArray(saved)) {
      const seen = new Set<string>();
      works = saved.filter((item): item is WorkSummary => {
        if (
          !item ||
          typeof item.id !== 'string' ||
          !item.id ||
          seen.has(item.id) ||
          (item.title !== undefined && typeof item.title !== 'string') ||
          typeof item.goal !== 'string' ||
          typeof item.updatedAt !== 'string'
        )
          return false;
        seen.add(item.id);
        return true;
      });
    }
  } catch {
    /* Invalid local navigation does not prevent opening the library. */
  }
  // Only the legacy current work was actually open; the old recent list was a library query.
  if (raw === null && current) works = [loadingWork(current)];
  return {
    works,
    workId: works.some((item) => item.id === current)
      ? current
      : works[0]?.id || '',
  };
}

/** 本浏览器的有序打开入口、当前工作快照与 SSE 连接。 */
export function useConnection(
  setError: (error: string) => void,
  active = true,
) {
  const visible = useRef(active);
  visible.current = active;
  const [initial] = useState(restoreOpened);
  const [works, setWorks] = useState(initial.works);
  const worksRef = useRef(works);
  worksRef.current = works;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const [workId, setWorkId] = useState(initial.workId);
  const activeWorkId = useRef(initial.workId);
  const [configuration, setConfiguration] = useState<ModelConfiguration | null>(
    null,
  );
  const [connected, setConnected] = useState(false);
  const work = snapshot?.work;

  const updateEntry = useCallback((next: { work: WorkSummary }) => {
    const { work } = next;
    setWorks((prev) =>
      work.archivedAt
        ? prev.filter((item) => item.id !== work.id)
        : prev.map((item) =>
            item.id === work.id && item.updatedAt <= work.updatedAt
              ? {
                  id: work.id,
                  title: work.title,
                  goal: work.goal,
                  updatedAt: work.updatedAt,
                }
              : item,
          ),
    );
  }, []);
  const receive = useCallback(
    (next: Snapshot) => {
      if (activeWorkId.current !== next.work.id) return;
      const accepted = acceptSnapshot(snapshotRef.current, next);
      snapshotRef.current = accepted;
      setSnapshot(accepted);
      updateEntry(accepted);
    },
    [updateEntry],
  );

  useEffect(() => {
    localStorage.setItem(openedKey, JSON.stringify(works));
  }, [works]);
  const handleReadError = useCallback(
    (id: string, error: unknown) => {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'WORK_NOT_FOUND'
      ) {
        setWorks((prev) => prev.filter((item) => item.id !== id));
        if (activeWorkId.current === id) {
          activeWorkId.current = '';
          setWorkId('');
          setSnapshot(null);
          snapshotRef.current = null;
          setConnected(false);
          setError(errorText(error));
        }
        return;
      }
      if (activeWorkId.current === id) setError(errorText(error));
    },
    [setError],
  );
  const refreshWorks = useCallback(() => {
    // Refresh only explicitly opened entries; never repopulate from a sorted library page.
    for (const item of worksRef.current) {
      void api<Parameters<typeof updateEntry>[0]>(
        `/api/works/${item.id}?view=header`,
      )
        .then((next) => {
          updateEntry(next);
        })
        .catch((error) => handleReadError(item.id, error));
    }
  }, [handleReadError, updateEntry]);
  useEffect(() => {
    refreshWorks();
    void api<ModelConfiguration>('/api/config')
      .then(setConfiguration)
      .catch((e) => setError(errorText(e)));
  }, [refreshWorks, setError]);
  useEffect(() => {
    setConnected(false);
    if (workId) localStorage.setItem(currentKey, workId);
    else localStorage.removeItem(currentKey);
    if (!workId || !active) return;
    let alive = true;
    const controller = new AbortController();
    void fetch(`/api/works/${workId}?view=overview`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw Object.assign(Error(data.error || '读取失败'), {
            code: data.code,
          });
        return data as Snapshot;
      })
      .then((s) => {
        if (alive) receive(s);
      })
      .catch((e) => {
        if (alive) handleReadError(workId, e);
      });
    const events = new EventSource(`/api/works/${workId}/events?view=overview`);
    events.addEventListener('snapshot', (event) => {
      if (alive) {
        try {
          receive(JSON.parse((event as MessageEvent).data));
          setConnected(true);
        } catch {
          setError('状态更新无法读取，请重新打开工作。');
        }
      }
    });
    events.onopen = () => {
      if (alive) setConnected(true);
    };
    events.onerror = () => {
      if (alive) setConnected(false);
    };
    return () => {
      alive = false;
      controller.abort();
      events.close();
    };
  }, [workId, active, receive, setError, handleReadError]);

  /** 重新进入当前工作：保留快照与本地编辑，只刷新元数据。 */
  function refetch(id: string) {
    ensureOpened(id);
    if (!visible.current) return;
    void api<Snapshot>(`/api/works/${id}`)
      .then(receive)
      .catch((error) => {
        if (activeWorkId.current === id) handleReadError(id, error);
      });
  }
  function ensureOpened(id: string) {
    if (id)
      setWorks((prev) =>
        prev.some((item) => item.id === id) ? prev : [...prev, loadingWork(id)],
      );
  }
  /** 切换到另一个工作；调用方负责重置草稿与选择状态。空 ID 关闭当前连接。 */
  function switchTo(id: string) {
    ensureOpened(id);
    activeWorkId.current = id;
    setWorkId(id);
    setSnapshot(null);
    snapshotRef.current = null;
  }
  function closeEntry(id: string) {
    setWorks((prev) => prev.filter((item) => item.id !== id));
  }
  return {
    works,
    snapshot,
    snapshotRef,
    activeWorkId,
    workId,
    work,
    configuration,
    setConfiguration,
    connected,
    receive,
    refreshWorks,
    refetch,
    switchTo,
    closeEntry,
  };
}
