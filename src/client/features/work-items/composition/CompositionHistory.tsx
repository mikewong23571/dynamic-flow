import {
  ArrowUpRight,
  CircleDot,
  FilePlus2,
  Flag,
  GitBranch,
  ListChecks,
  Paperclip,
  Play,
  Plus,
  RotateCcw,
  Check,
  Sparkles,
  Workflow,
} from 'lucide-react';
import type {
  ItemHistory,
  ItemRunRef,
  Snapshot,
  WorkItemView,
} from '../../../../shared/records';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui';
import { dateTime } from '../../../core/format';
import { materialPresentation } from '../../../core/material';

const eventIcons = {
  created: Plus,
  evidence: Paperclip,
  run: Play,
  completed: Check,
  reopened: RotateCcw,
  criteria: ListChecks,
  milestone: Flag,
  progress: Sparkles,
  method: Workflow,
  children: GitBranch,
  input: FilePlus2,
  scope: GitBranch,
  interface: ListChecks,
};
type Event = {
  id: string;
  at?: string;
  title: string;
  detail?: string;
  source?: ItemRunRef;
  history?: ItemHistory;
  ordinal?: number;
};
const key = (ref: ItemRunRef) => `${ref.workId}:${ref.runId}`;
export function CompositionHistory({
  item,
  snapshot,
  onRun,
  onInputs,
}: {
  item: WorkItemView;
  snapshot?: Snapshot;
  onRun: (source: ItemRunRef) => void;
  onInputs: () => void;
}) {
  const recorded = new Set<string>();
  const ordinal = new Map(item.runs.map((ref, index) => [key(ref), index + 1]));
  const events: Event[] = [...item.history].reverse().flatMap((history) => {
    if (history.kind === 'run' && history.source) {
      const identity = key(history.source);
      if (recorded.has(identity)) return [];
      recorded.add(identity);
      const round = ordinal.get(identity);
      return [
        {
          id: history.id,
          at: history.at,
          title: round ? `第 ${round} 轮处理` : '处理记录',
          ordinal: round,
          source: history.source,
          history,
          detail: (item.deliveries || [])
            .filter((view) => view.runId === history.source!.runId)
            .map((view) => view.output)
            .join(' · '),
        },
      ];
    }
    return [
      {
        id: history.id,
        at: history.at,
        title: history.kind === 'created' ? '开始工作项' : history.summary,
        history,
        source: history.source,
        detail:
          history.kind === 'created'
            ? history.summary.replace(/^登记工作项[：:]\s*/, '')
            : history.materialIds
                ?.map((id) => {
                  const m = item.materials.find((m) => m.id === id);
                  return m
                    ? materialPresentation(m).title.replace(/^文件：/, '')
                    : undefined;
                })
                .filter(Boolean)
                .join('、'),
      },
    ];
  });
  for (const ref of [...item.runs].reverse())
    if (!recorded.has(key(ref))) {
      const run =
        snapshot?.work.id === ref.workId
          ? snapshot.work.runs.find((run) => run.id === ref.runId)
          : undefined;
      events.push({
        id: key(ref),
        at: run?.startedAt,
        title: `第 ${ordinal.get(key(ref))} 轮处理`,
        source: ref,
        ordinal: ordinal.get(key(ref)),
      });
    }
  events.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const day = (at?: string) =>
    at
      ? new Intl.DateTimeFormat('zh-CN', {
          month: 'long',
          day: 'numeric',
        }).format(new Date(at))
      : '更早的执行';
  return (
    <ol className="work-timeline" aria-label="工作记录">
      {events.map((event, index) => {
        const Icon = event.history
          ? eventIcons[event.history.kind] || CircleDot
          : Play;
        const run =
          event.source && snapshot?.work.id === event.source.workId
            ? snapshot.work.runs.find((run) => run.id === event.source!.runId)
            : undefined;
        return (
          <li key={event.id}>
            {(index === 0 || day(events[index - 1].at) !== day(event.at)) && (
              <h2>{day(event.at)}</h2>
            )}
            <article>
              <div className="work-event-icon">
                <Icon size={15} />
              </div>
              <div className="work-event-content">
                <div className="work-event-heading">
                  <span>{event.title}</span>
                  {event.ordinal && run && <Badge status={run.status} />}
                  <time
                    dateTime={event.at}
                    title={event.at ? dateTime(event.at) : undefined}
                  >
                    {event.at
                      ? new Intl.DateTimeFormat('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        }).format(new Date(event.at))
                      : ''}
                  </time>
                  {event.source ? (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={
                        event.ordinal
                          ? `查看第 ${event.ordinal} 轮执行`
                          : '查看事件来源'
                      }
                      title="查看固定来源"
                      onClick={() => onRun(event.source!)}
                    >
                      <ArrowUpRight size={14} />
                    </Button>
                  ) : event.history?.materialIds?.length ? (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="查看本次材料"
                      onClick={onInputs}
                    >
                      <ArrowUpRight size={14} />
                    </Button>
                  ) : null}
                </div>
                {event.detail && <p>{event.detail}</p>}
                {!!event.history?.criteria?.length && (
                  <details>
                    <summary>当时的完成条件</summary>
                    {event.history.criteria.map((c) => (
                      <div key={c.id}>
                        <strong>{c.text}</strong>
                        <p>{c.evidence}</p>
                      </div>
                    ))}
                  </details>
                )}
              </div>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
