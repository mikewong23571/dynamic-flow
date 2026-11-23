import {
  GitCompareArrows,
  History,
  PanelRightClose,
  PanelRightOpen,
  Workflow,
} from 'lucide-react';
import type { Work } from '../../shared/records';
import { short } from '../core/format';
import { Badge } from '../components/ui';
import { Button } from '../components/ui/button';
import {
  WorkspaceNavigation,
  WorkspaceTabList,
  WorkspaceTab,
} from '../components/WorkspaceFrame';

/** 工作区标签栏：流程/运行结果/比较，做法版本与右侧面板开关。 */
export function WorkspaceTabs({
  work,
  tab,
  panel,
  setPanel,
}: {
  work: Work;
  tab: 'canvas' | 'results' | 'compare';
  panel: 'inspector' | 'assistant' | null;
  setPanel: (panel: 'inspector' | 'assistant' | null) => void;
}) {
  return (
    <WorkspaceNavigation
      actions={
        <>
          <Badge
            status={
              work.draftId && work.draftId !== work.adoptedId
                ? 'candidate'
                : 'adopted'
            }
          >
            {work.draftId && work.draftId !== work.adoptedId
              ? '候选草稿'
              : '采用的做法'}{' '}
            · {short(work.draftId || work.adoptedId)}
          </Badge>
          {tab === 'canvas' && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={panel ? '收起侧栏' : '打开侧栏'}
              onClick={() => setPanel(panel ? null : 'inspector')}
            >
              {panel ? (
                <PanelRightClose size={17} />
              ) : (
                <PanelRightOpen size={17} />
              )}
            </Button>
          )}
        </>
      }
    >
      <WorkspaceTabList aria-label="工作内容">
        <WorkspaceTab value="canvas">
          <Workflow size={15} />
          流程
        </WorkspaceTab>
        <WorkspaceTab value="results">
          <History size={15} />
          运行结果{' '}
          {work.runs.length > 0 && (
            <span className="workspace-tab-count">{work.runs.length}</span>
          )}
        </WorkspaceTab>
        <WorkspaceTab value="compare">
          <GitCompareArrows size={15} />
          比较做法
        </WorkspaceTab>
      </WorkspaceTabList>
    </WorkspaceNavigation>
  );
}
