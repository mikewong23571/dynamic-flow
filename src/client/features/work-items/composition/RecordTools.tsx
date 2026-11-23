import { ExternalLink, MoreHorizontal } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../../../components/ui/dropdown-menu';

/** Application utilities; business actions come from the saved view separately. */
export function RecordTools({
  hasSource,
  busy,
  canReviewCandidates,
  compareDisabled,
  onSource,
  onCite,
  onCreateChild,
  onCandidates,
  onCompare,
}: {
  hasSource: boolean;
  busy: boolean;
  canReviewCandidates: boolean;
  compareDisabled: boolean;
  onSource: () => void;
  onCite: () => void;
  onCreateChild: () => void;
  onCandidates: () => void;
  onCompare: () => void;
}) {
  return (
    <div className="composition-record-tools">
      {hasSource && (
        <Button variant="ghost" size="sm" onClick={onSource}>
          查看该记录来源
          <ExternalLink size={13} />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="更多记录操作"
            title="更多记录操作"
          >
            <MoreHorizontal size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {hasSource && (
            <>
              <DropdownMenuItem disabled={busy} onSelect={onCite}>
                加入完成依据
              </DropdownMenuItem>
              <DropdownMenuItem disabled={busy} onSelect={onCreateChild}>
                建立子工作项
              </DropdownMenuItem>
              {canReviewCandidates && (
                <DropdownMenuItem disabled={busy} onSelect={onCandidates}>
                  审阅候选子项
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem disabled={compareDisabled} onSelect={onCompare}>
            打开流水线
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
