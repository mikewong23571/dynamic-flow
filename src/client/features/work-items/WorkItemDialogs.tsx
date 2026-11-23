import { FormActions } from '../../components/ui/field';
import { Field } from '../../components/ui/field';
import { useMemo, useState, type FormEvent } from 'react';
import type {
  CreateWorkItem,
  WorkItemView,
  WorkSummary,
  ReceivedItemInput,
} from '../../../shared/records';
import { createItemWithFiles } from './create-item';
import { api } from '../../core/api';
import { splitMaterials, workTitle, errorText } from '../../core/format';
import { materialPresentation } from '../../core/material';
import { Modal } from '../../components/ui';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { NativeSelect } from '../../components/ui/native-select';
import { currentReceived } from './current-received';

export function CreateItemDialog({
  open,
  onOpenChange,
  methods,
  onCreated,
  parent,
  initialInput,
}: {
  parent?: WorkItemView;
  initialInput?: Omit<ReceivedItemInput, 'id'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  methods: WorkSummary[];
  onCreated: (item: WorkItemView) => void;
}) {
  const [form, setForm] = useState({
    key: '',
    title: '',
    goal: '',
    methodId: '',
    criteria: '',
    materials: '',
  });
  const [files, setFiles] = useState<File[]>([]),
    [materialIds, setMaterialIds] = useState<string[]>([]),
    [receivedIds, setReceivedIds] = useState<string[]>([]);
  const [ancestors, setAncestors] = useState<{ id: string; title: string }[]>(
    [],
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [created, setCreated] = useState<WorkItemView>();
  const materialTitles = useMemo(
    () =>
      new Map(
        open
          ? parent?.materials.map((m) => [m.id, materialPresentation(m).title])
          : [],
      ),
    [open, parent?.materials],
  );
  async function create(confirmReopen = false) {
    setBusy(true);
    setError('');
    try {
      const input: CreateWorkItem = {
        ...form,
        parentId: parent?.id,
        confirmReopen,
        criteria: splitMaterials(form.criteria),
        receivedInputs: [
          ...(parent
            ? currentReceived(parent)
                .filter((i) => receivedIds.includes(i.id))
                .map(({ id, replacesId, ...input }) => input)
            : []),
          ...(initialInput ? [initialInput] : []),
        ],
        materials: [
          ...(parent?.materials
            .filter((m) => materialIds.includes(m.id))
            .map((m) => m.text) || []),
          ...(form.materials.trim() ? [form.materials] : []),
        ],
      };
      const next = await createItemWithFiles({
        input,
        files,
        created,
        onSaved: setCreated,
        onUploaded: (file) =>
          setFiles((remaining) => remaining.filter((entry) => entry !== file)),
      });
      if (form.methodId) {
        const method = await api<import('../../../shared/records').Snapshot>(
          `/api/works/${form.methodId}`,
        );
        const workspace = await api<
          import('../../../shared/workitem-composition').ItemWorkspace
        >(`/api/items/${next.id}/workspace/actions`, {
          action: 'useMethod',
          baseRevision: next.revision,
          methodId: form.methodId,
          definitionId: method.work.adoptedId || method.work.draftId,
        });
        onCreated(workspace.item);
      } else onCreated(next);
      onOpenChange(false);
      setCreated(undefined);
      setAncestors([]);
      setMaterialIds([]);
      setReceivedIds([]);
      setFiles([]);
      setForm({
        key: '',
        title: '',
        goal: '',
        methodId: '',
        criteria: '',
        materials: '',
      });
    } catch (e) {
      const affected = (
        e as { affectedAncestors?: { id: string; title: string }[] }
      ).affectedAncestors;
      if (affected?.length) setAncestors(affected);
      else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void create();
  }
  return (
    <Modal
      title={parent ? '添加子工作项' : '新建工作项'}
      open={open}
      onOpenChange={onOpenChange}
      className="composition-create-dialog"
    >
      <form className="stack" onSubmit={submit}>
        <Field>
          标题
          <Input
            required
            autoFocus
            value={form.title}
            disabled={!!created}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>
        <Field>
          目标
          <Textarea
            required
            rows={3}
            placeholder="这件事做到什么程度？"
            value={form.goal}
            disabled={!!created}
            onChange={(e) => setForm({ ...form, goal: e.target.value })}
          />
        </Field>
        <Field>
          文件
          <Input
            type="file"
            multiple
            aria-label="初始文件"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
        </Field>
        {!!files.length && (
          <p className="meta-text">{files.map((f) => f.name).join('、')}</p>
        )}
        <Field>
          材料
          <Textarea
            rows={2}
            placeholder="粘贴已有内容（可选）"
            value={form.materials}
            disabled={!!created}
            onChange={(e) => setForm({ ...form, materials: e.target.value })}
          />
        </Field>
        {initialInput && (
          <p className="meta-text">将带入所选成果：{initialInput.label}</p>
        )}
        {parent &&
          !!(parent.materials.length || currentReceived(parent).length) && (
            <details>
              <summary>选择带入父项资料</summary>
              <div className="composition-create-inheritance">
                {parent.materials.map((m) => (
                  <label className="check-row" key={m.id}>
                    <input
                      type="checkbox"
                      checked={materialIds.includes(m.id)}
                      onChange={(e) =>
                        setMaterialIds((ids) =>
                          e.target.checked
                            ? [...ids, m.id]
                            : ids.filter((id) => id !== m.id),
                        )
                      }
                    />
                    {materialTitles.get(m.id)}
                  </label>
                ))}
                {currentReceived(parent).map((input) => (
                  <label className="check-row" key={input.id}>
                    <input
                      type="checkbox"
                      checked={receivedIds.includes(input.id)}
                      onChange={(e) =>
                        setReceivedIds((ids) =>
                          e.target.checked
                            ? [...ids, input.id]
                            : ids.filter((id) => id !== input.id),
                        )
                      }
                    />
                    {input.label}
                  </label>
                ))}
              </div>
            </details>
          )}
        <details>
          <summary>编号、方法与完成条件</summary>
          <div className="stack composition-create-options">
            <Field>
              业务编号
              <Input
                placeholder="自动生成"
                value={form.key}
                disabled={!!created}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
              />
            </Field>
            <Field>
              处理方法
              <NativeSelect
                value={form.methodId}
                disabled={!!created}
                onChange={(e) => setForm({ ...form, methodId: e.target.value })}
              >
                <option value="">稍后与 Assistant 一起安排</option>
                {methods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {workTitle(method)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              完成条件（每行一项）
              <Textarea
                rows={2}
                value={form.criteria}
                disabled={!!created}
                onChange={(e) => setForm({ ...form, criteria: e.target.value })}
              />
            </Field>
          </div>
        </details>
        {!!ancestors.length && (
          <div>
            <p>
              建立子项将重新打开：{ancestors.map((a) => a.title).join('、')}
            </p>
            <Button
              variant="outline"
              type="button"
              disabled={busy}
              onClick={() => void create(true)}
            >
              重开并建立子项
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <FormActions>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button variant="default" disabled={busy}>
            {busy
              ? '保存中…'
              : created
                ? '重试上传'
                : parent
                  ? '建立子项'
                  : '创建工作项'}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}
