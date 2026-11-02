import { FormActions } from '../../components/ui/field';
import { MaterialCard } from '../../components/MaterialCard';
import { Plus } from 'lucide-react';
import { Modal } from '../../components/ui';
import { Button } from '../../components/ui/button';
import type { WorkspaceController } from '../../app/controller';

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
          size="sm"
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
          variant="outline"
          size="sm"
          onClick={() => {
            onOpenChange(false);
            setAddOpen(true);
          }}
        >
          <Plus size={14} />
          添加材料
        </Button>
      </div>
      <div className="material-cards">
        {work.materials.map((m) => (
          <MaterialCard
            key={m.id}
            material={m}
            selection={{
              checked: selectedMaterials.includes(m.id),
              onChange: () =>
                setSelectedMaterials((ids) =>
                  ids.includes(m.id)
                    ? ids.filter((id) => id !== m.id)
                    : [...ids, m.id],
                ),
            }}
          />
        ))}
        {work.materials.length === 0 && <p className="meta-text">暂无材料</p>}
      </div>
      <FormActions>
        <Button size="sm" variant="default" onClick={() => onOpenChange(false)}>
          完成选择
        </Button>
      </FormActions>
    </Modal>
  );
}
