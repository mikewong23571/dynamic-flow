import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MarkdownTable } from '../../components/MarkdownTable';
import type { Json } from '../../../shared/records';

export const Value = memo(function RenderValue({ value }: { value: Json }) {
  if (typeof value === 'string')
    return (
      <div className="prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{ table: MarkdownTable }}
        >
          {value}
        </ReactMarkdown>
      </div>
    );
  if (value === null || typeof value !== 'object')
    return <span>{String(value)}</span>;
  if (Array.isArray(value))
    return (
      <div className="value-list">
        {value.map((v, i) => (
          <Value key={i} value={v} />
        ))}
      </div>
    );
  return (
    <dl className="value-object">
      {Object.entries(value).map(([key, v]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>
            <Value value={v} />
          </dd>
        </div>
      ))}
    </dl>
  );
});
