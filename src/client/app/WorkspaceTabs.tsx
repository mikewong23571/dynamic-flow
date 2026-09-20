import {
  GitCompareArrows,
  History,
  PanelRightClose,
  PanelRightOpen,
  Workflow,
} from 'lucide-react';
import type { Work } from '../../shared/records';
import { short } from '../core/format';
import { Badge, Button } from '../components/ui';

/** 工作区标签栏：流程/运行结果/比较，做法版本与右侧面板开关。 */
export function WorkspaceTabs({
  work,
  tab,
  setTab,
  panel,
  setPanel,
}: {
  work: Work;
  tab: 'canvas' | 'results' | 'compare';
  setTab: (tab: 'canvas' | 'results' | 'compare') => void;
  panel: 'inspector' | 'assistant' | null;
  setPanel: (panel: 'inspector' | 'assistant' | null) => void;
}) {
  return (
    <div className="workspace-bar">
      <div className="tabs" role="tablist" aria-label="工作内容">
        <button
          role="tab"
          aria-selected={tab === 'canvas'}
          onClick={() => setTab('canvas')}
        >
          <Workflow size={15} />
          流程
        </button>
        <button
          role="tab"
          aria-selected={tab === 'results'}
          onClick={() => setTab('results')}
        >
          <History size={15} />
          运行结果 {work.runs.length > 0 && <span>{work.runs.length}</span>}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'compare'}
          onClick={() => setTab('compare')}
        >
          <GitCompareArrows size={15} />
          比较
        </button>
      </div>
      <div className="bar-actions">
        <Badge
          status={
            work.draftId && work.draftId !== work.adoptedId ? 'candidate' : ''
          }
        >
          {work.draftId && work.draftId !== work.adoptedId
            ? '候选草稿'
            : '采用的做法'}{' '}
          · {short(work.draftId || work.adoptedId)}
        </Badge>
        <Button
          variant="ghost"
          aria-label={panel ? '收起侧栏' : '打开侧栏'}
          onClick={() => setPanel(panel ? null : 'inspector')}
        >
          {panel ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
        </Button>
      </div>
    </div>
  );
}
