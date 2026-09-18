import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultEInkArrangement, normalizeEInkArrangement, visibleEInkContent } from '../src/eink-content-model.ts';

test('normalizes unknown local arrangement without changing the shared content contract', () => {
  assert.deepEqual(normalizeEInkArrangement({ mode: 'unknown', content: { schedule: false } }), {
    mode: 'summary', content: { schedule: false, todo: true, letters: true },
  });
});

test('single-content modes constrain the preview while summary keeps explicit selections', () => {
  assert.deepEqual(visibleEInkContent({ ...defaultEInkArrangement, mode: 'schedule' }), { schedule: true, todo: false, letters: false });
  assert.deepEqual(visibleEInkContent({ mode: 'summary', content: { schedule: false, todo: true, letters: false } }), { schedule: false, todo: true, letters: false });
});
