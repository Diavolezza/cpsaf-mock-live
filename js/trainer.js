// Trainer view (trainer.html).
import { openAuth, isDemo, keepParams } from './backend.js';
import { makeStore, qkey, askedIndices } from './store.js';
import { loadIndex, loadCatalog } from './catalog.js';
import { t, browserLang, fmt } from './i18n.js';
import { scoreQuestion, decodeAnswer } from './scoring.js';
import { PASS_PERCENT, ADMIN_CONTACT } from './config.js';
import { h, questionHeader, questionText, questionBody, answerStats, meter, fitToScreen } from './render.js';
import qrcode from './vendor/qrcode.mjs';

const app = document.getElementById('app');
let uiLang = localStorage.getItem('cpsaf-ui-lang') || browserLang();
let auth, store, user;
let stopSession = [];

const show = (...nodes) => app.replaceChildren(...nodes.filter(Boolean));
const clean = (o) => JSON.parse(JSON.stringify(o)); // Firebase rejects undefined values

function joinUrl(code) {
  const u = new URL(keepParams('index.html'));
  u.searchParams.set('s', code);
  return u.toString();
}

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const div = h('div.qr');
  div.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  return div;
}

function topBar(extra = [], fixedLang = null) {
  const L = t(fixedLang || uiLang);
  return h('header.top',
    h('span.brand', L.trainerTitle),
    ...extra,
    h('span.spacer'),
    fixedLang ? null : h('select.langsel', {
      'aria-label': 'UI language',
      onchange: (e) => { uiLang = e.target.value; localStorage.setItem('cpsaf-ui-lang', uiLang); route(); },
    }, ['de', 'en'].map((l) => h('option', { value: l, selected: l === uiLang }, l.toUpperCase()))),
    user && !auth.demo ? h('button.link', { type: 'button', onclick: () => auth.signOut() }, L.logout) : null,
  );
}

function demoBanner(lang = uiLang) {
  return isDemo() ? h('div.demo', t(lang).demoBanner) : null;
}

// ---------- start ----------
async function main() {
  auth = await openAuth();
  auth.onChange((u) => {
    user = u;
    store = u ? makeStore(auth.db()) : null;
    route();
  });
  window.addEventListener('hashchange', route);
}

function route() {
  stopSession.forEach((f) => f && f());
  stopSession = [];
  const L = t(uiLang);
  if (!user) {
    return show(demoBanner(), topBar(), h('main.card.narrow',
      h('h1', L.trainerTitle),
      h('button.primary', { type: 'button', onclick: () => auth.signIn().catch((e) => alert(e.message)) }, L.loginGithub),
    ));
  }
  if (!user.isTrainer) {
    const subject = encodeURIComponent(`${L.trainerTitle}: ${user.login || user.name}`);
    return show(topBar(), h('main.card.narrow', h('h1', L.trainerTitle),
      h('p', L.notTrainer),
      h('p', L.contactAdmin(ADMIN_CONTACT.name), ' ',
        h('a', { href: `mailto:${ADMIN_CONTACT.email}?subject=${subject}` }, ADMIN_CONTACT.email)),
      h('p.small', L.reloadAfter),
      h('p.small', `GitHub: ${user.login || user.name || user.uid}`)));
  }
  const code = location.hash.slice(1).toUpperCase();
  if (code) return sessionView(code);
  dashboard();
}

