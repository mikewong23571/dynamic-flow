import { useState } from 'react';
import { ExternalLink, Link2 } from 'lucide-react';
import type { OutputReference } from '../../../../shared/records';
import type { ItemDeliveryView } from '../../../../shared/workitem-composition';
import { Button } from '../../../components/ui/button';
import { ArtifactPreview } from '../../results/ArtifactPreview';
import '../../../components/MaterialCard.css';

export function DeliverySources({
  delivery,
  step,
  onSource,
}: {
  delivery: ItemDeliveryView;
  step?: string;
  onSource: (source: OutputReference) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sources = [
    ...new Map(
      delivery.sources.map((source) => [JSON.stringify(source), source]),
    ).values(),
  ];
  if (!sources.length) return null;
  if (sources.length === 1)
    return (
      <Button variant="ghost" size="sm" onClick={() => onSource(sources[0])}>
        <Link2 size={14} />
        查看来源
        <ExternalLink size={12} />
      </Button>
    );
  return (
    <div className="composition-sources">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <Link2 size={14} />
        交付来源 · {sources.length}
      </Button>
      {expanded && (
        <>
          <p className="delivery-source-step">{step || delivery.output}</p>
          <ul className="material-cards delivery-source-list">
            {sources.map((source, index) => (
              <li className="material-card" key={JSON.stringify(source)}>
                <strong>产物 {index + 1}</strong>
                {delivery.rows?.[index] !== undefined && (
                  <ArtifactPreview value={delivery.rows[index]} limit={3} />
                )}
                <Button variant="ghost" onClick={() => onSource(source)}>
                  查看原产物
                  <ExternalLink size={12} />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
