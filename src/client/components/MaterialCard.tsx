import { useState } from 'react';
import type { WorkItemInput } from '../../shared/records';
import { FileText } from 'lucide-react';
import { materialPresentation } from '../core/material';
import { MaterialDialog } from './MaterialDialog';
import { Button } from './ui';
import './MaterialCard.css';

export function MaterialCard({
  material,
  selection,
  onOpen,
  onSource,
}: {
  material: WorkItemInput['materials'][number];
  selection?: { checked: boolean; disabled?: boolean; onChange: () => void };
  onOpen?: () => void;
  onSource?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { title, summary } = materialPresentation(material);
  return (
    <article
      className="material-card"
      data-material-id={material.id}
      aria-label={title}
    >
      <div className="material-card-heading">
        {selection ? (
          <input
            type="checkbox"
            aria-label={`选择材料 ${title}（${material.id}）`}
            checked={selection.checked}
            disabled={selection.disabled}
            onChange={selection.onChange}
          />
        ) : (
          <FileText size={16} aria-hidden="true" />
        )}
        <strong title={title}>{title}</strong>
        <code title="引用编号">{material.id}</code>
      </div>
      <p className="material-card-summary">{summary}</p>
      <div className="material-card-actions">
        {onOpen ? (
          <Button
            onClick={onOpen}
            aria-label={`查看材料 ${title}（${material.id}）`}
          >
            查看材料
          </Button>
        ) : (
          <MaterialDialog
            material={material}
            open={open}
            onOpenChange={setOpen}
            onSource={onSource}
            trigger={
              <Button aria-label={`查看材料 ${title}（${material.id}）`}>
                查看材料
              </Button>
            }
          />
        )}
      </div>
    </article>
  );
}
