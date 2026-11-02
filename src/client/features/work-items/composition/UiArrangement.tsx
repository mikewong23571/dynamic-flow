import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import {
  parseOpenUIProgram,
  type OpenUIFocus,
} from '../../../../shared/openui';
import type { ItemWorkspace } from '../../../../shared/workitem-composition';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { errorText } from '../../../core/format';

export function UiArrangement({
  workspace,
  initialBlock,
  busy,
  onClose,
  onSaved,
  onFocus,
  onDirty,
  onCommand,
}: {
  workspace: ItemWorkspace;
  initialBlock?: string;
  busy: boolean;
  onClose: () => void;
  onSaved: (workspace: ItemWorkspace, block: string) => void;
  onFocus: (focus: OpenUIFocus, open?: boolean) => void;
  onDirty: (dirty: boolean) => void;
  onCommand: (
    action: string,
    fields?: Record<string, unknown>,
  ) => Promise<ItemWorkspace>;
}) {
  const program = workspace.uiProgram!;
  const [base, setBase] = useState({
    revision: workspace.item.revision,
    programId: program.id,
    source: program.source,
  });
  const [source, setSource] = useState(program.source),
    [error, setError] = useState(''),
    [selected, setSelected] = useState(initialBlock || 'root');
  const editor = useRef<HTMLTextAreaElement>(null);
  const dirty = source !== base.source;
  useEffect(() => onDirty(dirty), [dirty]);
  useEffect(() => {
    if (!dirty && program.id !== base.programId) {
      setSource(program.source);
      setBase({
        revision: workspace.item.revision,
        programId: program.id,
        source: program.source,
      });
    }
  }, [program.id]);
  let names: string[] = [];
  try {
    names = parseOpenUIProgram(source).statements;
  } catch {}
  return (
    <section className="ui-arrangement" aria-label="界面安排">
      <div className="composition-section-heading">
        <Button variant="ghost" onClick={onClose}>
          <ArrowLeft size={15} />
          返回成果
        </Button>
        <strong>OpenUI 界面安排</strong>
        <span className="muted">{dirty ? '未保存修改' : '已保存'}</span>
        <Button
          disabled={busy || !dirty}
          onClick={() =>
            void (async () => {
              setError('');
              try {
                parseOpenUIProgram(source);
                const next = await onCommand('saveUiProgram', {
                  baseRevision: base.revision,
                  expectedProgramId: base.programId,
                  definitionId: program.definitionId,
                  source,
                });
                setBase({
                  revision: next.item.revision,
                  programId: next.uiProgram!.id,
                  source: next.uiProgram!.source,
                });
                setSource((current) =>
                  current === source ? next.uiProgram!.source : current,
                );
                onSaved(next, selected);
              } catch (reason) {
                setError(errorText(reason));
              }
            })()
          }
        >
          保存安排
        </Button>
      </div>
      {program.id !== base.programId && dirty && (
        <p role="alert">界面已有新版本，当前草稿仍保留；保存会检查冲突。</p>
      )}
      <div className="ui-arrangement-body">
        <nav aria-label="具名界面声明">
          {names.map((name) => (
            <Button
              key={name}
              variant={name === selected ? 'outline' : 'ghost'}
              onClick={() => {
                setSelected(name);
                const start = source.indexOf(`${name} =`);
                if (start >= 0) {
                  editor.current?.focus();
                  editor.current?.setSelectionRange(start, start + name.length);
                }
                onFocus({ programId: base.programId, block: name }, false);
              }}
            >
              {name}
            </Button>
          ))}
        </nav>
        <div className="ui-arrangement-editor">
          <label className="field">
            OpenUI 描述
            <Textarea
              ref={editor}
              className="field-sizing-fixed font-mono"
              rows={20}
              value={source}
              onChange={(event) => setSource(event.target.value)}
              aria-label="OpenUI 描述"
            />
          </label>
          <Button
            variant="outline"
            disabled={dirty}
            onClick={() =>
              onFocus({ programId: program.id, block: selected }, true)
            }
          >
            <MessageSquare size={15} />
            与Assistant修改此声明
          </Button>
        </div>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
