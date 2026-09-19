import { useState, type FormEvent } from 'react';
import type {
  CreateWorkItem,
  WorkItemView,
  WorkSummary,
} from '../shared/records';
import { api, splitMaterials, workTitle } from './model';
import { Button, Modal } from './components/ui';

export function CreateItemDialog({
  open,
  onOpenChange,
  methods,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  methods: WorkSummary[];
  onCreated: (item: WorkItemView) => void;
}) {
  const [form, setForm] = useState({
    key: '',
    title: '',
    goal: '',
    workflowId: '',
    criteria: '',
    materials: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const input: CreateWorkItem = {
        ...form,
        workflowId: form.workflowId || methods[0]?.id || '',
        criteria: splitMaterials(form.criteria),
        materials: splitMaterials(form.materials),
      };
      const item = await api<WorkItemView>('/api/items', input);
      onCreated(item);
      onOpenChange(false);
      setForm({
        key: '',
        title: '',
        goal: '',
        workflowId: '',
        criteria: '',
        materials: '',
      });
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="新建工作项" open={open} onOpenChange={onOpenChange}>
      <form className="stack" onSubmit={submit}>
        <div className="item-form-pair">
          <label className="field">
            业务编号
            <input
              required
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
            />
          </label>
          <label className="field">
            标题
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
        </div>
        <label className="field">
          目标
          <textarea
            required
            rows={2}
            value={form.goal}
            onChange={(e) => setForm({ ...form, goal: e.target.value })}
          />
        </label>
        <label className="field">
          处理方法
          <select
            required
            value={form.workflowId || methods[0]?.id || ''}
            onChange={(e) => setForm({ ...form, workflowId: e.target.value })}
          >
            {!methods.length && (
              <option value="">请先在“流水线”中创建处理方法</option>
            )}
            {methods.map((method) => (
              <option key={method.id} value={method.id}>
                {workTitle(method)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          完成条件（每行一项）
          <textarea
            required
            rows={3}
            value={form.criteria}
            onChange={(e) => setForm({ ...form, criteria: e.target.value })}
          />
        </label>
        <label className="field">
          初始证据（每行一条）
          <textarea
            rows={3}
            value={form.materials}
            onChange={(e) => setForm({ ...form, materials: e.target.value })}
          />
        </label>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button type="button" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="primary" disabled={busy || !methods.length}>
            {busy ? '创建中…' : '创建工作项'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
