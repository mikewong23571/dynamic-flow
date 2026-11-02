import { Textarea } from '../../components/ui/textarea';
import { FormActions } from '../../components/ui/field';
import { Field } from '../../components/ui/field';
import { useMemo, useState } from 'react';
import type { Snapshot, Work } from '../../../shared/records';
import { splitMaterials } from '../../core/format';
import { upload } from '../../core/api';
import { runAction } from '../../core/action';
import { Modal } from '../../components/ui';
import { Button } from '../../components/ui/button';

/** 添加新材料：粘贴拆分后加入并选中，或上传文件由助手剖析。 */
export function AddMaterialsDialog({
  open,
  onOpenChange,
  work,
  newMaterials,
  setNewMaterials,
  busy,
  perform,
  setSelectedMaterials,
  setPanel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  work?: Work;
  newMaterials: string;
  setNewMaterials: (text: string) => void;
  busy: boolean;
  perform: (
    name: string,
    fields?: Record<string, unknown>,
  ) => Promise<Snapshot | undefined>;
  setSelectedMaterials: (ids: string[]) => void;
  setPanel: (panel: 'inspector' | 'assistant' | null) => void;
}) {
  const [uploadFile, setUploadFile] = useState<File | undefined>();
  const [uploadError, setUploadError] = useState('');
  const pendingMaterials = useMemo(
    () => splitMaterials(newMaterials),
    [newMaterials],
  );
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="添加新材料"
      description="新材料加入本工作；历史运行与报告保留原输入。"
    >
      <Field>
        每行一条材料
        <Textarea
          rows={7}
          value={newMaterials}
          onChange={(e) => setNewMaterials(e.target.value)}
        />
      </Field>
      <p className="meta-text">将添加 {pendingMaterials.length} 条</p>
      <FormActions>
        <Button
          size="sm"
          variant="default"
          disabled={busy || !pendingMaterials.length}
          onClick={async () => {
            const old = new Set(work?.materials.map((m) => m.id));
            const next = await perform('addMaterials', {
              materials: pendingMaterials,
            });
            if (next) {
              setSelectedMaterials(
                next.work.materials
                  .filter((m) => !old.has(m.id))
                  .map((m) => m.id),
              );
              onOpenChange(false);
              setNewMaterials('');
            }
          }}
        >
          添加并选中新材料
        </Button>
      </FormActions>
      <Field>
        或上传文件，由助手剖析并登记洞见
        <input
          type="file"
          accept=".txt,.md,.csv,.json,.log,.xlsx,.xls,.docx,.pdf,text/*"
          onChange={(e) => {
            setUploadFile(e.target.files?.[0]);
            setUploadError('');
          }}
        />
      </Field>
      {uploadError && <p className="inline-error">{uploadError}</p>}
      <FormActions>
        <Button
          size="sm"
          variant="default"
          disabled={busy || !uploadFile}
          onClick={() =>
            void runAction(
              async () => {
                if (!work || !uploadFile) return;
                const file = await upload(work.id, uploadFile);
                const next = await perform('importMaterials', { file });
                if (next) {
                  onOpenChange(false);
                  setUploadFile(undefined);
                  setPanel('assistant');
                }
              },
              { setError: setUploadError },
            )
          }
        >
          上传并导入
        </Button>
      </FormActions>
    </Modal>
  );
}
