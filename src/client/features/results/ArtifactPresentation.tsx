import { useState, type ReactNode } from 'react';
import { Copy } from 'lucide-react';
import type { Json, NodeResult } from '../../../shared/records';
import { Badge, Button } from '../../components/ui';

export function ArtifactHeading({
  heading,
  result,
  copyValue,
  actions,
}: {
  heading: string;
  result: Pick<NodeResult, 'status' | 'purpose' | 'iteration' | 'intermediate'>;
  copyValue?: Json;
  actions?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  return (
    <div className="item-artifact-heading">
      <div className="item-artifact-identity">
        <h3>{heading}</h3>
        <Badge status={result.status} />
        {result.purpose && <Badge>生成计划</Badge>}
        {result.iteration && (
          <Badge>
            第 {result.iteration} 轮{result.intermediate ? ' · 中间结果' : ''}
          </Badge>
        )}
      </div>
      <div className="item-artifact-actions">
        {actions}
        {copyValue !== undefined && (
          <Button
            variant="ghost"
            onClick={() => {
              setCopyError('');
              void navigator.clipboard
                .writeText(
                  typeof copyValue === 'string'
                    ? copyValue
                    : JSON.stringify(copyValue, null, 2),
                )
                .then(() => setCopied(true))
                .catch(() =>
                  setCopyError('复制失败，请从原始数据中选取内容。'),
                );
            }}
          >
            <Copy size={13} />
            {copied ? '已复制' : '复制'}
          </Button>
        )}
        {copyError && <span role="alert">{copyError}</span>}
      </div>
    </div>
  );
}

export function ArtifactViewControls({
  value,
  onChange,
}: {
  value: 'content' | 'raw';
  onChange: (value: 'content' | 'raw') => void;
}) {
  return (
    <div className="artifact-value-mode">
      <Button
        variant="ghost"
        aria-pressed={value === 'content'}
        onClick={() => onChange('content')}
      >
        查看内容
      </Button>
      <Button
        variant="ghost"
        aria-pressed={value === 'raw'}
        onClick={() => onChange('raw')}
      >
        原始数据
      </Button>
    </div>
  );
}
