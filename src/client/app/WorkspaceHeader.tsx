import { Check, Keyboard, Play, Save } from 'lucide-react';
import type { Work } from '../../shared/records';
import { active, workTitle } from '../core/format';
import { Button } from '../components/ui';

/** 工作区头部：名称、保存状态、运行版本与运行入口。 */
export function WorkspaceHeader({
  work,
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
    <header className="workspace-header">
      <div className="work-title">
        <span className="eyebrow">工作空间</span>
        <h1 title={work.goal}>{workTitle(work)}</h1>
      </div>
      <div className="header-actions">
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
          variant="secondary"
          aria-label="直接输入运行"
          disabled={!selectedDefinitionId || busy}
          onClick={openInvoke}
        >
          <Keyboard size={15} />
          直接输入
        </Button>
        <Button
          variant="primary"
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
      </div>
    </header>
  );
}
