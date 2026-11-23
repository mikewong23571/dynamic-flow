import type { ReactNode } from 'react';
import {
  ArrowUpRight,
  Files,
  PencilLine,
  Play,
  Sparkles,
  Square,
} from 'lucide-react';
import type { Run, WorkItemView } from '../../../../shared/records';
import { active, dateTime, statusNames } from '../../../core/format';
import { Badge } from '../../../components/ui';
import { Button } from '../../../components/ui/button';

export function CompositionFlowTask({
  item,
  run,
  hasFlow,
  dirty,
  busy,
  planning,
  editing,
  children,
  onEditing,
  onRun,
  onCommand,
  onSignal,
  onInputs,
  onPlan,
}: {
  item: WorkItemView;
  run?: Run;
  hasFlow: boolean;
  dirty: boolean;
  busy: boolean;
  planning: boolean;
  editing: boolean;
  children: ReactNode;
  onEditing: () => void;
  onRun: () => void;
  onCommand: (action: string) => Promise<unknown>;
  onSignal: (event: string) => void;
  onInputs: () => void;
  onPlan: () => void;
}) {
  const running = !!run && active(run.status);
  const command = (action: string) => void onCommand(action).catch(() => {});
  return (
    <>
      {(hasFlow || editing) && (
        <div className="composition-flow-toolbar">
          {!run && hasFlow && (
            <span className="meta-text">
              {planning
                ? '正在完善规划'
                : dirty
                  ? '未保存的规划'
                  : '此流程尚未执行'}
            </span>
          )}
          {run && (
            <div className="composition-flow-progress">
              <Badge status={run.status}>本轮{statusNames[run.status]}</Badge>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onRun}
                aria-label="查看本轮执行"
                title="查看本轮执行"
              >
                <ArrowUpRight size={14} />
              </Button>
            </div>
          )}
          <div className="composition-run-control inline-group">
            <Button
              variant="ghost"
              onClick={onEditing}
              disabled={busy || !!running}
            >
              <PencilLine size={14} />
              {editing ? '结束编辑' : '编辑流程'}
            </Button>
            {running ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => command('stop')}
              >
                <Square size={14} />
                停止
              </Button>
            ) : run?.status === 'interrupted' ? (
              <Button disabled={busy} onClick={() => command('resume')}>
                继续执行
              </Button>
            ) : (
              <Button
                disabled={
                  busy ||
                  planning ||
                  dirty ||
                  !hasFlow ||
                  item.status === 'completed'
                }
                onClick={() => command('run')}
              >
                <Play size={14} />
                运行流程
              </Button>
            )}
          </div>
        </div>
      )}
      {run?.error && (
        <p className="composition-flow-error" role="alert">
          {run.error}
        </p>
      )}
      {!!run?.waits?.some((wait) => wait.status === 'pending') && (
        <div className="composition-waits">
          {run.waits
            .filter((wait) => wait.status === 'pending')
            .map((wait) => (
              <div key={wait.nodeId}>
                <strong>{wait.reason || wait.event}</strong>
                {wait.dueAt && <time>{dateTime(wait.dueAt)}</time>}
                <Button variant="outline" onClick={() => onSignal(wait.event)}>
                  提交事件
                </Button>
              </div>
            ))}
        </div>
      )}
      {children || (
        <div className="composition-empty-task composition-initial-task">
          <Sparkles size={28} />
          <h2>{planning ? '正在形成处理流程' : '从需求形成处理流程'}</h2>
          <p>{item.goal}</p>
          {!!item.materials.length && (
            <Button variant="ghost" onClick={onInputs}>
              <Files size={15} />
              {item.materials.length} 份资料
            </Button>
          )}
          {!planning && (
            <Button variant="outline" disabled={busy} onClick={onPlan}>
              <Sparkles size={14} />让 Assistant 规划
            </Button>
          )}
        </div>
      )}
    </>
  );
}
