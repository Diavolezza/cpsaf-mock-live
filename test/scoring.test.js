// Examples taken from the iSAQB "Prüfungsregeln und Beispiele" (CPSA-F).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreQuestion } from '../js/scoring.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

const A = { type: 'A', points: 2, options: [{}, {}, { correct: true }] };
test('A: correct answer gives full points', () => close(scoreQuestion(A, [2]), 2));
test('A: no answer gives 0', () => close(scoreQuestion(A, []), 0));
test('A: wrong answer gives 0', () => close(scoreQuestion(A, [0]), 0));
test('A: two crosses give 0, even if one is correct', () => close(scoreQuestion(A, [0, 2]), 0));

const P = { type: 'P', points: 2, pick: 2, options: [{ correct: true }, {}, { correct: true }, {}] };
test('P: both correct gives 2', () => close(scoreQuestion(P, [0, 2]), 2));
test('P: nothing gives 0', () => close(scoreQuestion(P, []), 0));
test('P: one wrong cross gives 0 (not negative)', () => close(scoreQuestion(P, [3]), 0));
test('P: one correct and one wrong gives 0', () => close(scoreQuestion(P, [0, 3]), 0));
test('P: more crosses than required gives 0', () => close(scoreQuestion(P, [0, 1, 3]), 0));
test('P: one correct of two gives half', () => close(scoreQuestion(P, [0]), 1));
test('P: three correct of four gives 3/4', () => {
  const p4 = { type: 'P', points: 2, pick: 4, options: [{ correct: true }, { correct: true }, { correct: true }, { correct: true }, {}] };
  close(scoreQuestion(p4, [0, 1, 2]), 1.5);
});

const K = { type: 'K', points: 1, rows: [{ answer: 0 }, { answer: 1 }, { answer: 0 }] };
test('K: all correct gives 1', () => close(scoreQuestion(K, [0, 1, 0]), 1));
test('K: nothing gives 0', () => close(scoreQuestion(K, [null, null, null]), 0));
test('K: two correct, one wrong gives 1/3', () => close(scoreQuestion(K, [1, 1, 0]), 1 / 3));
test('K: one correct, two wrong gives 0 (not -1/3)', () => close(scoreQuestion(K, [1, 0, 0]), 0));
test('K: two correct, one empty gives 2/3', () => close(scoreQuestion(K, [0, null, 0]), 2 / 3));
