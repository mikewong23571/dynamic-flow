import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { splitMaterials } from '../../core/format';
import { Button, Modal } from '../../components/ui';

/** 创建工作：填写目标与材料，或跟随文件导入；显示材料拆分结果。 */
export function CreateWorkDialog({
  open,
  onOpenChange,
  goal,
  setGoal,
  materialText,
  setMaterialText,
  error,
  busy,
  create,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: string;
  setGoal: (goal: string) => void;
  materialText: string;
  setMaterialText: (text: string) => void;
  error: string;
  busy: boolean;
  create: (file?: File) => Promise<boolean>;
}) {
  const [createFile, setCreateFile] = useState<File | undefined>();
  const createMaterials = useMemo(
    () => splitMaterials(materialText),
    [materialText],
  );
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="开始一项工作"
      description="填写目标，再确认材料的拆分结果。"
    >
      <label className="field">
        工作目标
        <textarea
          rows={3}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="例如：整理客户反馈，区分问题、需求与称赞，给出有依据的建议。报告必须引用反馈编号。"
        />
      </label>
      <label className="field">
        材料 · 每行一条
        <textarea
          rows={6}
          value={materialText}
          onChange={(e) => setMaterialText(e.target.value)}
          placeholder="粘贴需要处理的原始材料…"
        />
      </label>
      <label className="field">
        或上传文件，由助手剖析并登记洞见
        <input
          type="file"
          accept=".txt,.md,.csv,.json,.log,.xlsx,.xls,.docx,.pdf,text/*"
          disabled={createMaterials.length > 0}
          onChange={(e) => setCreateFile(e.target.files?.[0])}
        />
      </label>
      {createMaterials.length > 0 && (
        <div className="material-preview">
          <strong>已拆分 {createMaterials.length} 条材料</strong>
          {createMaterials.map((text, i) => (
            <p key={i}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              {text}
            </p>
          ))}
        </div>
      )}
      {error && <p className="inline-error">{error}</p>}
      <div className="modal-actions">
        {createMaterials.length === 0 && (
          <span className="muted">
            {createFile
              ? `跟随文件导入：${createFile.name}`
              : '已拆分 0 条材料'}
          </span>
        )}
        <Button onClick={() => onOpenChange(false)}>取消</Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            if (await create(createFile)) setCreateFile(undefined);
          }}
        >
          创建工作
          <ArrowRight size={15} />
        </Button>
      </div>
    </Modal>
  );
}
