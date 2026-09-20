import { Check } from 'lucide-react';
import type { Snapshot } from '../../shared/records';
import { Button } from '../components/ui';

/** 候选底栏：候选做法的变化摘要与采用/放弃。 */
export function CandidateBar({
  draftId,
  changes,
  busy,
  dirty,
  perform,
}: {
  draftId: string;
  changes: string[];
  busy: boolean;
  dirty: boolean;
  perform: (
    name: string,
    fields?: Record<string, unknown>,
  ) => Promise<Snapshot | undefined>;
}) {
  return (
    <footer className="candidate-bar">
      <div>
        <span className="candidate-dot" />
        <strong>候选做法</strong>
        <span>{changes.join(' · ') || '与起点相同'}</span>
      </div>
      <div>
        <Button
          variant="ghost"
          disabled={busy || dirty}
          onClick={() => void perform('discardDraft')}
        >
          放弃候选
        </Button>
        <Button
          disabled={busy || dirty}
          onClick={() => void perform('adopt', { definitionId: draftId })}
        >
          采用做法
          <Check size={15} />
        </Button>
      </div>
    </footer>
  );
}
