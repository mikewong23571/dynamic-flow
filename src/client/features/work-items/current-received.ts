import type { WorkItemView } from '../../../shared/records';
export function currentReceived(item: WorkItemView) {
  const replaced = new Set(
    item.receivedInputs?.flatMap((input) =>
      input.replacesId ? [input.replacesId] : [],
    ),
  );
  return (item.receivedInputs || []).filter((input) => !replaced.has(input.id));
}
