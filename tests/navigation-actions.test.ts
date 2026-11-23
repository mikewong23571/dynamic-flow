import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useActions } from '../src/client/state/useActions';
import type { Definition, Snapshot } from '../src/shared/records';

function pendingSave() {
  const definition: Definition = {
    schemaVersion: 1,
    inputs: ['materials'],
    nodes: [],
    edges: [],
    outputs: {},
  };
  const writes: string[] = [];
  const activeWorkId = { current: 'A' };
  const definitionRef = { current: definition };
  const baseId = { current: 'v0' as string | undefined };
  const deps = {
    workId: 'A',
    activeWorkId,
    definition,
    definitionRef,
    baseId,
    setBusy: (v: boolean) => writes.push(`busy:${v}`),
    setError: (v: string) => writes.push(`error:${v}`),
    setDirty: (v: boolean) => writes.push(`dirty:${v}`),
    setLocalDefinition: () => writes.push('definition'),
    receive: () => writes.push('receive'),
  } as unknown as Parameters<typeof useActions>[0];
  const snapshot = {
    work: { id: 'A', draftId: 'v1' },
    definitions: { v1: definition },
  } as unknown as Snapshot;
  let release!: (response: Response) => void;
  const original = globalThis.fetch;
  globalThis.fetch = () =>
    new Promise<Response>((done) => {
      release = done;
    });
  const request = useActions(deps).saveDefinition();
  writes.length = 0;
  return {
    writes,
    activeWorkId,
    definitionRef,
    baseId,
    request,
    release: (status = 200) =>
      release(
        new Response(
          JSON.stringify(status === 200 ? snapshot : { error: 'A failed' }),
          { status },
        ),
      ),
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

test('迟到A保存不能写入B的定义、baseId、dirty或busy/error', async () => {
  const pending = pendingSave();
  try {
    pending.activeWorkId.current = 'B';
    pending.release();
    await pending.request;
    assert.equal(pending.baseId.current, 'v0');
    assert.deepEqual(pending.writes, []);
  } finally {
    pending.restore();
  }
});

test('旧对象失败不能在新对象呈现错误或解除其忙状态', async () => {
  const pending = pendingSave();
  try {
    pending.activeWorkId.current = 'B';
    pending.release(500);
    assert.equal(await pending.request, undefined);
    assert.deepEqual(pending.writes, []);
  } finally {
    pending.restore();
  }
});

test('同对象保存期间的新编辑保持未保存，同时更新其保存基线', async () => {
  const pending = pendingSave();
  try {
    pending.definitionRef.current = {
      ...pending.definitionRef.current,
      inputs: ['newer-edit'],
    };
    pending.release();
    await pending.request;
    assert.equal(pending.baseId.current, 'v1');
    assert.equal(pending.writes.includes('dirty:false'), false);
    assert.equal(pending.writes.includes('definition'), false);
    assert.equal(pending.writes.includes('receive'), true);
  } finally {
    pending.restore();
  }
});
