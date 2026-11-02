import { useEffect, useState, type RefObject } from 'react';
import { Check, Workflow } from 'lucide-react';
import type { MethodReference } from '../../../../shared/records';
import type { MethodCapability } from '../../../../shared/workitem-composition';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '../../../components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '../../../components/ui/command';

/** One finite command backed by the same saved method catalog the Assistant can inspect. */
export function MethodReferenceCommand({
  methods,
  selected,
  text,
  inputRef,
  onSelect,
  onActivate,
  disabled,
}: {
  methods: MethodCapability[];
  selected: MethodReference[];
  text: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onSelect: (reference: MethodReference, remainingText: string) => void;
  onActivate: (text: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState<'commands' | 'methods'>('commands');
  const [query, setQuery] = useState(''),
    [dismissed, setDismissed] = useState('');
  const lineStart = text.lastIndexOf('\n') + 1,
    line = text.slice(lineStart);
  const match = /^\/(?:pipeline|流水线)\s+(.*)$/.exec(line);
  const isCommand =
    !!match || '/pipeline'.startsWith(line) || '/流水线'.startsWith(line);
  useEffect(() => {
    if (!disabled && line.startsWith('/') && isCommand && text !== dismissed) {
      setMode(match ? 'methods' : 'commands');
      setQuery(match?.[1] ?? line.slice(1));
      setOpen(true);
    } else setOpen(false);
  }, [text, disabled]);
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setDismissed(text);
      }}
    >
      <PopoverAnchor virtualRef={inputRef} />
      <PopoverContent
        side="top"
        align="start"
        className="w-80 max-w-[calc(100vw-32px)] p-0"
        aria-label={mode === 'commands' ? '聊天命令' : '引用流水线'}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        {open && (
          <Command key={mode}>
            <CommandInput
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder={mode === 'commands' ? '选择命令' : '搜索流水线'}
              aria-label={
                mode === 'commands' ? '搜索聊天命令' : '搜索可引用的流水线'
              }
            />
            <CommandList>
              <CommandEmpty>
                {mode === 'commands' ? '没有匹配的命令' : '没有匹配的流水线'}
              </CommandEmpty>
              {mode === 'commands' ? (
                <CommandGroup heading="聊天命令">
                  <CommandItem
                    value="pipeline 流水线 引用方法"
                    onSelect={() => {
                      setMode('methods');
                      setQuery('');
                      onActivate(text.slice(0, lineStart) + '/pipeline ');
                    }}
                  >
                    <Workflow size={14} />
                    <span className="flex-1">/pipeline</span>
                    <span className="text-xs text-muted-foreground">
                      引用流水线
                    </span>
                  </CommandItem>
                </CommandGroup>
              ) : (
                <CommandGroup heading="选择保存版本">
                  {[...methods]
                    .sort(
                      (a, b) =>
                        a.title.localeCompare(b.title) ||
                        Number(b.adopted) - Number(a.adopted),
                    )
                    .map((method) => {
                      const checked = selected.some(
                        (s) =>
                          s.workId === method.workId &&
                          s.definitionId === method.definitionId,
                      );
                      return (
                        <CommandItem
                          key={`${method.workId}:${method.definitionId}`}
                          value={`${method.title} ${method.goal} ${method.workId} ${method.definitionId}`}
                          disabled={!checked && selected.length >= 8}
                          onSelect={() => {
                            onSelect(
                              {
                                workId: method.workId,
                                definitionId: method.definitionId,
                                title: method.title,
                              },
                              text.slice(0, lineStart),
                            );
                            setOpen(false);
                            setDismissed(text);
                          }}
                        >
                          <Workflow size={14} />
                          <span className="min-w-0 flex-1 truncate">
                            {method.title}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {method.adopted
                              ? '采用版'
                              : method.definitionId.slice(0, 8)}
                          </span>
                          {checked && <Check size={13} />}
                        </CommandItem>
                      );
                    })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
