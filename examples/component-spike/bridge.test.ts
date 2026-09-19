import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduceEvent, snapshotSelection } from './src/bridge.ts';

test('tool result survives subsequent text deltas', () => {
  let parts = reduceEvent([], {
    type: 'tool.started',
    id: 't1',
    args: { sampleId: 's2' },
  });
  parts = reduceEvent(parts, {
    type: 'tool.completed',
    id: 't1',
    result: { category: 'bug' },
  });
  parts = reduceEvent(parts, { type: 'text.delta', text: 'Done' });
  assert.equal(parts.length, 2);
  assert.deepEqual(parts[0].type === 'tool-call' && parts[0].result, {
    category: 'bug',
  });
});

test('selection is snapshotted by stable identity, including filtered-out samples', () => {
  const selected = { s3: true, s1: true, s2: false };
  const snapshot = snapshotSelection(selected);
  selected.s1 = false;
  assert.deepEqual(snapshot, ['s1', 's3']);
});
