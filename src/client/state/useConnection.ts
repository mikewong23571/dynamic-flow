import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ModelConfiguration,
  Snapshot,
  WorkPage,
  WorkSummary,
} from '../../shared/records';
import { api } from '../core/api';
import { acceptSnapshot } from '../core/definition';
import { errorText } from '../core/format';

export type WorkList = WorkSummary[];

/** 工作库列表、当前工作快照与 SSE 连接。 */
export function useConnection(setError: (error: string) => void) {
  const [works, setWorks] = useState<WorkList>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const activeWorkId = useRef('');
  const [workId, setWorkId] = useState(
    () => localStorage.getItem('dynamic-flow.work') || '',
  );
  const [configuration, setConfiguration] = useState<ModelConfiguration | null>(
    null,
  );
  const [connected, setConnected] = useState(false);
  const work = snapshot?.work;
  const receive = useCallback((next: Snapshot) => {
    setSnapshot((prev) => {
      const accepted = acceptSnapshot(prev, next);
      snapshotRef.current = accepted;
      return accepted;
    });
  }, []);
  useEffect(() => {
    void api<WorkPage>('/api/works?page=1&pageSize=12')
      .then((r) => setWorks(r.works.slice(0, 12)))
      .catch((e) => setError(errorText(e)));
    void api<ModelConfiguration>('/api/config')
      .then(setConfiguration)
      .catch((e) => setError(errorText(e)));
  }, [setError]);
  useEffect(() => {
    if (!workId) return;
    activeWorkId.current = workId;
    let alive = true;
    setConnected(false);
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
    events.onopen = () => setConnected(true);
    events.onerror = () => setConnected(false);
    localStorage.setItem('dynamic-flow.work', workId);
    return () => {
      alive = false;
      events.close();
    };
  }, [workId, receive, setError]);
  useEffect(() => {
    if (!work) return;
    setWorks((prev) =>
      work.archivedAt
        ? prev.filter((w) => w.id !== work.id)
        : [
            {
              id: work.id,
              title: work.title,
              goal: work.goal,
              updatedAt: work.updatedAt,
            },
            ...prev.filter((w) => w.id !== work.id),
          ].slice(0, 12),
    );
  }, [snapshot]);
  function refreshWorks() {
    void api<WorkPage>('/api/works?page=1&pageSize=12')
      .then((page) => setWorks(page.works.slice(0, 12)))
      .catch((error) => setError(errorText(error)));
  }
  /** 重新进入当前工作：保留快照与本地编辑，只刷新元数据。 */
  function refetch(id: string) {
    void api<Snapshot>(`/api/works/${id}`)
      .then((next) => {
        if (activeWorkId.current === id) receive(next);
      })
      .catch((error) => {
        if (activeWorkId.current === id) setError(errorText(error));
      });
  }
  /** 切换到另一个工作；调用方负责重置草稿与选择状态。 */
  function switchTo(id: string) {
    activeWorkId.current = id;
    setWorkId(id);
    setSnapshot(null);
    snapshotRef.current = null;
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
  };
}
