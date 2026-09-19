export type Part =
  | { type: 'text'; text: string }
  | {
      type: 'tool-call';
      toolCallId: string;
      toolName: string;
      args: { sampleId: string };
      result?: unknown;
      isError?: boolean;
    };
export type WireEvent =
  | { type: 'text.delta'; text: string }
  | { type: 'tool.started'; id: string; args: { sampleId: string } }
  | { type: 'tool.completed'; id: string; result: unknown; isError?: boolean }
  | { type: 'done' | 'cancelled' }
  | { type: 'error'; message: string };

export function reduceEvent(parts: Part[], event: WireEvent): Part[] {
  if (event.type === 'tool.started')
    return [
      ...parts,
      {
        type: 'tool-call',
        toolCallId: event.id,
        toolName: 'inspect_sample',
        args: event.args,
      },
    ];
  if (event.type === 'tool.completed')
    return parts.map((part) =>
      part.type === 'tool-call' && part.toolCallId === event.id
        ? { ...part, result: event.result, isError: event.isError }
        : part,
    );
  if (event.type === 'text.delta') {
    const last = parts.at(-1);
    return last?.type === 'text'
      ? [...parts.slice(0, -1), { ...last, text: last.text + event.text }]
      : [...parts, { type: 'text', text: event.text }];
  }
  return parts;
}

export function snapshotSelection(
  selection: Record<string, boolean>,
): string[] {
  return Object.keys(selection)
    .filter((id) => selection[id])
    .sort();
}
