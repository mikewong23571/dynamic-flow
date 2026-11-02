import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkItemView } from '../../../../shared/records';
import type { ItemWorkspace } from '../../../../shared/workitem-composition';
import { api, apiIfChanged } from '../../../core/api';
import { errorText } from '../../../core/format';
export type WorkspaceSeed = { value: ItemWorkspace; etag?: string };
/** The workspace HTTP lifecycle and revision ordering, shared by every task on this page. */
export function useCompositionWorkspace(
  initial: WorkItemView,
  active: boolean,
  onChange: (item: WorkItemView) => void,
  seed?: WorkspaceSeed,
) {
  const [workspace, setWorkspace] = useState<ItemWorkspace | undefined>(
      seed?.value,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [readError, setReadError] = useState('');
  const current = useRef(workspace);
  const initialEtag = useRef(seed?.etag);
  const requestGeneration = useRef(0);
  current.current = workspace;
  const callback = useRef(onChange);
  callback.current = onChange;
  const apply = useCallback((next: ItemWorkspace) => {
    const previous = current.current;
    if (
      previous &&
      (previous.item.revision > next.item.revision ||
        (previous.item.revision === next.item.revision &&
          previous.work?.work.id === next.work?.work.id &&
          (previous.work?.work.revision ?? -1) >
            (next.work?.work.revision ?? -1)))
    )
      return false;
    current.current = next;
    setWorkspace(next);
    callback.current(next.item);
    return true;
  }, []);
  const refresh = useCallback(async () => {
    const next = await api<ItemWorkspace>(`/api/items/${initial.id}/workspace`);
    apply(next);
    setReadError('');
    return next;
  }, [initial.id, apply]);
  useEffect(() => {
    if (!active) return;
    let live = true;
    let etag = initialEtag.current;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const generation = requestGeneration.current;
      try {
        const next = await apiIfChanged<ItemWorkspace>(
          `/api/items/${initial.id}/workspace`,
          etag,
          controller.signal,
        );
        if (live && generation === requestGeneration.current) {
          if (!next.data || apply(next.data)) {
            etag = next.etag;
            initialEtag.current = next.etag;
            setReadError('');
          }
        }
      } catch (e) {
        if (live) setReadError(errorText(e));
      } finally {
        if (live) timer = setTimeout(() => void poll(), 1200);
      }
    }
    void poll();
    return () => {
      live = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [initial.id, active, apply]);
  async function command(
    action: string,
    fields: Record<string, unknown> = {},
    localError = false,
  ) {
    requestGeneration.current++;
    setBusy(true);
    setError('');
    try {
      const next = await api<ItemWorkspace>(
        `/api/items/${initial.id}/workspace/actions`,
        {
          action,
          baseRevision: current.current?.item.revision ?? initial.revision,
          ...fields,
        },
      );
      apply(next);
      return next;
    } catch (e) {
      if (!localError) setError(errorText(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    requestGeneration.current++;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/items/${initial.id}/uploads?name=${encodeURIComponent(file.name)}`,
        { method: 'POST', body: file },
      );
      const next = await response.json();
      if (!response.ok) throw Error(next.error || '文件上传失败');
      apply(next as ItemWorkspace);
    } catch (e) {
      setError(errorText(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }
  return {
    workspace,
    busy,
    error: error || readError,
    setError,
    refresh,
    command,
    upload,
  };
}
