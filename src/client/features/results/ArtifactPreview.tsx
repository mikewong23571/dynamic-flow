import type { Json } from '../../../shared/records';
import { artifactPreview } from './result-overview-model';

export function ArtifactPreview({
  value,
  limit = 6,
}: {
  value: Json;
  limit?: number;
}) {
  const fields = artifactPreview(value).slice(0, limit);
  return fields.length ? (
    <dl className="artifact-choice-preview">
      {fields.map(({ label, text, full }) => (
        <div key={label}>
          {label && <dt>{label}</dt>}
          <dd title={full}>{text}</dd>
        </div>
      ))}
    </dl>
  ) : null;
}
