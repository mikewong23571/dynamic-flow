import type { CreateWorkItem, WorkItemView } from '../../../shared/records';
import type { ItemWorkspace } from '../../../shared/workitem-composition';
import { api } from '../../core/api';

/** Both entry forms keep the saved identity and successful uploads when a later upload fails. */
export async function createItemWithFiles({
  input,
  files,
  created,
  onSaved,
  onUploaded,
}: {
  input: CreateWorkItem;
  files: File[];
  created?: WorkItemView;
  onSaved: (item: WorkItemView) => void;
  onUploaded: (file: File) => void;
}) {
  let item = created || (await api<WorkItemView>('/api/items', input));
  onSaved(item);
  for (const file of files) {
    const response = await fetch(
      `/api/items/${item.id}/uploads?name=${encodeURIComponent(file.name)}`,
      { method: 'POST', body: file },
    );
    const result = await response.json();
    if (!response.ok) throw Error(result.error || '文件上传失败');
    item = (result as ItemWorkspace).item;
    onSaved(item);
    onUploaded(file);
  }
  return item;
}
