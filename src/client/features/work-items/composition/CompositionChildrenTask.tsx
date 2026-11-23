import { useState } from 'react';
import type {
  ItemInputSelection,
  ReceivedItemInput,
  Snapshot,
  WorkItemSummary,
  WorkItemView,
  WorkSummary,
} from '../../../../shared/records';
import { api } from '../../../core/api';
import { errorText } from '../../../core/format';
import { Modal } from '../../../components/ui';
import { ItemRelations, type RelationLocation } from '../ItemRelations';
import { CreateItemDialog } from '../WorkItemDialogs';
import { PrepareItemRun } from '../PrepareItemRun';
/** Explicit child business identities and the selected stage/completion handoff. */
export function CompositionChildrenTask({
  item,
  methods,
  snapshot,
  mode,
  onMode,
  initialInput,
  location,
  onLocation,
  onOpen,
  onMethod,
  onChanged,
  onCounts,
}: {
  item: WorkItemView;
  methods: WorkSummary[];
  snapshot?: Snapshot;
  mode?: 'manage' | 'create';
  onMode: (mode?: 'manage' | 'create') => void;
  initialInput?: Omit<ReceivedItemInput, 'id'>;
  location: RelationLocation;
  onLocation: (next: RelationLocation) => void;
  onOpen: (id: string) => void;
  onMethod: (id: string) => void;
  onChanged: () => Promise<unknown>;
  onCounts: (counts: WorkItemSummary) => void;
}) {
  const [preparing, setPreparing] = useState<ItemInputSelection[] | null>();
  const [error, setError] = useState('');
  async function summarize(source: 'stage' | 'completion') {
    setError('');
    try {
      if (source === 'completion') {
        const data = await api<{ selections: ItemInputSelection[] }>(
          `/api/items/${item.id}/actions`,
          { action: 'completionInputs' },
        );
        setPreparing(data.selections);
      } else setPreparing(null);
      onMode(undefined);
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <>
      <Modal
        open={mode === 'manage'}
        onOpenChange={(open) => {
          if (!open) onMode(undefined);
        }}
        title="子工作项"
        className="composition-children-dialog"
      >
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <ItemRelations
          item={item}
          methods={methods}
          active={mode === 'manage'}
          location={location}
          onLocation={onLocation}
          onOpen={(id) => {
            onMode(undefined);
            onOpen(id);
          }}
          onChanged={() =>
            void onChanged().catch((e) => setError(errorText(e)))
          }
          onCounts={onCounts}
          onSummarize={(source) => void summarize(source)}
        />
      </Modal>
      <CreateItemDialog
        open={mode === 'create'}
        onOpenChange={(open) => {
          if (!open) onMode(undefined);
        }}
        parent={item}
        initialInput={initialInput}
        methods={methods}
        onCreated={() => {
          void onChanged();
          onMode('manage');
        }}
      />
      {preparing !== undefined && (
        <PrepareItemRun
          item={item}
          initialSelections={preparing || undefined}
          methods={methods}
          onClose={() => setPreparing(undefined)}
          onEditMethod={onMethod}
          onStarted={() => {
            setPreparing(undefined);
            void onChanged();
          }}
        />
      )}
    </>
  );
}
