import { useEffect, useState } from 'react';
import { api } from '../../core/api';
import { errorText } from '../../core/format';
import { Button } from '../../components/ui/button';

type BatchSummary = {
  id: string;
  title: string;
  status: 'running' | 'paused' | 'completed';
  reason?: string;
  counts: Record<string, number>;
};
export function ItemBatchProgress({
  itemId,
  active,
}: {
  itemId: string;
  active: boolean;
}) {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!active) return;
    let live = true;
    async function refresh() {
      try {
        const value = await api<BatchSummary[]>(
          `/api/item-batches?parentId=${encodeURIComponent(itemId)}`,
        );
        if (live) {
          setBatches(value);
          setError('');
        }
      } catch (e) {
        if (live) setError(errorText(e));
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [itemId, active]);
  async function act(id: string, action: 'pause' | 'resume') {
    setBusy(true);
    try {
      await api(`/api/item-batches/${id}/actions`, { action });
      setBatches(
        await api<BatchSummary[]>(
          `/api/item-batches?parentId=${encodeURIComponent(itemId)}`,
        ),
      );
      setError('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (!batches.length && !error) return null;
  return (
    <div className="stack" aria-label="自动处理进度">
      {batches.map((batch) => (
        <div
          key={batch.id}
          className="rounded-md border border-border bg-card p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <strong>{batch.title}</strong>
                <span className="text-sm text-muted-foreground">
                  {batch.status === 'running'
                    ? '自动处理中'
                    : batch.status === 'paused'
                      ? '已暂停'
                      : '批次处理结束'}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>待启动 {batch.counts.pending || 0}</span>
                <span>
                  运行中{' '}
                  {(batch.counts.running || 0) + (batch.counts.starting || 0)}
                </span>
                <span>已完成 {batch.counts.completed || 0}</span>
                <span>失败 {batch.counts.failed || 0}</span>
                {!!batch.counts.waiting && (
                  <span>等待 {batch.counts.waiting}</span>
                )}
                {!!batch.counts.interrupted && (
                  <span>中断 {batch.counts.interrupted}</span>
                )}
              </div>
              {batch.reason && (
                <p className="text-sm text-muted-foreground">{batch.reason}</p>
              )}
            </div>
            {batch.status !== 'completed' && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void act(
                    batch.id,
                    batch.status === 'running' ? 'pause' : 'resume',
                  )
                }
              >
                {batch.status === 'running' ? '暂停后续启动' : '继续启动'}
              </Button>
            )}
          </div>
        </div>
      ))}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </div>
  );
}
