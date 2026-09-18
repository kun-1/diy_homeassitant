import assert from 'node:assert/strict';
import test from 'node:test';
import { countSentLetters } from '../src/letter-stats.ts';

test('counts each successfully printed letter once', () => {
  const letters = [
    { id: 'a', unread: false },
    { id: 'b', unread: true },
    { id: 'c', unread: true },
  ];
  const jobs = [
    { letterId: 'a', status: 'completed' },
    { letterId: 'a', status: 'completed' },
    { letterId: 'b', status: 'failed' },
    { letterId: 'c', status: 'printing' },
  ];
  assert.equal(countSentLetters(letters, jobs), 1);
});

test('falls back to legacy unread=false records when no completed jobs exist', () => {
  const letters = [
    { id: 'legacy-a', unread: false },
    { id: 'legacy-b', unread: false },
    { id: 'draft', unread: true },
  ];
  assert.equal(countSentLetters(letters, []), 2);
});
