// Chooses the backend: Firebase if configured, otherwise (or with ?demo) the demo backend.
import { firebaseConfig } from './config.js';
import { createLocalDb, createLocalAuth } from './db-local.js';

export function isDemo() {
  const p = new URLSearchParams(location.search);
  return !firebaseConfig || p.has('demo');
}

// for participants
export async function openDb() {
  if (isDemo()) return createLocalDb();
  const { createFirebaseDb } = await import('./db-firebase.js');
  return createFirebaseDb(firebaseConfig);
}

// for trainers
export async function openAuth() {
  if (isDemo()) {
    const auth = createLocalAuth();
    const db = createLocalDb();
    auth.db = () => db;
    return auth;
  }
  const { createFirebaseAuth } = await import('./db-firebase.js');
  return createFirebaseAuth(firebaseConfig);
}

// keeps ?demo / ?emu when building links
export function keepParams(url) {
  const p = new URLSearchParams(location.search);
  const u = new URL(url, location.href);
  for (const k of ['demo', 'emu']) if (p.has(k)) u.searchParams.set(k, p.get(k) || '1');
  return u.toString();
}
