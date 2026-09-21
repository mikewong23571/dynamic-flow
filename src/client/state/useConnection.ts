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
export function useConnection(setError: (error: string) => void) {
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

  const updateEntry = useCallback((next: Snapshot) => {
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
  const refreshWorks = useCallback(() => {
    // Refresh only explicitly opened entries; never repopulate from a sorted library page.
    for (const item of worksRef.current) {
      void api<Snapshot>(`/api/works/${item.id}`)
        .then((next) => {
          if (activeWorkId.current === item.id) receive(next);
          else updateEntry(next);
        })
        .catch((error) => setError(errorText(error)));
    }
  }, [receive, setError, updateEntry]);
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
    if (!workId) return;
    let alive = true;
    void api<Snapshot>(`/api/works/${workId}`)
      .then((s) => {
        if (alive) receive(s);
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      });
    const events = new EventSource(`/api/works/${workId}/events`);
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
      events.close();
    };
  }, [workId, receive, setError]);

  /** 重新进入当前工作：保留快照与本地编辑，只刷新元数据。 */
  function refetch(id: string) {
    ensureOpened(id);
    void api<Snapshot>(`/api/works/${id}`)
      .then(receive)
      .catch((error) => {
        if (activeWorkId.current === id) setError(errorText(error));
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