// ---------- dashboard ----------
async function dashboard() {
  const L = t(uiLang);
  const index = await loadIndex();
  const catSel = h('select#cat', index.map((c) => h('option', { value: c.file }, c.title[uiLang])));
  const langSel = h('select#lang', h('option', { value: 'de' }, 'Deutsch'), h('option', { value: 'en' }, 'English'));
  const shuffleBox = h('input#shuffle', { type: 'checkbox' });
  const list = h('div.sessions', h('p', '…'));
  const adminBox = h('div');

  show(demoBanner(), topBar(),
    h('main.card',
      h('h2', L.newSession),
      h('form.row', {
        onsubmit: async (e) => {
          e.preventDefault();
          const cat = await loadCatalog(catSel.value);
          const code = await store.createSession({
            catalog: catSel.value, lang: langSel.value, shuffle: shuffleBox.checked ? cat.questions.length : 0,
          });
          location.hash = code;
        },
      },
        h('label', L.catalog, catSel),
        h('label', L.language, langSel),
        h('label.check', shuffleBox, L.shuffle),
        h('button.primary', { type: 'submit' }, L.create),
      ),
      h('h2', L.mySessions),
      list,
    ),
    adminBox,
  );

  const sessions = await store.listMySessions();
  list.replaceChildren(sessions.length ? h('table.list',
    h('tbody', sessions.map((s) => h('tr',
      h('td.mono', s.code),
      h('td', index.find((c) => c.file === s.catalog)?.title[uiLang] || s.catalog),
      h('td', s.lang.toUpperCase() + (s.order ? ` · ${L.shuffled}` : '')),
      h('td', s.createdAt ? new Date(s.createdAt).toLocaleString(uiLang) : ''),
      h('td', L.phase[s.state?.phase] || ''),
      h('td.right',
        h('a.button', { href: '#' + s.code }, L.resume), ' ',
        h('button.danger', {
          type: 'button',
          onclick: async () => {
            if (!confirm(L.deleteConfirm(s.code))) return;
            await store.deleteSession(s.code);
            dashboard();
          },
        }, L.delete)),
    )))) : h('p', L.noSessions));

  if (user.isAdmin) adminPanel(adminBox, index);
}

function adminPanel(box, index) {
  const L = t(uiLang);
  const reqs = h('div');
  const trainers = h('div');
  const all = h('div', h('p', '…'));
  let trainerNames = {};
  box.replaceChildren(h('main.card', h('h2', L.requests), reqs, h('h2', L.trainers), trainers, h('h2', L.allSessions), all));
  stopSession.push(store.watchRequests((r) => {
    const e = Object.entries(r);
    reqs.replaceChildren(e.length ? h('table.list', h('tbody', e.map(([uid, q]) => h('tr',
      h('td', q.name || ''), h('td.mono', q.login ? '@' + q.login : ''), h('td', q.email || ''),
      h('td.right',
        h('button.primary', { type: 'button', onclick: () => store.approve(uid, q) }, L.approve), ' ',
        h('button.danger', { type: 'button', onclick: () => store.reject(uid) }, L.reject)),
    )))) : h('p.small', '–'));
  }));
  stopSession.push(store.watchTrainers((tr) => {
    trainerNames = tr;
    trainers.replaceChildren(h('table.list', h('tbody', Object.entries(tr).map(([uid, x]) => h('tr',
      h('td', x.name || ''), h('td.mono', x.login ? '@' + x.login : ''),
      h('td.right', uid === user.uid ? '' : h('button.danger', {
        type: 'button',
        onclick: () => confirm(L.removeTrainerConfirm(x.name || '@' + x.login)) && store.removeTrainer(uid),
      }, L.delete)),
    )))));
  }));
  allSessions(all, index, () => trainerNames);
}

// admin: sessions of all trainers, delete single ones or all older than n days
async function allSessions(box, index, names) {
  const L = t(uiLang);
  let sessions;
  try {
    sessions = await store.listAllSessions();
  } catch (e) {
    console.error(e);
    box.replaceChildren(h('p.error', L.rulesOutdated));
    return;
  }
  const reload = () => route(); // re-renders the overview, "my sessions" included
  const days = h('input#days', { type: 'number', min: 1, value: 30, style: 'width:5em' });
  const purge = async () => {
    const limit = Date.now() - Number(days.value) * 86400000;
    const old = sessions.filter((s) => (s.createdAt || 0) < limit);
    if (!old.length) return alert(L.nothingOld);
    if (!confirm(L.purgeConfirm(old.length, days.value))) return;
    for (const s of old) await store.deleteSession(s.code);
    reload();
  };
  const ownerName = (uid) => {
    const n = names()[uid];
    return n ? n.name || '@' + n.login : uid === user.uid ? user.name : uid.slice(0, 8) + '…';
  };
  box.replaceChildren(
    h('form.row', { onsubmit: (e) => { e.preventDefault(); purge(); } },
      h('label', L.olderThan, days),
      h('button.danger', { type: 'submit' }, L.purge)),
    sessions.length ? h('table.list', h('tbody', sessions.map((s) => h('tr',
      h('td.mono', s.code),
      h('td', ownerName(s.owner)),
      h('td', index.find((c) => c.file === s.catalog)?.title[uiLang] || s.catalog),
      h('td', s.lang.toUpperCase()),
      h('td', s.createdAt ? new Date(s.createdAt).toLocaleString(uiLang) : ''),
      h('td', L.phase[s.state?.phase] || ''),
      h('td.right', h('button.danger', {
        type: 'button',
        onclick: async () => {
          if (!confirm(L.deleteConfirm(s.code))) return;
          await store.deleteSession(s.code);
          reload();
        },
      }, L.delete)),
    )))) : h('p', L.noSessions),
  );
}

