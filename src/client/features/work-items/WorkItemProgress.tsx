import type { ItemHistory, WorkItemView } from '../../../shared/records';
import { dateTime, statusNames } from '../../core/format';
import { Badge } from '../../components/ui';

export function progressSource(entry: ItemHistory) {
  if (entry.kind === 'milestone') return '里程碑';
  if (entry.kind === 'progress')
    return entry.origin === 'agent' ? 'Agent 报告' : '外部报告';
  if (entry.kind === 'completed') return '用户结项确认';
  if (entry.kind === 'reopened') return '用户重开';
  return '业务记录';
}

export function completionHint(item: WorkItemView) {
  const lastAction = [...item.history]
    .reverse()
    .find((entry) => ['run', 'reopened', 'method'].includes(entry.kind));
  if (lastAction?.kind === 'reopened') return '重开后尚未再次推进';
  if (lastAction?.kind === 'method') return '尚未使用当前方法推进';
  return item.criteria.length > 0 &&
    item.criteria.every(
      (criterion) => criterion.met && criterion.evidence.trim(),
    )
    ? '待结项确认'
    : '本轮执行已结束，工作项尚未结项';
}

export function WorkItemProgress({ item }: { item: WorkItemView }) {
  const execution = item.execution;
  const latestHistory = [...item.history].reverse();
  const latestSummary = latestHistory.find((entry) =>
    ['progress', 'milestone', 'completed', 'reopened'].includes(entry.kind),
  );
  const latestReport = latestHistory.find(
    (entry) => entry.kind === 'progress' || entry.kind === 'milestone',
  );
  const lastAction = latestHistory.find((entry) =>
    ['run', 'reopened', 'method'].includes(entry.kind),
  );
  const confirmed = item.criteria.filter((criterion) => criterion.met).length;
  let nextAction = item.nextAction;
  if (item.status === 'completed') {
    nextAction = '已结项；如有新证据，可重新打开工作项。';
  } else if (!nextAction) {
    if (lastAction?.kind === 'reopened')
      nextAction = '请根据重开原因重新评估，确认材料后再次推进。';
    else if (lastAction?.kind === 'method')
      nextAction = '尚未使用当前方法推进；请确认材料后再次执行。';
    else if (execution?.status === 'completed')
      nextAction =
        completionHint(item) === '待结项确认'
          ? '完成条件与依据已齐全，请确认结项。'
          : '请检查本轮结果，确认完成条件并补充依据。';
    else if (execution?.status === 'waiting')
      nextAction = '查看等待事件与到期时间，收到所需信息后发送事件。';
    else if (execution?.status === 'interrupted')
      nextAction = '检查中断原因后继续执行，或停止本轮执行。';
    else if (
      execution?.status === 'failed' ||
      execution?.status === 'cancelled'
    )
      nextAction = '检查本轮执行记录，处理问题后再次推进。';
    else if (
      execution &&
      ['queued', 'running', 'stopping'].includes(execution.status)
    )
      nextAction = '尚未记录下一步；当前执行状态见上方。';
    else nextAction = '尚未记录下一步；可使用当前方法推进工作项。';
  }
  return (
    <div className="item-current-progress">
      <div className="item-progress">
        <span className="item-progress-label">业务阶段</span>
        <strong>{item.stage || '尚未记录阶段'}</strong>
      </div>
      <div className="item-progress-fact">
        <h3>当前执行</h3>
        {execution ? (
          <>
            <Badge status={execution.status}>
              {statusNames[execution.status] || execution.status}
            </Badge>
            {execution.status === 'completed' &&
              item.status !== 'completed' && (
                <p className="muted">{completionHint(item)}</p>
              )}
            {!!execution.activeNodes?.length && (
              <ul className="item-active-nodes" aria-label="当前活动步骤">
                {execution.activeNodes.map((node) => (
                  <li key={node.id}>
                    <span>{node.label}</span>
                    {node.parentLabel && (
                      <small>所属责任：{node.parentLabel}</small>
                    )}
                    {node.responsibility && (
                      <small>{node.responsibility}</small>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {execution.error && (
              <p className="inline-error">执行错误：{execution.error}</p>
            )}
          </>
        ) : (
          <p className="muted">尚未执行</p>
        )}
      </div>
      <div className="item-progress-fact">
        <h3>最近成果</h3>
        <p>{item.summary || '尚无已记录的业务进展'}</p>
        {item.summary && (
          <small>
            {latestSummary ? progressSource(latestSummary) : '业务记录'} ·{' '}
            {dateTime(latestSummary?.at || item.progressAt)}
          </small>
        )}
      </div>
      <div className="item-progress-fact">
        <h3>业务阻碍</h3>
        <p className={item.blocker ? 'item-reported-blocker' : 'muted'}>
          {item.blocker || '尚未记录业务阻碍'}
        </p>
        {item.blocker && latestReport && (
          <small>
            {progressSource(latestReport)} · {dateTime(latestReport.at)}
          </small>
        )}
      </div>
      <div className="item-progress-fact">
        <h3>下一步</h3>
        <p>{nextAction}</p>
        <small>
          已确认条件 {confirmed} / {item.criteria.length}
        </small>
      </div>
    </div>
  );
}
