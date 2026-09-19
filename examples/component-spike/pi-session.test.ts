import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPiFixture } from './pi-session.ts';
import type { WireEvent } from './src/bridge.ts';

test('real Pi session calls the sample tool and streams its final response', async () => {
  const events: WireEvent[] = [];
  const result = await runPiFixture({
    text: 'Inspect selection',
    sampleIds: ['s3'],
    signal: new AbortController().signal,
    emit: (event) => events.push(event),
    fast: true,
  });
  assert.equal(result.calls, 2);
  assert.ok(
    events.some((event) => event.type === 'tool.completed' && !event.isError),
  );
  assert.ok(events.some((event) => event.type === 'text.delta'));
  assert.equal(events.at(-1)?.type, 'done');
});

test('cancel reaches Pi while streaming and stops before final response', async () => {
  const controller = new AbortController();
  const events: WireEvent[] = [];
  const result = await runPiFixture({
    text: 'Inspect',
    sampleIds: ['s1'],
    signal: controller.signal,
    emit: (event) => {
      events.push(event);
      if (event.type === 'text.delta') controller.abort();
    },
  });
  assert.equal(result.aborted, true);
  assert.equal(events.at(-1)?.type, 'cancelled');
  assert.ok(events.filter((event) => event.type === 'text.delta').length < 4);
});

test('two Pi sessions keep their sample context and cancellation independent', async () => {
  const first = new AbortController();
  const secondEvents: WireEvent[] = [];
  const [cancelled, complete] = await Promise.all([
    runPiFixture({
      text: 'first',
      sampleIds: ['s1'],
      signal: first.signal,
      fast: true,
      emit: (event) => {
        if (event.type === 'text.delta') first.abort();
      },
    }),
    runPiFixture({
      text: 'second',
      sampleIds: ['s2'],
      signal: new AbortController().signal,
      fast: true,
      emit: (event) => secondEvents.push(event),
    }),
  ]);
  assert.equal(cancelled.aborted, true);
  assert.equal(complete.aborted, false);
  assert.equal(secondEvents.at(-1)?.type, 'done');
  assert.ok(
    secondEvents.some(
      (event) => event.type === 'tool.started' && event.args.sampleId === 's2',
    ),
  );
});
