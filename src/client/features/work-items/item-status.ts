import type { WorkItemSummaryRow } from '../../../shared/records';

export const itemStatusNames = {
  open: '待推进',
  running: '推进中',
  waiting: '等待中',
  attention: '需处理',
  review: '待复核',
  completed: '已结项',
};
export const itemStatusFilterNames = itemStatusNames;
export function itemStatusLabel(
  item: Pick<WorkItemSummaryRow, 'effectiveStatus'> & {
    todo?: WorkItemSummaryRow['todo'];
  },
) {
  return item.todo === 'confirm'
    ? '待整体验收'
    : itemStatusNames[item.effectiveStatus];
}
