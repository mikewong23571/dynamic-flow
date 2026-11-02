/** One-time retirement of drafts from the removed business model. */
export const businessStorageVersion = 'unique-workitem-20261030';
export const businessStorageVersionKey = 'flowcraft.business-version';
export function resetLegacyBusinessStorage(storage: Storage) {
  if (storage.getItem(businessStorageVersionKey) === businessStorageVersion)
    return;
  const keys = Array.from({ length: storage.length }, (_, index) =>
    storage.key(index)!,
  );
  for (const key of keys)
    if (
      key.startsWith('dynamic-flow.context.') ||
      key.startsWith('flowcraft.item-conversations.') ||
      [
        'dynamic-flow.goal',
        'dynamic-flow.materials',
        'dynamic-flow.work',
        'dynamic-flow.opened-works',
        'dynamic-flow.pinned-works',
      ].includes(key)
    )
      storage.removeItem(key);
  storage.setItem(businessStorageVersionKey, businessStorageVersion);
}
