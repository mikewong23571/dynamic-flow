import { FormActions } from '../../../components/ui/field';
import { Field } from '../../../components/ui/field';
import { useEffect, useRef, useState } from 'react';
import type {
  CompletionCriterion,
  WorkItemSummary,
  WorkItemView,
  CriterionReference,
} from '../../../../shared/records';
import { Modal } from '../../../components/ui';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { errorText } from '../../../core/format';
import { CompositionAcceptance } from './CompositionAcceptance';
export type AcceptanceDraft = {
  criteria?: CompletionCriterion[];
  criteriaBase?: string;
};
/** Owns definition-before-confirmation, persisted draft, and explicit reopening. */
export function CompositionAcceptanceTask({
  item,
  open,
  busy,
  running,
  childCounts,
  initialDraft,
  onDraft,
  onClose,
  onChildren,
  onCommand,
  onReference,
}: {
  item: WorkItemView;
  open: boolean;
  busy: boolean;
  running: boolean;
  childCounts?: WorkItemSummary;
  initialDraft?: AcceptanceDraft;
  onDraft: (draft: AcceptanceDraft) => void;
  onClose: () => void;
  onChildren: () => void;
  onCommand: (
    action: string,
    fields?: Record<string, unknown>,
  ) => Promise<WorkItemView>;
  onReference: (reference: CriterionReference) => void;
}) {
  const [criteria, setCriteria] = useState(
    initialDraft?.criteriaBase === JSON.stringify(item.criteria) &&
      initialDraft.criteria
      ? initialDraft.criteria
      : item.criteria,
  );
  const [reopening, setReopening] = useState(false),
    [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [ancestors, setAncestors] = useState<{ id: string; title: string }[]>([]);
  const base = useRef(JSON.stringify(item.criteria)),
    revision = useRef(item.revision);
  const dirty = JSON.stringify(criteria) !== JSON.stringify(item.criteria);
  useEffect(() => {
    const next = JSON.stringify(item.criteria);
    if (next !== base.current) {
      if (JSON.stringify(criteria) === base.current) setCriteria(item.criteria);
      base.current = next;
    }
  }, [item.criteria, criteria]);
  useEffect(() => {
    if (open && !dirty && !reopening) revision.current = item.revision;
  }, [open, dirty, reopening, item.revision]);
  useEffect(() => {
    onDraft({ criteria, criteriaBase: JSON.stringify(item.criteria) });
  }, [criteria, item.criteria, onDraft]);
  const canComplete =
    (criteria.length > 0 || !!childCounts?.total) &&
    !dirty &&
    criteria.every(
      (c) => c.met && (c.evidence.trim() || c.references?.length),
    ) &&
    !running &&
    (!childCounts?.total || childCounts.total === childCounts.completed);
  function attempt(action: () => Promise<unknown>) {
    setError('');
    void action().catch((e) => setError(errorText(e)));
  }
  async function reopen(confirmReopen = false) {
    try {
      await onCommand('reopen', {
        reason,
        confirmReopen,
        baseRevision: revision.current,
      });
      setReopening(false);
      onClose();
    } catch (error) {
      const affected = (
        error as { affectedAncestors?: { id: string; title: string }[] }
      ).affectedAncestors;
      if (affected?.length) setAncestors(affected);
      throw error;
    }
  }
  return (
    <>
      <Modal
        open={open && !reopening}
        onOpenChange={(value) => {
          if (!value) onClose();
        }}
        title="完成条件"
        className="composition-acceptance-dialog"
      >
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        {!!childCounts?.total && (
          <p className="meta-text">
            范围内子项已结项 {childCounts.completed}/{childCounts.total}
            <Button variant="ghost" onClick={onChildren}>
              检查子项
            </Button>
          </p>
        )}
        <CompositionAcceptance
          item={item}
          criteria={criteria}
          onChange={setCriteria}
          busy={busy}
          dirty={dirty}
          canComplete={canComplete}
          onClose={onClose}
          onSave={() =>
            attempt(async () => {
              const next = await onCommand('criteria', {
                criteria,
                baseRevision: revision.current,
              });
              setCriteria(next.criteria);
              revision.current = next.revision;
            })
          }
          onComplete={() =>
            attempt(() =>
              onCommand('complete', { baseRevision: revision.current }),
            )
          }
          onReopen={() => {
            setReason('');
            setAncestors([]);
            revision.current = item.revision;
            setReopening(true);
          }}
          onReference={onReference}
        />
      </Modal>
      <Modal
        open={reopening}
        onOpenChange={setReopening}
        title="重新打开工作项"
      >
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            attempt(() => reopen());
          }}
        >
          <Field>
            重开原因
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </Field>
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          {!!ancestors.length && (
            <div>
              <p>
                此操作将同时重新打开：{ancestors.map((a) => a.title).join('、')}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => attempt(() => reopen(true))}
              >
                同时重开上级与本项
              </Button>
            </div>
          )}
          <FormActions>
            <Button variant="default" disabled={busy}>
              重新打开
            </Button>
          </FormActions>
        </form>
      </Modal>
    </>
  );
}
