// Shared rendering of questions for participants and trainer.
import { t, fmt } from './i18n.js';

// tiny DOM helper: h('div.class', {attrs}, ...children)
export function h(tag, attrs, ...children) {
  const [nameId, ...classes] = tag.split('.');
  const [name, id] = nameId.split('#');
  const el = document.createElement(name || 'div');
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const letter = (i) => String.fromCharCode(97 + i) + ')';

export function questionHeader(q, index, total, lang) {
  const L = t(lang);
  return h('div.qhead',
    h('span.qnum', L.questionOf(index + 1, total)),
    h('span.qtype', L.typeLabel[q.type]),
    h('span.qpoints', L.points(q.points)),
  );
}

export function questionText(q, lang) {
  const L = t(lang);
  return [h('h2.qtext', q.text[lang]), h('p.instruction', L.instruction(q))];
}

/**
 * Body of a question.
 * mode:
 *   'input'  – participant answers;    opts: { selection, onChange, locked }
 *   'show'   – plain (trainer while voting)
 *   'result' – participant after reveal; opts: { mine }  (decoded answer or null)
 *   'stats'  – trainer after reveal;   opts: { stats }   (see answerStats)
 */
export function questionBody(q, lang, mode, opts = {}) {
  return q.type === 'K' ? kBody(q, lang, mode, opts) : choiceBody(q, lang, mode, opts);
}

function choiceBody(q, lang, mode, { selection = [], onChange, locked, mine, stats }) {
  const list = h('ol.options');
  q.options.forEach((o, i) => {
    const selected = mode === 'input' ? selection.includes(i) : mode === 'result' ? !!mine?.includes(i) : false;
    const showCorrect = mode === 'result' || mode === 'stats';
    const cls = ['opt'];
    if (selected) cls.push('selected');
    if (showCorrect && o.correct) cls.push('correct');
    if (mode === 'result' && selected && !o.correct) cls.push('wrong');
    const box = h('span.box', { 'aria-hidden': 'true' }, selected ? '✕' : '');
    const content = [box, h('span.letter', letter(i)), h('span.otext', o[lang])];
    if (showCorrect && o.correct) content.push(h('span.tick', { title: t(lang).correct }, '✓'));
    let el;
    if (mode === 'input') {
      el = h('button.' + cls.join('.'), {
        type: 'button', role: 'checkbox', 'aria-checked': String(selected), disabled: locked,
        onclick: () => onChange(selected ? selection.filter((x) => x !== i) : [...selection, i]),
      }, content);
    } else {
      el = h('div.' + cls.join('.'), content);
    }
    if (mode === 'stats') el.append(bar(stats.options[i], stats.n, o.correct, lang));
    list.append(h('li', el));
  });
  return list;
}

function kBody(q, lang, mode, { selection = [], onChange, locked, mine, stats }) {
  const cats = q.categories[lang];
  const wrap = h('div.krows');
  q.rows.forEach((r, i) => {
    const row = h('div.krow');
    row.append(h('div.ktext', h('span.letter', letter(i)), ' ', r[lang]));
    const btns = h('div.kchoices');
    cats.forEach((c, ci) => {
      const selected = mode === 'input' ? selection[i] === ci : mode === 'result' ? mine?.[i] === ci : false;
      const showCorrect = mode === 'result' || mode === 'stats';
      const cls = ['kopt'];
      if (selected) cls.push('selected');
      if (showCorrect && r.answer === ci) cls.push('correct');
      if (mode === 'result' && selected && r.answer !== ci) cls.push('wrong');
      const content = [h('span.box', { 'aria-hidden': 'true' }, selected ? '✕' : ''), h('span.klabel', c)];
      if (showCorrect && r.answer === ci) content.push(h('span.tick', '✓'));
      if (mode === 'input') {
        btns.append(h('button.' + cls.join('.'), {
          type: 'button', role: 'radio', 'aria-checked': String(selected), disabled: locked,
          onclick: () => {
            const next = q.rows.map((_, j) => selection[j] ?? null);
            next[i] = selected ? null : ci; // tapping again clears the row
            onChange(next);
          },
        }, content));
      } else {
        const el = h('div.' + cls.join('.'), content);
        if (mode === 'stats') el.append(bar(stats.rows[i][ci], stats.n, r.answer === ci, lang));
        btns.append(el);
      }
    });
    if (mode === 'stats' && stats.rows[i][2] > 0) {
      btns.append(h('div.kempty', `${t(lang).empty}: ${stats.rows[i][2]}`));
    }
    row.append(btns);
    wrap.append(row);
  });
  return wrap;
}

function bar(count, n, correct, lang) {
  const pct = n ? Math.round((count / n) * 100) : 0;
  return meter(pct, `${pct} % · ${t(lang).votes(count)}`, correct);
}

export function meter(pct, label, good) {
  return h('div.bar' + (good ? '.good' : ''),
    h('div.track', h('div.fill', { style: `width:${pct}%` })),
    h('span.barlabel', label),
  );
}

// Counts the answers of all participants for one question.
// answers: { uid: decodedAnswer }
export function answerStats(q, answers) {
  const list = Object.values(answers).filter((a) => a !== null && a !== undefined);
  const stats = { n: list.length };
  if (q.type === 'K') {
    stats.rows = q.rows.map((_, i) => {
      const c = [0, 0, 0];
      list.forEach((a) => (a[i] === 0 ? c[0]++ : a[i] === 1 ? c[1]++ : c[2]++));
      return c;
    });
  } else {
    stats.options = q.options.map((_, i) => list.filter((a) => a.includes(i)).length);
  }
  return stats;
}

export function legend(lang) {
  const L = t(lang);
  return h('div.legend',
    h('span.lg.correct', h('span.tick', '✓'), ' ', L.legendCorrect),
    h('span.lg.selected', h('span.box', '✕'), ' ', L.legendMine),
  );
}

export { fmt };
