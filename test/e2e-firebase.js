// End-to-end test of the real Firebase code path against the local emulators.
// Run with: npm run test:e2e   (needs Java and a Playwright Chromium: npx playwright install chromium)
// Starts a static web server, a trainer (GitHub login via the emulator) and two anonymous participants.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 8765;
const DB = 'http://127.0.0.1:9000';
const NS = 'demo-cpsaf-default-rtdb';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.yaml': 'text/yaml' };

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const body = await readFile(join(ROOT, path === '/' ? 'index.html' : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(PORT);

// database access as admin (bypasses the rules)
async function dbAdmin(method, path, body) {
  const r = await fetch(`${DB}/${path}.json?ns=${NS}`, {
    method, headers: { Authorization: 'Bearer owner' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(r.ok, `${method} ${path}: ${r.status}`);
  return r.json();
}

const base = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch();
const errors = [];
const watch = (page, name) => {
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('favicon') && errors.push(`${name}: ${m.text()}`));
};
const step = (s) => console.log('·', s);

try {
  // --- trainer signs in with GitHub (emulator popup) ---
  const tctx = await browser.newContext();
  const tr = await tctx.newPage();
  watch(tr, 'trainer');
  await tr.goto(`${base}/trainer.html?emu=1`);
  const [popup] = await Promise.all([tr.waitForEvent('popup'), tr.click('main button.primary')]);
  await popup.waitForLoadState();
  if (await popup.locator('#add-account-button').isVisible().catch(() => false)) await popup.click('#add-account-button');
  await popup.click('#autogen-button');
  await popup.click('#sign-in');
  step('GitHub sign-in done');

  // not a trainer yet -> request exists; make this account admin + trainer by hand
  await tr.waitForSelector('text=/not a trainer yet|noch nicht als Trainer/');
  const requests = await dbAdmin('GET', 'trainerRequests');
  const uid = Object.keys(requests)[0];
  assert.ok(uid, 'trainer request written');
  await dbAdmin('PUT', `admins/${uid}`, true);
  await dbAdmin('PUT', `trainers/${uid}`, { name: 'Test', login: 'test' });
  await dbAdmin('DELETE', `trainerRequests/${uid}`);
  await tr.reload();
  await tr.waitForSelector('form.row');
  step('trainer dashboard');

  // --- create an English session ---
  await tr.selectOption('#lang', 'en');
  await tr.click('form.row button.primary');
  await tr.waitForSelector('.bigcode');
  const code = (await tr.innerText('.bigcode')).trim();
  const joinUrl = await tr.getAttribute('.url a', 'href');
  assert.match(joinUrl, /emu=1/);
  step(`session ${code}`);

  // --- two participants in separate browser contexts (separate anonymous accounts) ---
  const ps = [];
  for (let i = 0; i < 2; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    watch(p, `p${i}`);
    await p.goto(joinUrl);
    await p.waitForSelector('text=Starting soon');
    ps.push(p);
  }
  await tr.waitForSelector('text=2 connected');
  step('participants joined');

  // Q1 (A, correct = c): p0 correct, p1 wrong
  await tr.getByRole('button', { name: 'Start mock exam', exact: true }).click();
  const answer = async (p, nth) => {
    await p.waitForSelector('ol.options');
    for (const n of nth) await p.click(`ol.options li:nth-child(${n}) button`);
    await p.getByRole('button', { name: 'Submit answer', exact: true }).click();
    await p.getByRole('button', { name: 'Yes, submit', exact: true }).click();
    await p.waitForSelector('text=Submitted');
  };
  await answer(ps[0], [3]);
  await answer(ps[1], [1]);
  await tr.waitForSelector('text=2 submitted');
  await tr.getByRole('button', { name: 'Show solution', exact: true }).click();
  await tr.waitForSelector('.bar');
  assert.match(await ps[0].innerText('.status'), /1 of 1/);
  assert.match(await ps[1].innerText('.status'), /0 of 1/);
  step('question 1 scored');

  // a late answer is refused by the rules
  const refused = await ps[1].evaluate(async () => {
    const m = await import('./js/vendor/firebase.mjs');
    try {
      const db = m.getDatabase();
      const uid = (await import('./js/vendor/firebase.mjs')).getAuth().currentUser.uid;
      await m.set(m.ref(db, `answers/${new URLSearchParams(location.search).get('s')}/${uid}/q0`), { a: '2', t: m.serverTimestamp() });
      return false;
    } catch {
      return true;
    }
  });
  assert.ok(refused, 'rules must refuse a second answer');

  // Q2 skipped, Q3 (P pick 4, correct c,e,f,g): p0 all correct; pause/reload in between
  await tr.getByRole('button', { name: 'Next question', exact: true }).click();
  await tr.waitForSelector('text=Question 2 of 38');
  await tr.getByRole('button', { name: 'Skip question', exact: true }).click();
  await tr.waitForSelector('text=Question 3 of 38');
  await answer(ps[0], [3, 5, 6, 7]);
  await tr.getByRole('button', { name: 'Break', exact: true }).click();
  await ps[1].waitForSelector('h1.pause');
  await ps[1].reload();
  await ps[1].waitForSelector('h1.pause');
  await tr.getByRole('button', { name: 'Continue', exact: true }).click();
  await ps[0].waitForSelector('text=Submitted');
  await tr.getByRole('button', { name: 'Show solution', exact: true }).click();
  await ps[0].waitForSelector('text=Your points');
  assert.match(await ps[1].innerText('.status'), /Not submitted/);
  step('pause, skip, question 3');

  // finish -> results
  tr.on('dialog', (d) => d.accept());
  await tr.getByRole('button', { name: 'Finish', exact: true }).click();
  await tr.waitForSelector('.kpis');
  await ps[0].waitForSelector('.percent');
  assert.match(await ps[0].innerText('.result'), /3 of 3 points/);
  assert.match(await ps[1].innerText('.result'), /0 of 3 points/);
  step('results');

  // dashboard: list and delete
  await tr.goto(`${base}/trainer.html?emu=1`);
  await tr.waitForSelector(`text=${code}`);
  await tr.click(`tr:has-text("${code}") button.danger`);
  await tr.waitForSelector('text=No sessions yet');
  assert.equal(await dbAdmin('GET', `answers/${code}`), null);
  step('session deleted');

  assert.deepEqual(errors.filter((e) => !/PERMISSION_DENIED|permission_denied/.test(e)), []);
  console.log('E2E OK');
} finally {
  await browser.close();
  server.close();
}
