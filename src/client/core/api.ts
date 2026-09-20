export async function api<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
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
  if (!response.ok)
    throw new Error(data.error || `请求失败 (${response.status})`);
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
