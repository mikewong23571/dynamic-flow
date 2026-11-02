import { api } from '../../../core/api';
import { useRef, useState } from 'react';
import { FileText, Plus, Upload, Rows3 } from 'lucide-react';
import type {
  Definition,
  WorkItemView,
  ReceivedItemInput,
  OutputReference,
} from '../../../../shared/records';
import { Modal } from '../../../components/ui';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { NativeSelect } from '../../../components/ui/native-select';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '../../../components/ui/table';
import { MaterialDialog } from '../../../components/MaterialDialog';
import { materialPresentation } from '../../../core/material';
import { errorText, portLabel } from '../../../core/format';
import { currentReceived } from '../current-received';
import { DeclaredInputForm } from './DeclaredInputForm';

export function CompositionInputs({
  item,
  definition,
  busy,
  onUpload,
  onAdd,
  onInput,
  onSelect,
  onSource,
}: {
  item: WorkItemView;
  uploads: string[];
  definition?: Definition;
  busy: boolean;
  onUpload: (file: File) => Promise<void>;
  onAdd: (text: string) => Promise<void>;
  onChange: (item: WorkItemView) => void;
  onInput: (fields: Record<string, unknown>) => Promise<unknown>;
  onSelect: (fields: Record<string, unknown>) => Promise<unknown>;
  onSource: (source: OutputReference) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false),
    [text, setText] = useState(''),
    [error, setError] = useState('');
  const [revising, setRevising] = useState<ReceivedItemInput>(),
    [addingInput, setAddingInput] = useState(false);
  const [reading, setReading] = useState<{
    material: { id: string; text: string; contentUrl?: string };
    source?: OutputReference;
  }>();
  const [selecting, setSelecting] = useState<string[]>(),
    [port, setPort] = useState('');
  const received = currentReceived(item);
  const selections = Object.entries(item.inputBindings || {});
  const used = (kind: 'material' | 'received', id: string) =>
    selections.flatMap(([name, values]) =>
      values.some((v) =>
        kind === 'material'
          ? v.kind === 'material' && v.materialId === id
          : v.kind === 'received' && v.inputId === id,
      )
        ? [portLabel(name)]
        : [],
    );
  const available = new Set(item.materials.map((m) => m.id));
  // The relation comes from explicit material IDs. Similar labels or values never merge inputs.
  const anchor = (input: ReceivedItemInput) =>
    input.materials?.find((m) => available.has(m.id))?.id;
  async function upload(files: FileList | null) {
    if (!files) return;
    setError('');
    try {
      for (const file of files) await onUpload(file);
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  const disabled = busy || item.status === 'completed';
  const inputRow = (input: ReceivedItemInput, related = false) => (
    <TableRow
      key={input.id}
      data-input-id={input.id}
      className={related ? 'composition-input-representation' : ''}
    >
      <TableCell>
        <div className="composition-input-name">
          <Rows3 size={16} />
          <button
            onClick={() =>
              setReading({
                material: {
                  id: input.id,
                  contentUrl: input.contentUrl,
                  text:
                    typeof input.value === 'string'
                      ? input.value
                      : JSON.stringify(input.value),
                },
                source: input.source,
              })
            }
          >
            {input.label}
          </button>
        </div>
      </TableCell>
      <TableCell>
        <span className="muted">
          {related ? '结构化表示' : input.source ? '成果接续' : '手动输入'}
          {input.replacesId ? ' · 已修订' : ''}
        </span>
      </TableCell>
      <TableCell>
        {used('received', input.id).length ? (
          <span>本轮采用 · {used('received', input.id).join('、')}</span>
        ) : (
          <span className="muted">未采用</span>
        )}
      </TableCell>
      <TableCell className="composition-input-actions">
        <Button
          variant="ghost"
          onClick={() =>
            setReading({
              material: {
                id: input.id,
                contentUrl: input.contentUrl,
                text:
                  typeof input.value === 'string'
                    ? input.value
                    : JSON.stringify(input.value),
              },
              source: input.source,
            })
          }
        >
          查看
        </Button>
        <Button
          variant="ghost"
          disabled={disabled || !definition?.inputs.length}
          onClick={async () => {
            try {
              setError('');
              setRevising(
                input.contentUrl
                  ? {
                      ...input,
                      value: await api(`${input.contentUrl}&download=true`),
                    }
                  : input,
              );
            } catch (reason) {
              setError(errorText(reason));
            }
          }}
        >
          修改输入
        </Button>
      </TableCell>
    </TableRow>
  );
  return (
    <section className="composition-inputs" aria-label="输入资料">
      <header className="composition-section-heading">
        <div>
          <h2>资料与输入</h2>
          <span className="muted">
            {item.materials.length} 份资料 · {received.length} 份接续输入
          </span>
        </div>
        <div className="inline-group">
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => void upload(e.target.files)}
          />
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={14} />
            上传文件
          </Button>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => setAdding(true)}
          >
            <Plus size={14} />
            补充材料
          </Button>
          {!!definition?.inputs.length && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => setAddingInput(true)}
            >
              填写本轮输入
            </Button>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {item.materials.length || received.length ? (
        <Table aria-label="资料清单">
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>表示</TableHead>
              <TableHead>采用情况</TableHead>
              <TableHead>
                <span className="sr-only">操作</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {item.materials.flatMap((material) => {
              const presentation = materialPresentation(material);
              return [
                <TableRow key={material.id} data-material-id={material.id}>
                  <TableCell>
                    <div className="composition-input-name">
                      <FileText size={16} />
                      <button
                        title={presentation.title}
                        onClick={() => setReading({ material })}
                      >
                        {presentation.title.replace(/^文件：/, '')}
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="muted">原始资料</span>
                  </TableCell>
                  <TableCell>
                    {used('material', material.id).length ? (
                      <span>
                        本轮采用 · {used('material', material.id).join('、')}
                      </span>
                    ) : (
                      <span className="muted">未直接采用</span>
                    )}
                  </TableCell>
                  <TableCell className="composition-input-actions">
                    <Button
                      variant="ghost"
                      onClick={() => setReading({ material })}
                    >
                      查看
                    </Button>
                    {!!definition?.inputs.length && (
                      <Button
                        variant="ghost"
                        disabled={disabled}
                        onClick={() => {
                          setSelecting([material.id]);
                          setPort(definition.inputs[0]);
                        }}
                      >
                        用作输入
                      </Button>
                    )}
                  </TableCell>
                </TableRow>,
                ...received
                  .filter((input) => anchor(input) === material.id)
                  .map((input) => inputRow(input, true)),
              ];
            })}
            {received
              .filter((input) => !anchor(input))
              .map((input) => inputRow(input))}
          </TableBody>
        </Table>
      ) : (
        <div className="composition-empty-task">
          <FileText size={28} />
          <h2>还没有资料</h2>
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
          >
            上传文件
          </Button>
        </div>
      )}
      <MaterialDialog
        material={reading?.material}
        open={!!reading}
        onOpenChange={(open) => {
          if (!open) setReading(undefined);
        }}
        onSource={reading?.source ? () => onSource(reading.source!) : undefined}
      />
      <Modal open={adding} onOpenChange={setAdding} title="补充材料">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            void onAdd(text)
              .then(() => {
                setAdding(false);
                setText('');
              })
              .catch((e) => setError(errorText(e)));
          }}
        >
          <label className="field">
            材料内容
            <Textarea
              aria-label="材料内容"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="modal-actions">
            <Button
              variant="outline"
              type="button"
              onClick={() => setAdding(false)}
            >
              取消
            </Button>
            <Button variant="default" disabled={disabled || !text.trim()}>
              保存材料
            </Button>
          </div>
        </form>
      </Modal>
      {(revising || addingInput) && definition && (
        <DeclaredInputForm
          item={item}
          definition={definition}
          input={revising}
          busy={busy}
          onSave={onInput}
          onClose={() => {
            setRevising(undefined);
            setAddingInput(false);
          }}
        />
      )}
      <Modal
        open={!!selecting}
        onOpenChange={(open) => {
          if (!open) setSelecting(undefined);
        }}
        title="采用资料作为输入"
      >
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            void onSelect({ inputPort: port, materialIds: selecting })
              .then(() => setSelecting(undefined))
              .catch((e) => setError(errorText(e)));
          }}
        >
          <label className="field">
            输入用途
            <NativeSelect
              value={port}
              onChange={(e) => setPort(e.target.value)}
            >
              {definition?.inputs.map((name) => (
                <option key={name} value={name}>
                  {portLabel(name)}
                </option>
              ))}
            </NativeSelect>
          </label>
          {item.materials.map((m) => (
            <label className="check-row" key={m.id}>
              <input
                type="checkbox"
                checked={selecting?.includes(m.id) || false}
                onChange={(e) =>
                  setSelecting((ids) =>
                    e.target.checked
                      ? [...(ids || []), m.id]
                      : (ids || []).filter((id) => id !== m.id),
                  )
                }
              />
              {materialPresentation(m).title}
            </label>
          ))}
          {error && <p role="alert">{error}</p>}
          <div className="modal-actions">
            <Button variant="default" disabled={disabled || !selecting?.length}>
              采用输入
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
