import { Check, Plus, Save, X } from 'lucide-react';
import type {
  CompletionCriterion,
  WorkItemView,
  CriterionReference,
} from '../../../../shared/records';
import {} from '../../../components/ui';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { newId } from '../../../core/format';
export function CompositionAcceptance({
  item,
  criteria,
  onChange,
  busy,
  dirty,
  canComplete,
  onClose,
  onSave,
  onComplete,
  onReopen,
  onReference,
}: {
  item: WorkItemView;
  criteria: CompletionCriterion[];
  onChange: (criteria: CompletionCriterion[]) => void;
  busy: boolean;
  dirty: boolean;
  canComplete: boolean;
  onClose: () => void;
  onSave: () => void;
  onComplete: () => void;
  onReopen: () => void;
  onReference: (reference: CriterionReference) => void;
}) {
  const completed = item.status === 'completed';
  return (
    <section className="composition-confirmations">
      {criteria.map((entry, index) => {
        const saved = item.criteria.some(
          (value) => value.id === entry.id && value.text === entry.text,
        );
        return (
          <div key={entry.id} className="composition-confirmation-row">
            <input
              type="checkbox"
              aria-label={`确认条件 ${index + 1}`}
              title={saved ? undefined : '先保存条件定义'}
              checked={entry.met}
              disabled={completed || !saved || busy}
              onChange={(event) =>
                onChange(
                  criteria.map((value, i) =>
                    i === index
                      ? { ...value, met: event.target.checked }
                      : value,
                  ),
                )
              }
            />
            <Input
              aria-label={`完成条件 ${index + 1}`}
              value={entry.text}
              disabled={completed || busy}
              onChange={(event) =>
                onChange(
                  criteria.map((value, i) =>
                    i === index
                      ? {
                          ...value,
                          text: event.target.value,
                          met: false,
                          evidence: '',
                          references: undefined,
                        }
                      : value,
                  ),
                )
              }
            />
            <Button
              variant="ghost"
              aria-label={`删除条件 ${index + 1}`}
              disabled={completed || busy}
              onClick={() => onChange(criteria.filter((_, i) => i !== index))}
            >
              <X size={13} />
            </Button>
            <Textarea
              aria-label={`条件依据 ${index + 1}`}
              rows={2}
              value={entry.evidence}
              disabled={completed || !saved || busy}
              placeholder={saved ? '依据与核对说明' : '保存条件后填写依据'}
              onChange={(event) =>
                onChange(
                  criteria.map((value, i) =>
                    i === index
                      ? { ...value, evidence: event.target.value }
                      : value,
                  ),
                )
              }
            />
            {!!entry.references?.length && (
              <div className="composition-criterion-references">
                {entry.references.map((reference, index) => (
                  <Button
                    key={`${reference.resultId}:${reference.port}:${reference.index}`}
                    variant="ghost"
                    onClick={() => onReference(reference)}
                  >
                    查看依据 {index + 1} · {reference.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="inline-group">
        {completed ? (
          <Button variant="outline" onClick={onReopen}>
            重新打开
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                onChange([
                  ...criteria,
                  { id: newId(), text: '', met: false, evidence: '' },
                ])
              }
            >
              <Plus size={14} />
              添加条件
            </Button>
            {(criteria.length > 0 || dirty) && (
              <Button
                variant="outline"
                disabled={busy || !dirty}
                onClick={onSave}
              >
                <Save size={14} />
                保存条件
              </Button>
            )}
            <Button
              variant="default"
              disabled={busy || !canComplete}
              onClick={onComplete}
            >
              <Check size={14} />
              确认结项
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
