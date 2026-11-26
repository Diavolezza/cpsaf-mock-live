// Loading and checking question catalogues (YAML files in /exams).
import { load } from './vendor/js-yaml.mjs';

export async function loadIndex(base = '.') {
  const res = await fetch(`${base}/exams/index.json`, { cache: 'no-cache' });
  return res.json();
}

const cache = new Map();
export async function loadCatalog(file, base = '.') {
  if (!cache.has(file)) {
    const res = await fetch(`${base}/exams/${file}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Catalogue ${file} not found`);
    const cat = parseCatalog(await res.text());
    cache.set(file, cat);
  }
  return cache.get(file);
}

export function parseCatalog(text) {
  const cat = load(text);
  const errors = validateCatalog(cat);
  if (errors.length) throw new Error('Catalogue errors:\n' + errors.join('\n'));
  return cat;
}

// Returns a list of error messages (empty = ok).
export function validateCatalog(cat) {
  const err = [];
  const langs = ['de', 'en'];
  const bilingual = (obj, where) => {
    for (const l of langs) if (typeof obj?.[l] !== 'string' || !obj[l].trim()) err.push(`${where}: text for "${l}" missing`);
  };
  if (!Array.isArray(cat?.questions) || !cat.questions.length) return ['no questions'];
  const ids = new Set();
  cat.questions.forEach((q, i) => {
    const w = `question ${i + 1} (${q.id ?? 'no id'})`;
    if (!q.id) err.push(`${w}: id missing`);
    else if (ids.has(q.id)) err.push(`${w}: duplicate id`);
    ids.add(q.id);
    if (!['A', 'P', 'K'].includes(q.type)) err.push(`${w}: type must be A, P or K`);
    if (!(q.points > 0)) err.push(`${w}: points missing`);
    bilingual(q.text, `${w} text`);
    if (q.type === 'A' || q.type === 'P') {
      if (!Array.isArray(q.options) || q.options.length < 2) { err.push(`${w}: at least two options needed`); return; }
      q.options.forEach((o, j) => bilingual(o, `${w} option ${j + 1}`));
      const nCorrect = q.options.filter((o) => o.correct === true).length;
      if (q.type === 'A' && nCorrect !== 1) err.push(`${w}: A-Question needs exactly one correct option (has ${nCorrect})`);
      if (q.type === 'P') {
        if (!Number.isInteger(q.pick) || q.pick < 1) err.push(`${w}: pick missing`);
        else if (nCorrect !== q.pick) err.push(`${w}: pick is ${q.pick}, but ${nCorrect} options are marked correct`);
      }
    }
    if (q.type === 'K') {
      for (const l of langs) if (!Array.isArray(q.categories?.[l]) || q.categories[l].length !== 2) err.push(`${w}: two categories needed for "${l}"`);
      if (!Array.isArray(q.rows) || q.rows.length < 1) { err.push(`${w}: rows missing`); return; }
      q.rows.forEach((r, j) => {
        bilingual(r, `${w} row ${j + 1}`);
        if (r.answer !== 0 && r.answer !== 1) err.push(`${w} row ${j + 1}: answer must be 0 or 1`);
      });
    }
  });
  return err;
}
