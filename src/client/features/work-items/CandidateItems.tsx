import { useEffect, useState, useRef } from 'react';
import type {
  CandidateSource,
  WorkItemCandidate,
  ChildCreationReceipt,
  WorkItemView,
  WorkItemSummaryPage,
} from '../../../shared/records';
import { api } from '../../core/api';
import { errorText } from '../../core/format';
import { Button, Modal } from '../../components/ui';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { NativeSelect } from '../../components/ui/native-select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../components/ui/table';
import { ListPagination } from '../../components/Management';
import { DeferredDetails } from '../../components/DeferredContent';
import { ArtifactValue } from '../results/ArtifactValue';

export function CandidateItems({
  item,
  source,
  onClose,
  onOpen,
  onChanged,
}: {
  item: WorkItemView;
  source: CandidateSource;
  onClose: () => void;
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const [candidates, setCandidates] = useState<WorkItemCandidate[]>([]);
  const [total, setTotal] = useState(0);
  const [allIds, setAllIds] = useState<string[]>([]);
  const edits = useRef(new Map<string, WorkItemCandidate>());
  const initial = useRef(false);
  const [receipts, setReceipts] = useState<ChildCreationReceipt[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [ancestors, setAncestors] = useState<{ id: string; title: string }[]>(
    [],
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<WorkItemSummaryPage>();
  const [linkQuery, setLinkQuery] = useState('');
  useEffect(() => {
    let live = true;
    void api<{
      candidates: WorkItemCandidate[];
      receipts: ChildCreationReceipt[];
      total: number;
      candidateIds: string[];
    }>(`/api/items/${item.id}/actions`, {
      action: 'candidates',
      source,
      page,
      pageSize,
    })
      .then((data) => {
        if (!live) return;
        setCandidates(
          data.candidates.map(
            (candidate) =>
              edits.current.get(candidate.id) || {
                ...candidate,
                title:
                  typeof candidate.title === 'string' ? candidate.title : '',
                goal: typeof candidate.goal === 'string' ? candidate.goal : '',
                inputs: Array.isArray(candidate.inputs) ? candidate.inputs : [],
              },
          ),
        );
        setTotal(data.total);
        setAllIds(data.candidateIds);
        setReceipts([
          ...new Map(
            data.receipts.map((receipt) => [receipt.candidateId, receipt]),
          ).values(),
        ]);
        const done = new Set(
          data.receipts.filter((r) => r.childId).map((r) => r.candidateId),
        );
        if (!initial.current) {
          initial.current = true;
          setSelected(data.candidateIds.filter((id) => !done.has(id)));
        }
      })
      .catch((e) => setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [item.id, source, page, pageSize]);
  useEffect(() => {
    let live = true;
    void api<WorkItemSummaryPage>(
      `/api/items?summary=true&parentId=${item.id}&view=children&pageSize=25&query=${encodeURIComponent(linkQuery)}`,
    )
      .then((data) => {
        if (live) setExisting(data);
      })
      .catch((e) => setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [item.id, linkQuery]);
  function edit(id: string, patch: Partial<WorkItemCandidate>) {
    setCandidates((rows) =>
      rows.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        edits.current.set(id, next);
        return next;
      }),
    );
  }
  async function create(
    ids = selected,
    confirmReopen = false,
    appendInputs = false,
  ) {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ receipts: ChildCreationReceipt[] }>(
        `/api/items/${item.id}/actions`,
        {
          action: 'createChildren',
          confirmReopen,
          appendInputs,
          source,
          candidateIds: ids,
          edits: [...edits.current.values()].filter((c) => ids.includes(c.id)),
        },
      );
      setReceipts((current) => [
        ...current.filter((r) => !ids.includes(r.candidateId)),
        ...result.receipts,
      ]);
      setSelected((current) =>
        current.filter(
          (id) =>
            !result.receipts.some((r) => r.candidateId === id && r.childId),
        ),
      );
      onChanged();
    } catch (e) {
      const affected = (
        e as { affectedAncestors?: { id: string; title: string }[] }
      ).affectedAncestors;
      if (affected?.length) setAncestors(affected);
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const done = (id: string) =>
    [...receipts].reverse().find((r) => r.candidateId === id);
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={source.kind === 'node-input' ? '子项清单' : '建立子项'}
      className="item-candidates-dialog"
    >
      <div className="stack">
        <div className="materials-toolbar">
          <span>
            问题 {total} · 已选 {selected.length}
          </span>
          <Button
            disabled={busy}
            onClick={() =>
              setSelected(allIds.filter((id) => !done(id)?.childId))
            }
          >
            选择未建立项
          </Button>
        </div>
        <label className="field">
          查找可关联的已有子项
          <Input
            value={linkQuery}
            onChange={(e) => setLinkQuery(e.target.value)}
            placeholder="按名称查找"
          />
        </label>
        <div className="candidate-list-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>问题与已有材料</TableHead>
                <TableHead>建立结果</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((candidate) => {
                const receipt = done(candidate.id);
                return (
                  <TableRow key={candidate.id} data-candidate-id={candidate.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`选择候选 ${candidate.title || candidate.id}`}
                        checked={selected.includes(candidate.id)}
                        disabled={busy || !!receipt?.childId}
                        onChange={(e) =>
                          setSelected((ids) =>
                            e.target.checked
                              ? [...ids, candidate.id]
                              : ids.filter((id) => id !== candidate.id),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="stack">
                        <Input
                          aria-label={`子项目标 ${candidate.id}`}
                          value={candidate.title}
                          disabled={!!receipt?.childId || busy}
                          onChange={(e) =>
                            edit(candidate.id, { title: e.target.value })
                          }
                        />
                        <Textarea
                          aria-label={`处理范围 ${candidate.id}`}
                          rows={2}
                          value={candidate.goal}
                          disabled={!!receipt?.childId || busy}
                          onChange={(e) =>
                            edit(candidate.id, { goal: e.target.value })
                          }
                        />
                        <DeferredDetails
                          summary={`已有材料 ${candidate.inputs.length}`}
                        >
                          {() => (
                            <>
                              {candidate.inputs.map((input, index) => (
                                <div key={index}>
                                  <strong>{input.label}</strong>
                                  <ArtifactValue value={input.value} />
                                </div>
                              ))}
                            </>
                          )}
                        </DeferredDetails>
                        {!receipt?.childId && (
                          <NativeSelect
                            aria-label={`关联已有项 ${candidate.id}`}
                            value={candidate.existingChildId || ''}
                            onChange={(e) =>
                              edit(candidate.id, {
                                existingChildId: e.target.value || undefined,
                              })
                            }
                          >
                            <option value="">建立新子项</option>
                            {existing?.items.map((row) => (
                              <option key={row.id} value={row.id}>
                                {row.title}
                                {row.parentScope?.status === 'excluded'
                                  ? ' · 已排除'
                                  : ''}
                              </option>
                            ))}
                          </NativeSelect>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {receipt?.childId ? (
                        <div className="stack">
                          <Button onClick={() => onOpen(receipt.childId!)}>
                            {receipt.status === 'linked'
                              ? '查看关联项'
                              : '查看子项'}
                          </Button>
                          {(receipt.status === 'linked' ||
                            receipt.status === 'failed') && (
                            <Button
                              disabled={busy || receipt.inputsAppended}
                              onClick={() =>
                                void create([candidate.id], false, true)
                              }
                            >
                              {receipt.inputsAppended
                                ? '已补充材料'
                                : '补充材料'}
                            </Button>
                          )}
                          {receipt.error && (
                            <span role="alert" className="inline-error">
                              {receipt.error}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span
                          className={receipt?.error ? 'inline-error' : 'muted'}
                        >
                          {receipt?.error ||
                            (!candidate.goal ? '补充处理范围' : '未建立')}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <ListPagination
          page={page}
          pageSize={pageSize}
          total={total}
          loading={false}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
        {!!ancestors.length && (
          <div>
            <strong>以下工作项将重新打开</strong>
            <ul>
              {ancestors.map((a) => (
                <li key={a.id}>{a.title}</li>
              ))}
            </ul>
            <Button disabled={busy} onClick={() => void create(selected, true)}>
              重开并建立子项
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button onClick={onClose}>关闭</Button>
          {receipts.some((r) => !r.childId) && (
            <Button
              disabled={busy}
              onClick={() =>
                void create(
                  receipts.filter((r) => !r.childId).map((r) => r.candidateId),
                )
              }
            >
              重试未建立项
            </Button>
          )}
          <Button
            variant="primary"
            disabled={busy || !selected.length}
            onClick={() => void create()}
          >
            建立所选子项
          </Button>
        </div>
      </div>
    </Modal>
  );
}
