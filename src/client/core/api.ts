/** 304 deliberately has no body: do not parse or reapply unchanged state. */
export async function apiIfChanged<T>(
  path: string,
  etag?: string,
  signal?: AbortSignal,
) {
  const response = await fetch(path, {
    cache: 'no-store',
    signal,
    headers: etag ? { 'If-None-Match': etag } : {},
  });
  if (response.status === 304) return { etag, data: undefined };
  const data = await response.json();
  if (!response.ok) throw Error(data.error || `请求失败 (${response.status})`);
  return { etag: response.headers.get('ETag') ?? undefined, data: data as T };
}

export async function api<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  // Browser method workspaces consume explicit overview snapshots; CLI readers can still request full fixed runs.
  if (
    /^\/api\/works\/[^/?]+(?:\/(?:actions|model-selection))?(?:\?|$)/.test(
      path,
    ) &&
    !/[?&]view=/.test(path)
  )
    path += `${path.includes('?') ? '&' : '?'}view=overview`;
  const response = await fetch(
    path,
    body === undefined
      ? undefined
      : {
          method: method ?? 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || `请求失败 (${response.status})`);
    if (Array.isArray(data.affectedAncestors))
      Object.assign(error, { affectedAncestors: data.affectedAncestors });
    if (typeof data.code === 'string')
      Object.assign(error, { code: data.code });
    throw error;
  }
  return data as T;
}
export async function upload(workId: string, file: File): Promise<string> {
  const response = await fetch(
    `/api/works/${workId}/uploads?name=${encodeURIComponent(file.name)}`,
    { method: 'POST', body: file },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || `上传失败 (${response.status})`);
  return data.file as string;
}
