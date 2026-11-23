import { Workflow, X } from 'lucide-react';
import type { MethodReference } from '../../../shared/records';
import { Button } from '../../components/ui/button';

export function MethodReferences({
  references,
  onOpen,
  onRemove,
}: {
  references: MethodReference[];
  onOpen?: (reference: MethodReference) => void;
  onRemove?: (reference: MethodReference) => void;
}) {
  if (!references.length) return null;
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5" aria-label="引用的流水线">
      {references.map((reference) => (
        <span
          key={`${reference.workId}:${reference.definitionId}`}
          className="inline-flex max-w-full items-center rounded-md border border-input"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-w-0 gap-1.5"
            title={`固定版本 ${reference.definitionId}`}
            onClick={() => onOpen?.(reference)}
            disabled={!onOpen}
          >
            <Workflow className="shrink-0" size={13} />
            <span className="truncate">{reference.title}</span>
            <span className="shrink-0 text-muted-foreground">
              {reference.definitionId.slice(0, 8)}
            </span>
          </Button>
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`移除引用 ${reference.title}`}
              onClick={() => onRemove(reference)}
            >
              <X size={12} />
            </Button>
          )}
        </span>
      ))}
    </div>
  );
}
