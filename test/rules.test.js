// Tests of database.rules.json against the Firebase emulator.
// Run with: npm run test:rules   (needs Java; starts the database emulator)
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, set, get, update, remove, query, orderByChild, equalTo, serverTimestamp } from 'firebase/database';

let env;
const CODE = 'ABCDE';
const github = { firebase: { sign_in_provider: 'github.com' } };
const anon = { firebase: { sign_in_provider: 'anonymous' } };
const db = (uid, token) => env.authenticatedContext(uid, token).database();
const answer = (a) => ({ a, t: serverTimestamp() });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cpsaf',
    database: { rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9000 },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), '/'), {
      admins: { boss: true },
      trainers: { boss: { name: 'Boss', login: 'boss' }, trainer: { name: 'T', login: 't' } },
      sessions: { [CODE]: { owner: 'trainer', catalog: 'x.yaml', lang: 'de', createdAt: 1, state: { phase: 'answering', index: 2, qkey: 'q2' } } },
    });
  });
});

test('trainer creates a session, a stranger cannot', async () => {
  const s = { owner: 'trainer', catalog: 'x.yaml', lang: 'de', createdAt: 1, state: { phase: 'lobby', index: 0, qkey: 'q0' } };
  await assertSucceeds(set(ref(db('trainer', github), 'sessions/NEW01'), s));
  await assertFails(set(ref(db('stranger', github), 'sessions/NEW02'), { ...s, owner: 'stranger' }));
  await assertFails(set(ref(db('trainer', github), 'sessions/NEW03'), { ...s, owner: 'boss' }));
});

test('only the owner changes the state', async () => {
  await assertSucceeds(set(ref(db('trainer', github), `sessions/${CODE}/state`), { phase: 'revealed', index: 2, qkey: 'q2' }));
  await assertFails(set(ref(db('boss', github), `sessions/${CODE}/state`), { phase: 'revealed', index: 2, qkey: 'q2' }));
  await assertFails(set(ref(db('p1', anon), `sessions/${CODE}/state`), { phase: 'finished', index: 2, qkey: 'q2' }));
});

test('participants read the session, list only their own', async () => {
  await assertSucceeds(get(ref(db('p1', anon), `sessions/${CODE}`)));
  await assertFails(get(ref(db('p1', anon), 'sessions')));
  await assertSucceeds(get(query(ref(db('trainer', github), 'sessions'), orderByChild('owner'), equalTo('trainer'))));
  await assertFails(get(query(ref(db('trainer', github), 'sessions'), orderByChild('owner'), equalTo('boss'))));
});

test('participant answers the open question exactly once', async () => {
  const p1 = db('p1', anon);
  await assertSucceeds(set(ref(p1, `answers/${CODE}/p1/q2`), answer('0,2')));
  await assertFails(set(ref(p1, `answers/${CODE}/p1/q2`), answer('1')));
  await assertFails(set(ref(p1, `answers/${CODE}/p1/q3`), answer('1')));
  await assertFails(set(ref(p1, `answers/${CODE}/p2/q2`), answer('1')));
});

test('no answers after the solution is shown', async () => {
  await env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database(), `sessions/${CODE}/state/phase`), 'revealed'));
  await assertFails(set(ref(db('p1', anon), `answers/${CODE}/p1/q2`), answer('0')));
});

test('participants see only their own answers, the trainer sees all', async () => {
  await assertSucceeds(set(ref(db('p1', anon), `answers/${CODE}/p1/q2`), answer('0')));
  await assertSucceeds(get(ref(db('p1', anon), `answers/${CODE}/p1`)));
  await assertFails(get(ref(db('p2', anon), `answers/${CODE}/p1`)));
  await assertFails(get(ref(db('p2', anon), `answers/${CODE}`)));
  await assertSucceeds(get(ref(db('trainer', github), `answers/${CODE}`)));
  await assertFails(get(ref(db('boss', github), `answers/${CODE}`)));
});

test('trainer cannot change answers, but can delete the session', async () => {
  await assertSucceeds(set(ref(db('p1', anon), `answers/${CODE}/p1/q2`), answer('0')));
  const t = db('trainer', github);
  await assertFails(set(ref(t, `answers/${CODE}/p1/q2`), answer('1')));
  await assertSucceeds(remove(ref(t, `answers/${CODE}`)));
  await assertSucceeds(remove(ref(t, `participants/${CODE}`)));
  await assertSucceeds(remove(ref(t, `presence/${CODE}`)));
  await assertSucceeds(remove(ref(t, `sessions/${CODE}`)));
});

test('presence and join', async () => {
  const p1 = db('p1', anon);
  await assertSucceeds(set(ref(p1, `participants/${CODE}/p1`), { joinedAt: 1 }));
  await assertSucceeds(set(ref(p1, `presence/${CODE}/p1`), true));
  await assertFails(set(ref(p1, `presence/${CODE}/p2`), true));
  await assertFails(set(ref(p1, `presence/NOPE1/p1`), true));
  await assertFails(get(ref(p1, `presence/${CODE}`)));
  await assertSucceeds(get(ref(db('trainer', github), `presence/${CODE}`)));
});

test('trainer requests and approval', async () => {
  await assertSucceeds(set(ref(db('newbie', github), 'trainerRequests/newbie'), { name: 'N', login: 'n', email: '', at: serverTimestamp() }));
  await assertFails(set(ref(db('anon1', anon), 'trainerRequests/anon1'), { name: 'A', login: '' }));
  await assertFails(get(ref(db('newbie', github), 'trainerRequests')));
  const boss = db('boss', github);
  await assertSucceeds(get(ref(boss, 'trainerRequests')));
  await assertSucceeds(set(ref(boss, 'trainers/newbie'), { name: 'N', login: 'n' }));
  await assertSucceeds(remove(ref(boss, 'trainerRequests/newbie')));
  await assertFails(set(ref(db('trainer', github), 'trainers/other'), { name: 'O', login: 'o' }));
  await assertFails(set(ref(db('newbie', github), 'admins/newbie'), true));
});
