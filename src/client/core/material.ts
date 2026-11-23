import type { Json, WorkItemInput } from '../../shared/records';

const compact = (text: string, limit: number) => {
  // Labels only need their visible prefix; do not normalize a multi-megabyte body.
  let line = '',
    space = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (/\s/.test(character)) {
      space = !!line;
      continue;
    }
    if (space) line += ' ';
    line += character;
    space = false;
    if (line.length > limit) return `${line.slice(0, limit)}…`;
  }
  return line;
};
export function materialPresentation(
  material: WorkItemInput['materials'][number],
) {
  let value: Json = material.text;
  try {
    value = JSON.parse(material.text) as Json;
  } catch {
    /* Original text remains readable. */
  }
  const object =
    value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : undefined;
  const field = (key: string) =>
    typeof object?.[key] === 'string' ? (object[key] as string) : '';
  const ref = object?.ref;
  const version =
    ref &&
    typeof ref === 'object' &&
    !Array.isArray(ref) &&
    typeof ref.value === 'string'
      ? ref.value
      : '';
  const heading =
    field('title') ||
    field('label') ||
    field('name') ||
    (field('repository')
      ? `${field('repository')}${version ? ` · ${version}` : ''}`
      : '');
  let firstLine = '',
    remainder = '';
  if (!object && !Array.isArray(value))
    for (const match of material.text.matchAll(/[^\n]+/g)) {
      if (!match[0].trim()) continue;
      firstLine = match[0].trim();
      remainder = material.text.slice(match.index! + match[0].length);
      break;
    }
  const title = compact(
    heading ||
      (object
        ? '结构化材料'
        : Array.isArray(value)
          ? `材料集合（${value.length} 项）`
          : firstLine.replace(/^#+\s*/, '') || '空材料'),
    140,
  );
  const summary = object
    ? field('purpose') ||
      field('summary') ||
      field('description') ||
      Object.entries(object)
        .filter(
          ([key, entry]) =>
            typeof entry !== 'object' &&
            !['title', 'label', 'name', 'repository'].includes(key),
        )
        .slice(0, 3)
        .map(([key, entry]) => `${key}：${String(entry)}`)
        .join(' · ')
    : Array.isArray(value)
      ? `包含 ${value.length} 项，展开检查完整内容`
      : compact(remainder, 200) || `正文 ${material.text.length} 字符`;
  return {
    title,
    summary: compact(summary || `正文 ${material.text.length} 字符`, 200),
    value,
  };
}
