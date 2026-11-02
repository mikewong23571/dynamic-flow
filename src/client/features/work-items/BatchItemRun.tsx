import { useEffect, useRef, useState } from 'react';
import type {
  ItemPreparation,
  WorkSummary,
  WorkItemSummaryPage,
} from '../../../shared/records';
import { api } from '../../core/api';
import { errorText, workTitle, statusNames } from '../../core/format';
import { Button, Modal } from '../../components/ui';
import { NativeSelect } from '../../components/ui/native-select';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '../../components/ui/table';

export type BatchRow = {
  id: string;
  title: string;
  preparation?: ItemPreparation;
  error?: string;
  runId?: string;
  status?: string;
  starting?: boolean;
};
/** 批次在应用内持续推进，每个子项仍是独立运行。 */
export function BatchItemRun({
  ids,
  parentId,
  methods,
  onOpen,
  onClose,
  savedRows,
  onRows,
}: {
  ids: string[];
  parentId: string;
  savedRows?: BatchRow[];
  onRows: (rows: BatchRow[]) => void;
  methods: WorkSummary[];
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [methodId, setMethodId] = useState('');
  const [rows, setRows] = useState<BatchRow[]>(
    ids.map(
      (id) =>
        savedRows?.find((row) => row.id === id) || { id, title: '正在读取' },
    ),
  );
  useEffect(() => {
    onRows(rows);
  }, [rows]);
  const [preparing, setPreparing] = useState(false);
  const [running, setRunning] = useState(false);
  const [batchId, setBatchId] = useState<string>();
  const [batchError, setBatchError] = useState('');
  const live = useRef(true);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const update = (id: string, patch: Partial<BatchRow>) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    void api<WorkItemSummaryPage>(
      `/api/items?summary=true&ids=${encodeURIComponent(ids.join(','))}`,
    ).then((page) =>
      setRows((current) =>
        current.map((row) => ({
          ...row,
          title:
            page.items.find((item) => item.id === row.id)?.title || '工作项',
        })),
      ),
    );
  }, [ids]);
  async function prepare() {
    setPreparing(true);
    for (const row of rowsRef.current.filter((row) => !row.runId)) {
      if (!live.current) break;
      try {
        let workspace = await api<
          import('../../../shared/workitem-composition').ItemWorkspace
        >(`/api/items/${row.id}/workspace`);
        if (methodId) {
          const method = await api<import('../../../shared/records').Snapshot>(
            `/api/works/${methodId}`,
          );
          workspace = await api(`/api/items/${row.id}/workspace/actions`, {
            action: 'useMethod',
            baseRevision: workspace.item.revision,
            methodId,
            definitionId: method.work.adoptedId || method.work.draftId,
          });
        }
        const preparation = await api<ItemPreparation>(
          `/api/items/${row.id}/prepare`,
          {},
        );
        update(row.id, { preparation, error: undefined });
      } catch (e) {
        update(row.id, { error: errorText(e) });
      }
    }
    setPreparing(false);
  }
  useEffect(() => {
    if (!batchId) return;
    let live = true;
    async function refresh() {
      try {
        const batch = await api<{
          status: string;
          entries: {
            itemId: string;
            runId?: string;
            status: string;
            error?: string;
          }[];
        }>(`/api/item-batches/${batchId}`);
        if (!live) return;
        setRunning(batch.status === 'running');
        setRows((current) =>
          current.map((row) => {
            const entry = batch.entries.find((e) => e.itemId === row.id);
            return entry
              ? {
                  ...row,
                  runId: entry.runId,
                  status: entry.status,
                  starting: entry.status === 'starting',
                  error: entry.error,
                }
              : row;
          }),
        );
      } catch (e) {
        if (live) setBatchError(errorText(e));
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [batchId]);
  async function startBatch() {
    const entries = rowsRef.current
      .filter(
        (row) =>
          !row.runId &&
          row.preparation &&
          !row.preparation.issues.length &&
          !row.error,
      )
      .map((row) => ({
        itemId: row.id,
        selection: {
          baseRevision: row.preparation!.baseRevision,
          definitionId: row.preparation!.definitionId,
          scope: 'full',
          inputBindings: row.preparation!.inputBindings,
        },
      }));
    setPreparing(true);
    setBatchError('');
    try {
      const batch = await api<{ id: string }>('/api/item-batches', {
        parentId,
        title: '子项批量处理',
        concurrency: 2,
        entries,
      });
      setBatchId(batch.id);
      setRunning(true);
    } catch (e) {
      setBatchError(errorText(e));
    } finally {
      setPreparing(false);
    }
  }
  async function pauseBatch() {
    if (!batchId) return;
    try {
      await api(`/api/item-batches/${batchId}/actions`, { action: 'pause' });
      setRunning(false);
    } catch (e) {
      setBatchError(errorText(e));
    }
  }
  const ready = rows.filter(
    (row) =>
      !row.runId &&
      row.preparation &&
      !row.preparation.issues.length &&
      !row.error,
  ).length;
  return (
    <Modal
      title="批量处理"
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <div className="stack">
        <label className="field">
          处理方法
          <NativeSelect
            value={methodId}
            disabled={running || preparing || rows.some((r) => r.runId)}
            onChange={(e) => {
              setMethodId(e.target.value);
              setRows((current) =>
                current.map((row) => ({ ...row, preparation: undefined })),
              );
            }}
          >
            <option value="">沿用各项方法</option>
            {methods.map((method) => (
              <option value={method.id} key={method.id}>
                {workTitle(method)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <div className="inline-group">
          <span>已启动 {rows.filter((row) => row.runId).length}</span>
          <span>可启动 {ready}</span>
          <span>
            需补充{' '}
            {
              rows.filter((row) => row.error || row.preparation?.issues.length)
                .length
            }
          </span>
        </div>
        <div className="max-h-96 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>工作项</TableHead>
                <TableHead>处理状态</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.title}</TableCell>
                  <TableCell>
                    {row.starting
                      ? '正在启动'
                      : row.runId
                        ? statusNames[row.status || 'queued']
                        : row.error ||
                          row.preparation?.issues.join('；') ||
                          (batchId && row.status === 'pending'
                            ? '等待启动'
                            : row.preparation
                              ? '可启动'
                              : '未准备')}
                  </TableCell>
                  <TableCell>
                    <Button onClick={() => onOpen(row.id)}>查看</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {batchError && (
          <p role="alert" className="inline-error">
            {batchError}
          </p>
        )}
        <div className="modal-actions">
          <Button
            disabled={!!batchId || running || preparing}
            onClick={() => void prepare()}
          >
            准备输入
          </Button>
          {running ? (
            <Button onClick={() => void pauseBatch()}>暂停启动</Button>
          ) : (
            <Button
              variant="primary"
              disabled={!!batchId || !ready || preparing}
              onClick={() => void startBatch()}
            >
              启动就绪项
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
