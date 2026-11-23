import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Json } from '../../../shared/records';
import { Badge } from '../../components/ui';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '../../components/ui/dropdown-menu';
import { ArtifactPreview } from './ArtifactPreview';
import './RunInspector.css';

export function RunGroupNavigation({
  items,
  selectedId,
  onSelect,
  label = '处理环节',
}: {
  items: { id: string; label: string; status: string; count?: number }[];
  selectedId?: string;
  onSelect: (id: string) => void;
  label?: string;
}) {
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    const current = element.current?.querySelector<HTMLElement>(
      '[aria-current="step"]',
    );
    if (current && element.current)
      element.current.scrollLeft =
        current.offsetLeft - element.current.offsetLeft;
  }, [selectedId]);
  return (
    <nav ref={element} className="item-steps" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          aria-current={selectedId === item.id ? 'step' : undefined}
          onClick={() => onSelect(item.id)}
        >
          <span className="item-step-title" title={item.label}>
            {item.label}
          </span>
          {item.count !== undefined && item.count > 1 && (
            <span className="meta-text">{item.count}</span>
          )}
          <Badge status={item.status} iconOnly />
        </button>
      ))}
    </nav>
  );
}

export type RunInstanceChoice = {
  id: string;
  resultId: string;
  label: string;
  status: string;
  value?: Json;
  iteration?: number;
  purpose?: string;
  intermediate?: boolean;
};
export function RunInstancePicker({
  items,
  selectedId,
  onSelect,
}: {
  items: RunInstanceChoice[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  if (items.length <= 1) return null;
  const selected = items.find((item) => item.id === selectedId);
  const current = items.findIndex((item) => item.id === selectedId);
  return (
    <div className="item-instance-select">
      <Button
        size="sm"
        variant="ghost"
        aria-label="上一项成果"
        disabled={current <= 0}
        onClick={() => onSelect(items[current - 1].id)}
      >
        <ChevronLeft size={14} />
        上一项
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" aria-label="执行实例" variant="ghost">
            {selected?.label || '选择实例'} / {items.length} 项{' '}
            <ChevronDown size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="run-instance-menu" align="start">
          <DropdownMenuRadioGroup
            value={selectedId || ''}
            onValueChange={onSelect}
          >
            {items.map((item) => (
              <DropdownMenuRadioItem
                key={item.id}
                value={item.id}
                data-result-id={item.resultId}
                data-choice-id={item.id}
                className="run-instance-option"
              >
                <div>
                  <div className="run-instance-option-heading">
                    <strong>{item.label}</strong>
                    <Badge status={item.status} />
                    {item.iteration ? (
                      <span>第 {item.iteration} 轮迭代</span>
                    ) : null}
                    {item.purpose ? <span>规划</span> : null}
                    {item.intermediate ? <span>中间结果</span> : null}
                  </div>
                  {item.value !== undefined && (
                    <ArtifactPreview value={item.value} />
                  )}
                </div>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        size="sm"
        variant="ghost"
        aria-label="下一项成果"
        disabled={current < 0 || current >= items.length - 1}
        onClick={() => onSelect(items[current + 1].id)}
      >
        下一项
        <ChevronRight size={14} />
      </Button>
    </div>
  );
}
