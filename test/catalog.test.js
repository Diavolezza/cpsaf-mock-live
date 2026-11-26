// Checks every catalogue listed in exams/index.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCatalog, validateCatalog } from '../js/catalog.js';
import { scoreQuestion, correctAnswer, encodeAnswer, decodeAnswer } from '../js/scoring.js';

const dir = new URL('../exams/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8'));

for (const entry of index) {
  test(`catalogue ${entry.file} is valid`, () => {
    const cat = parseCatalog(readFileSync(new URL(entry.file, dir), 'utf8'));
    assert.deepEqual(validateCatalog(cat), []);
    for (const q of cat.questions) {
      const best = correctAnswer(q);
      assert.equal(scoreQuestion(q, best), q.points, `${q.id}: correct answer must give full points`);
      assert.deepEqual(decodeAnswer(q, encodeAnswer(q, best)), best, `${q.id}: encoding`);
    }
  });
}

test('the CPSA-F mock exam has 38 questions and 52 points', () => {
  const cat = parseCatalog(readFileSync(new URL('cpsa-f-mock-2026.2.yaml', dir), 'utf8'));
  assert.equal(cat.questions.length, 38);
  assert.equal(cat.questions.reduce((s, q) => s + q.points, 0), 52);
});

test('validation finds errors', () => {
  const bad = { questions: [{ id: 'x', type: 'P', points: 1, pick: 2, text: { de: 'a', en: 'b' }, options: [{ de: 'a', en: 'a', correct: true }, { de: 'b', en: 'b' }] }] };
  assert.equal(validateCatalog(bad).length, 1);
});
