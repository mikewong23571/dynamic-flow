import type { RunResultSummary } from '../../../shared/result-summary';
import './RunSummary.css';

export function RunSummary({ summary }: { summary: RunResultSummary }) {
  return (
    <article className="item-result-summary">
      <h3>{summary.title}</h3>
      <p>{summary.summary}</p>
      <dl className="item-result-scope">
        <dt>本轮范围</dt>
        <dd>{summary.scope}</dd>
      </dl>
      {!!summary.metrics?.length && (
        <dl className="item-result-metrics">
          {summary.metrics.map((metric, index) => (
            <div key={index}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {!!summary.limitations?.length && (
        <div className="item-result-limitations">
          <h4>限制与待确认</h4>
          <ul>
            {summary.limitations.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </div>
      )}
      {summary.nextAction && (
        <div className="item-result-next">
          <h4>建议下一步</h4>
          <p>{summary.nextAction}</p>
        </div>
      )}
    </article>
  );
}
