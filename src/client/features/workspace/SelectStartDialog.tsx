import type { Snapshot, Work } from '../../../shared/records';
import { short } from '../../core/format';
import { Button, Modal } from '../../components/ui';

/** 选择改进的起点：从问题结果或现有版本创建候选做法。 */
export function SelectStartDialog({
  candidateSource,
  setCandidateSource,
  sourceChoice,
  setSourceChoice,
  replaceDraft,
  setReplaceDraft,
  work,
  dirty,
  busy,
  perform,
  setTab,
  setPanel,
}: {
  candidateSource?: string;
  setCandidateSource: (source: string | undefined) => void;
  sourceChoice: string;
  setSourceChoice: (choice: string) => void;
  replaceDraft: boolean;
  setReplaceDraft: (replace: boolean) => void;
  work?: Work;
  dirty: boolean;
  busy: boolean;
  perform: (
    name: string,
    fields?: Record<string, unknown>,
  ) => Promise<Snapshot | undefined>;
  setTab: (tab: 'canvas' | 'results' | 'compare') => void;
  setPanel: (panel: 'inspector' | 'assistant' | null) => void;
}) {
  return (
    <Modal
      open={!!candidateSource}
      onOpenChange={(v) => !v && setCandidateSource(undefined)}
      title="选择改进的起点"
      description="历史结果属于它自己的做法版本。选择起点后创建候选，不会改写原运行。"
    >
      <label className="field">
        起点版本
        <select
          value={sourceChoice}
          onChange={(e) => setSourceChoice(e.target.value)}
        >
          {[
            ...new Set(
              [candidateSource, work?.adoptedId, work?.draftId].filter(Boolean),
            ),
          ].map((id) => (
            <option key={id} value={id}>
              {id === candidateSource
                ? '问题结果的版本'
                : id === work?.adoptedId
                  ? '当前采用的版本'
                  : '现有候选'}{' '}
              · {short(id)}
            </option>
          ))}
        </select>
      </label>
      {work?.draftId &&
        work.draftId !== work.adoptedId &&
        work.draftId !== sourceChoice && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={replaceDraft}
              onChange={(e) => setReplaceDraft(e.target.checked)}
            />
            替换现有候选（历史定义和结果仍保留）
          </label>
        )}
      {dirty && <p className="notice">请先保存未提交的画布修改。</p>}
      <Button
        variant="primary"
        disabled={
          busy ||
          dirty ||
          (!!work?.draftId &&
            work.draftId !== work.adoptedId &&
            work.draftId !== sourceChoice &&
            !replaceDraft)
        }
        onClick={async () => {
          const next = await perform('beginCandidate', {
            sourceId: sourceChoice,
            replaceExisting: replaceDraft,
          });
          if (next) {
            setCandidateSource(undefined);
            setTab('canvas');
            setPanel('inspector');
          }
        }}
      >
        创建候选
      </Button>
    </Modal>
  );
}
