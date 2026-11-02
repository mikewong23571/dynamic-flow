import { Check, Keyboard, Play, Save } from 'lucide-react';
import type { Work } from '../../shared/records';
import { active, short, workTitle } from '../core/format';
import { Button } from '../components/ui';
import { WorkspaceHeading } from '../components/WorkspaceFrame';
import type { ReactNode } from 'react';

/** 工作区头部：名称、保存状态、运行版本与运行入口。 */
export function WorkspaceHeader({
  work,
  taskContext,
  editingDefinitionId,
  dirty,
  busy,
  runDefinition,
  setRunDefinition,
  selectedDefinitionId,
  selectedMaterials,
  discardLocalChanges,
  saveDefinition,
  runFull,
  openInvoke,
}: {
  work: Work;
  taskContext?: ReactNode;
  editingDefinitionId?: string;
  dirty: boolean;
  busy: boolean;
  runDefinition: 'adopted' | 'draft';
  setRunDefinition: (value: 'adopted' | 'draft') => void;
  selectedDefinitionId?: string;
  selectedMaterials: string[];
  discardLocalChanges: () => void;
  saveDefinition: () => void;
  runFull: () => void;
  openInvoke: () => void;
}) {
  return (
    <WorkspaceHeading
      title={workTitle(work)}
      description={work.goal}
      eyebrow="流水线"
      context={
        <>
          <span className="workspace-version" title={editingDefinitionId}>
            当前草稿{' '}
            {editingDefinitionId ? short(editingDefinitionId) : '尚未保存'}
          </span>
          {taskContext}
        </>
      }
      actions={
        <>
          {dirty ? (
            <>
              <Button
                variant="ghost"
                onClick={discardLocalChanges}
                disabled={busy}
              >
                放弃修改
              </Button>
              <Button onClick={() => void saveDefinition()} disabled={busy}>
                <Save size={15} />
                保存修改
              </Button>
            </>
          ) : (
            <span className="saved">
              <Check size={14} />
              已保存
            </span>
          )}
          <select
            aria-label="运行使用的做法"
            value={runDefinition}
            onChange={(e) =>
              setRunDefinition(e.target.value as 'adopted' | 'draft')
            }
          >
            <option value="adopted">
              {work.adoptedId ? '采用的做法' : '当前草稿'}
            </option>
            {work.draftId && <option value="draft">候选草稿</option>}
          </select>
          <Button
            variant="primary"
            className="invoke-trigger"
            aria-label="直接输入运行"
            disabled={!selectedDefinitionId || busy}
            onClick={openInvoke}
          >
            <Keyboard size={15} />
            直接输入
          </Button>
          <Button
            variant="secondary"
            disabled={
              !selectedDefinitionId ||
              work.runs.some((r) => active(r.status)) ||
              work.comparisons.some((c) => active(c.status)) ||
              busy ||
              dirty ||
              !selectedMaterials.length
            }
            onClick={() => void runFull()}
          >
            <Play size={15} />
            运行流程
          </Button>
        </>
      }
    />
  );
}