// ---------- running session ----------
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

async function sessionView(code) {
  const session = await store.getSession(code);
  if (!session || session.owner !== store.uid) {
    location.hash = '';
    return;
  }
  const lang = session.lang;
  const catalog = await loadCatalog(session.catalog);
  const order = session.order || catalog.questions.map((_, k) => k);
  const questions = order.map((k) => catalog.questions[k]); // in the order of this session
  let state = session.state;
  let presence = {};
  let answers = {};

  stopSession.push(
    store.watchSession(code, (s) => { if (s) { state = s.state; render(); } }),
    store.watchPresence(code, (p) => { presence = p; render(); }),
    store.watchAllAnswers(code, (a) => { answers = a; render(); }),
  );

  const setState = (s) => store.setState(code, clean(s));
  const answersFor = (i) => {
    const q = questions[i];
    const out = {};
    for (const [uid, a] of Object.entries(answers)) if (a?.[qkey(i)]) out[uid] = decodeAnswer(q, a[qkey(i)].a);
    return out;
  };
  const goTo = (i, extra = {}) => {
    if (i < questions.length) setState({ ...state, ...extra, phase: 'answering', index: i, qkey: qkey(i), resume: null });
    else setState({ ...state, ...extra, phase: 'finished', resume: null });
  };
  const actions = {
    start: () => goTo(0),
    reveal: () => setState({ ...state, phase: 'revealed' }),
    next: () => goTo(state.index + 1),
    skip: () => goTo(state.index + 1, { skipped: { ...(state.skipped || {}), [qkey(state.index)]: true } }),
    pause: () => setState({ ...state, phase: 'paused', resume: state.phase }),
    cont: () => setState({ ...state, phase: state.resume || 'answering', resume: null }),
    finish: () => {
      if (!confirm(t(lang).finishConfirm)) return;
      const open = state.phase === 'answering' || (state.phase === 'paused' && state.resume === 'answering');
      setState({ ...state, phase: 'finished', index: open ? state.index - 1 : state.index, resume: null });
    },
  };

  function render() {
    const L = t(lang);
    const nConnected = Object.keys(presence).length;
    const btn = (label, fn, cls = '') => h('button' + cls, { type: 'button', onclick: fn }, label);
    const bar = topBar([
      h('span.code', code),
      h('span.count', L.connected(nConnected)),
      h('a.small', { href: '#' }, L.back),
      h('button.link', { type: 'button', onclick: toggleFullscreen }, document.fullscreenElement ? L.fullscreenOff : L.fullscreen),
    ], lang);
    const phase = state.phase;

    if (phase === 'lobby') {
      const url = joinUrl(code);
      return show(demoBanner(lang), bar, h('main.card.lobby',
        h('h1', catalog.title[lang]),
        h('div.joinbox',
          qrSvg(url),
          h('div',
            h('p', L.joinAt),
            h('p.url', h('a', { href: url, target: '_blank' }, url)),
            h('p.bigcode', code),
            h('p.counter', L.connected(nConnected)),
          )),
        h('div.actions', btn(L.start, actions.start, '.primary')),
      ));
    }
    if (phase === 'paused') {
      return show(demoBanner(lang), bar, h('main.card.center',
        h('h1.pause', L.pauseTitle),
        h('p', L.pauseText),
        h('div.actions', btn(L.continue, actions.cont, '.primary')),
      ));
    }
    if (phase === 'finished') {
      return show(demoBanner(lang), bar, summary(lang));
    }

    const i = state.index;
    const q = questions[i];
    const given = answersFor(i);
    const nGiven = Object.keys(given).length;
    const card = h('main.card.beamer', questionHeader(q, i, questions.length, lang), questionText(q, lang));
    const last = i === questions.length - 1;
    const corner = h('div.corner', qrSvg(joinUrl(code)), h('span.mono', code));

    if (phase === 'answering') {
      card.append(questionBody(q, lang, 'show'));
      card.append(h('div.counterline', h('span.counter', L.submittedCount(nGiven)), h('span.small', L.connected(nConnected))));
      card.append(h('div.actions',
        btn(L.reveal, actions.reveal, '.primary'),
        btn(L.skip, actions.skip),
        btn(L.pause, actions.pause),
        btn(L.finish, actions.finish, '.danger'),
      ));
    } else if (phase === 'revealed') {
      const stats = answerStats(q, given);
      card.append(questionBody(q, lang, 'stats', { stats }));
      card.append(h('div.counterline', h('span.counter', L.votes(stats.n)), stats.n ? null : h('span.small', L.noVotes)));
      card.append(h('div.actions',
        btn(last ? L.toResults : L.next, actions.next, '.primary'),
        btn(L.pause, actions.pause),
        last ? null : btn(L.finish, actions.finish, '.danger'),
      ));
    }
    show(demoBanner(lang), bar, h('div.withcorner', card, corner));
    fitToScreen(card);
  }
  const refit = () => {
    const card = app.querySelector('.card.beamer');
    if (card) fitToScreen(card);
  };
  window.addEventListener('resize', refit);
  stopSession.push(() => window.removeEventListener('resize', refit));
  document.addEventListener('fullscreenchange', render);
  stopSession.push(() => document.removeEventListener('fullscreenchange', render));

  function summary(lang) {
    const L = t(lang);
    const asked = askedIndices(state, questions.length);
    const max = asked.reduce((s, i) => s + questions[i].points, 0);
    const people = Object.entries(answers)
      .filter(([, a]) => asked.some((i) => a?.[qkey(i)]))
      .map(([, a]) => asked.reduce((s, i) => {
        const raw = a[qkey(i)];
        return s + (raw ? scoreQuestion(questions[i], decodeAnswer(questions[i], raw.a)) : 0);
      }, 0));
    if (!people.length || !max) {
      return h('main.card', h('h1', L.summaryTitle), h('p', L.noResults));
    }
    const pcts = people.map((p) => (p / max) * 100);
    const avg = people.reduce((s, x) => s + x, 0) / people.length;
    const passRate = (pcts.filter((p) => p >= PASS_PERCENT).length / people.length) * 100;

    // histogram in 10 % steps
    const buckets = Array(10).fill(0);
    pcts.forEach((p) => buckets[Math.min(9, Math.floor(p / 10))]++);
    const top = Math.max(...buckets);
    const hist = h('div.hist', buckets.map((n, b) => h('div.hcol' + (b * 10 >= PASS_PERCENT ? '.passzone' : ''),
      h('span.hn', n || ''),
      h('div.hbar', { style: `height:${top ? (n / top) * 100 : 0}%` }),
      h('span.hl', `${b * 10}–${b === 9 ? 100 : b * 10 + 9}`),
    )));

    // success rate per question: average share of the points among those who answered
    const perQ = asked.map((i) => {
      const q = questions[i];
      const given = Object.values(answersFor(i));
      const rate = given.length ? given.reduce((s, a) => s + scoreQuestion(q, a) / q.points, 0) / given.length : 0;
      return { i, q, rate, n: given.length };
    }).sort((a, b) => a.rate - b.rate);

    return h('main.card',
      h('h1', L.summaryTitle),
      h('div.kpis',
        h('div.kpi', h('span.kv', people.length), h('span.kl', L.sumParticipants)),
        h('div.kpi', h('span.kv', `${fmt(avg, lang)} / ${fmt(max, lang)}`), h('span.kl', `${L.sumAverage} (${fmt((avg / max) * 100, lang)} %)`)),
        h('div.kpi', h('span.kv', `${fmt(passRate, lang)} %`), h('span.kl', L.sumPassRate)),
      ),
      h('h3', L.histogram),
      hist,
      h('h3', L.hardest),
      h('table.list.rates', h('tbody', perQ.map(({ i, q, rate, n }) => h('tr',
        h('td.mono', i + 1),
        h('td.qshort', q.text[lang], h('span.qid', ` ${q.id}`)),
        h('td.ratecell', meter(Math.round(rate * 100), `${Math.round(rate * 100)} % · ${L.votes(n)}`, rate >= PASS_PERCENT / 100)),
      )))),
    );
  }

  render();
}

main().catch((e) => {
  console.error(e);
  show(h('main.card.narrow', h('p.error', String(e.message || e))));
});
