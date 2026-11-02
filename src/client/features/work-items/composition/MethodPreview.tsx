import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { ViewState } from '../../../../shared/records';
import type { MethodCapability } from '../../../../shared/workitem-composition';
import { Modal } from '../../../components/ui';
import { Button } from '../../../components/ui/button';
import { WorkflowCanvas } from '../../canvas/WorkflowCanvas';

/** Inspect the exact saved definition referenced by a call; never substitute the current draft. */
export function MethodPreview({
  reference,
  method,
  onClose,
  onEdit,
}: {
  reference: { workId: string; definitionId: string };
  method?: MethodCapability;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [view, setView] = useState<ViewState>({ positions: {} });
  const [selected, setSelected] = useState<string>();
  const [returnFocus] = useState(() => document.activeElement);
  const definition =
    method?.workId === reference.workId &&
    method.definitionId === reference.definitionId
      ? method.definition
      : undefined;
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={method?.title || '引用的流水线'}
      className="composition-method-preview"
      onCloseAutoFocus={(event) => {
        if (returnFocus instanceof HTMLElement && returnFocus.isConnected) {
          event.preventDefault();
          returnFocus.focus();
        }
      }}
    >
      <div className="composition-method-preview-heading">
        <span className="muted">
          固定版本 <code>{reference.definitionId.slice(0, 8)}</code>
        </span>
        {method && (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            编辑当前草稿
            <ArrowUpRight size={14} />
          </Button>
        )}
      </div>
      {definition ? (
        <div
          className="composition-method-preview-canvas"
          aria-label="固定版本流水线"
        >
          <WorkflowCanvas
            definition={definition}
            view={view}
            selected={selected}
            onSelect={setSelected}
            onChange={() => {}}
            onLayout={setView}
            disabled
          />
        </div>
      ) : (
        <p role="alert" className="inline-error">
          无法读取此节点引用的固定流水线版本，未替换为其他版本。
        </p>
      )}
    </Modal>
  );
}
