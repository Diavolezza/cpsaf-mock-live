// Participant view (index.html).
import { openDb, isDemo, keepParams } from './backend.js';
import { makeStore, qkey, askedIndices } from './store.js';
import { loadCatalog } from './catalog.js';
import { t, browserLang, fmt } from './i18n.js';
import { scoreQuestion, encodeAnswer, decodeAnswer } from './scoring.js';
import { PASS_PERCENT } from './config.js';
import { h, questionHeader, questionText, questionBody, legend } from './render.js';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const code = (params.get('s') || '').toUpperCase().trim();
let lang = browserLang();

function show(...nodes) {
  app.replaceChildren(...nodes.filter(Boolean));
}

function demoBanner() {
  return isDemo() ? h('div.demo', t(lang).demoBanner) : null;
}

function joinForm(error) {
  const L = t(lang);
  const input = h('input#code', {
    name: 's', autocomplete: 'off', autocapitalize: 'characters', maxlength: 8, required: true,
    value: code, 'aria-label': L.joinCodeLabel, placeholder: 'ABCDE',
  });
  document.title = L.appTitle;
  show(
    demoBanner(),
    h('main.card.narrow',
      h('h1', L.joinTitle),
      error ? h('p.error', error) : null,
      h('form', {
        onsubmit: (e) => {
          e.preventDefault();
          const u = new URL(keepParams(location.pathname));
          u.searchParams.set('s', input.value.toUpperCase().trim());
          location.href = u.toString();
        },
      },
        h('label', { for: 'code' }, L.joinCodeLabel),
        input,
        h('button.primary', { type: 'submit' }, L.joinButton),
      ),
      h('p.small', h('a', { href: keepParams('trainer.html') }, L.trainerLink),
        isDemo() ? null : [' · ', h('a', { href: 'index.html?demo=1' }, L.demoLink)]),
    ),
  );
}

async function main() {
  if (!code) return joinForm();
  show(h('main.card.narrow', h('p', t(lang).connecting)));

  const store = makeStore(await openDb());
  const session = await store.getSession(code).catch(() => null);
  if (!session) return joinForm(t(lang).joinUnknown);

  lang = session.lang;
  document.documentElement.lang = lang;
  const catalog = await loadCatalog(session.catalog);
  const questions = catalog.questions;
  document.title = catalog.title[lang];
  await store.join(code);

  let state = session.state;
  let mine = {};
  const selection = {}; // qkey -> current (not yet submitted) answer
  let confirming = false;
  let error = null;

  store.watchSession(code, (s) => {
    if (!s) return joinForm(t(lang).joinUnknown);
    if (s.state.qkey !== state.qkey || s.state.phase !== state.phase) {
      confirming = false;
      error = null;
    }
    state = s.state;
    render();
  });
  store.watchMyAnswers(code, (a) => {
    mine = a;
    render();
  });

  function render() {
    const L = t(lang);
    const top = h('header.top', h('span.brand', catalog.title[lang]), h('span.code', code));
    const footer = h('footer.source', catalog.source?.[lang], ' ', L.selfTest);
    const phase = state.phase;

    if (phase === 'lobby') {
      return show(demoBanner(), top, h('main.card.center', h('h1', L.lobbyTitle), h('p', L.lobbyText)), footer);
    }
    if (phase === 'paused') {
      return show(demoBanner(), top, h('main.card.center', h('h1.pause', L.pauseTitle), h('p', L.pauseText)), footer);
    }
    if (phase === 'finished') {
      return show(demoBanner(), top, results(), footer);
    }

    const i = state.index;
    const q = questions[i];
    const key = qkey(i);
    const submitted = mine[key] ? decodeAnswer(q, mine[key].a) : null;
    const card = h('main.card',
      questionHeader(q, i, questions.length, lang),
      questionText(q, lang),
    );

    if (phase === 'answering') {
      if (submitted) {
        card.append(questionBody(q, lang, 'input', { selection: submitted, locked: true, onChange() {} }));
        card.append(h('p.status.ok', L.submitted));
      } else {
        const sel = selection[key] ?? (q.type === 'K' ? q.rows.map(() => null) : []);
        card.append(questionBody(q, lang, 'input', {
          selection: sel,
          locked: confirming,
          onChange: (next) => {
            selection[key] = next;
            render();
          },
        }));
        if (error) card.append(h('p.error', error));
        if (!confirming) {
          card.append(h('div.actions', h('button.primary.big', { type: 'button', onclick: () => { confirming = true; render(); } }, L.submit)));
        } else {
          card.append(h('div.confirm',
            h('p', h('strong', L.submitConfirm), ' ', L.submitHint),
            h('div.actions',
              h('button', { type: 'button', onclick: () => { confirming = false; render(); } }, L.confirmNo),
              h('button.primary.big', {
                type: 'button',
                onclick: async (e) => {
                  e.target.disabled = true;
                  try {
                    await store.submitAnswer(code, i, encodeAnswer(q, sel));
                  } catch (err) {
                    console.error(err);
                    error = L.submitFailed;
                  }
                  confirming = false;
                  render();
                },
              }, L.confirmYes),
            ),
          ));
        }
      }
    } else if (phase === 'revealed') {
      card.append(questionBody(q, lang, 'result', { mine: submitted }));
      card.append(legend(lang));
      card.append(submitted
        ? h('p.status.score', L.yourPoints(scoreQuestion(q, submitted), q.points))
        : h('p.status.missing', L.notSubmitted));
      card.append(h('p.small', L.waitNext));
    }
    show(demoBanner(), top, card, footer);
  }

  function results() {
    const L = t(lang);
    const asked = askedIndices(state, questions.length);
    let total = 0;
    let max = 0;
    const rows = [];
    questions.forEach((q, i) => {
      const key = qkey(i);
      if (state.skipped?.[key]) {
        rows.push(h('tr.skipped', h('td', i + 1), h('td', L.skipped)));
        return;
      }
      if (!asked.includes(i)) return;
      const ans = mine[key] ? decodeAnswer(q, mine[key].a) : null;
      const p = ans ? scoreQuestion(q, ans) : 0;
      total += p;
      max += q.points;
      rows.push(h('tr', h('td', i + 1), h('td', ans ? `${fmt(p, lang)} / ${fmt(q.points, lang)}` : `0 / ${fmt(q.points, lang)} · ${L.notSubmitted}`)));
    });
    const pct = max ? (total / max) * 100 : 0;
    const pass = pct >= PASS_PERCENT;
    return h('main.card',
      h('h1', L.finishedTitle),
      h('p.result', L.resultLine(total, max)),
      h('p.percent', `${fmt(pct, lang)} %`),
      h('p.verdict' + (pass ? '.pass' : '.fail'), pass ? L.passed : L.failed),
      h('h3', L.perQuestion),
      h('table.points', h('thead', h('tr', h('th', L.colQuestion), h('th', L.colPoints))), h('tbody', rows)),
    );
  }

  render();
}

main().catch((e) => {
  console.error(e);
  show(h('main.card.narrow', h('p.error', String(e.message || e))));
});
