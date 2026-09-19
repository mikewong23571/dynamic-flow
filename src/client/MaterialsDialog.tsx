import { Plus } from 'lucide-react';
import { Button, Modal } from './components/ui';
import type { WorkspaceController } from './useWorkspace';

export function MaterialsDialog({
  controller,
  open,
  onOpenChange,
}: {
  controller: WorkspaceController;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { work, selectedMaterials, setSelectedMaterials, setAddOpen } =
    controller;
  if (!work) return null;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="输入材料"
      description="选择本次完整流程要处理的材料。历史运行保留原输入。"
    >
      <div className="materials-toolbar">
        <span>
          已选 {selectedMaterials.length} / {work.materials.length} 条
        </span>
        <Button
          variant="ghost"
          onClick={() =>
            setSelectedMaterials(
              selectedMaterials.length === work.materials.length
                ? []
                : work.materials.map((m) => m.id),
            )
          }
        >
          {selectedMaterials.length === work.materials.length ? '清空' : '全选'}
        </Button>
        <Button
          onClick={() => {
            onOpenChange(false);
            setAddOpen(true);
          }}
        >
          <Plus size={14} />
          添加材料
        </Button>
      </div>
      <div className="materials-list">
        {work.materials.map((m) => (
          <label key={m.id} className="material-row">
            <input
              type="checkbox"
              checked={selectedMaterials.includes(m.id)}
              onChange={() =>
                setSelectedMaterials((ids) =>
                  ids.includes(m.id)
                    ? ids.filter((id) => id !== m.id)
                    : [...ids, m.id],
                )
              }
            />
            <b>{m.id}</b>
            <span>{m.text}</span>
          </label>
        ))}
        {work.materials.length === 0 && <p className="muted">暂无材料</p>}
      </div>
      <div className="modal-actions">
        <Button variant="primary" onClick={() => onOpenChange(false)}>
          完成选择
        </Button>
      </div>
    </Modal>
  );
}
