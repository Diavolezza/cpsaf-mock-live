// Demo backend: keeps the whole database in localStorage and syncs all tabs of this browser.
// Same small API as db-firebase.js. Every tab is a separate participant.
const KEY = 'cpsaf-demo-db';
const chan = 'BroadcastChannel' in self ? new BroadcastChannel(KEY) : null;
const watchers = new Set();

const parts = (path) => path.split('/').filter(Boolean);
const read = () => JSON.parse(localStorage.getItem(KEY) || '{}');
function getAt(tree, path) {
  let node = tree;
  for (const p of parts(path)) {
    if (node === null || typeof node !== 'object' || !(p in node)) return null;
    node = node[p];
  }
  return node ?? null;
}
function setAt(tree, path, value) {
  const ps = parts(path);
  let node = tree;
  ps.slice(0, -1).forEach((p) => {
    if (typeof node[p] !== 'object' || node[p] === null) node[p] = {};
    node = node[p];
  });
  const last = ps[ps.length - 1];
  if (value === null || value === undefined) delete node[last];
  else node[last] = JSON.parse(JSON.stringify(value));
}
function prune(node) {
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      prune(node[k]);
      if (node[k] && typeof node[k] === 'object' && !Object.keys(node[k]).length) delete node[k];
    }
  }
  return node;
}
function write(mutate) {
  const tree = read();
  mutate(tree);
  localStorage.setItem(KEY, JSON.stringify(prune(tree)));
  notify();
  chan?.postMessage('changed');
}
function notify() {
  const tree = read();
  for (const w of watchers) {
    const v = getAt(tree, w.path);
    const s = JSON.stringify(v);
    if (s !== w.last) {
      w.last = s;
      w.cb(v === null ? null : JSON.parse(s));
    }
  }
}
chan?.addEventListener('message', notify);
self.addEventListener('storage', (e) => e.key === KEY && notify());

function tabUid() {
  let uid = sessionStorage.getItem('cpsaf-demo-uid');
  if (!uid) {
    uid = 'demo-' + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('cpsaf-demo-uid', uid);
  }
  return uid;
}

export function createLocalDb() {
  const presences = new Set();
  const dropPresence = () => presences.forEach((p) => write((t) => setAt(t, p, null)));
  self.addEventListener('pagehide', dropPresence);
  return {
    demo: true,
    uid: tabUid(),
    now: () => Date.now(),
    async get(path) {
      return getAt(read(), path);
    },
    async set(path, value) {
      write((t) => setAt(t, path, value));
    },
    async update(path, obj) {
      write((t) => Object.entries(obj).forEach(([k, v]) => setAt(t, `${path}/${k}`, v)));
    },
    async remove(path) {
      write((t) => setAt(t, path, null));
    },
    watch(path, cb) {
      const w = { path, cb, last: undefined };
      watchers.add(w);
      queueMicrotask(notify);
      return () => watchers.delete(w);
    },
    async queryByChild(path, child, value) {
      const all = getAt(read(), path) || {};
      return Object.fromEntries(Object.entries(all).filter(([, v]) => v?.[child] === value));
    },
    presence(path) {
      presences.add(path);
      write((t) => setAt(t, path, true));
      // re-announce now and then in case another tab cleaned up
      const timer = setInterval(async () => {
        if (getAt(read(), path) !== true) write((t) => setAt(t, path, true));
      }, 5000);
      return () => {
        clearInterval(timer);
        presences.delete(path);
        write((t) => setAt(t, path, null));
      };
    },
  };
}

// Demo trainer: always "signed in", always admin.
export function createLocalAuth() {
  return {
    demo: true,
    onChange(cb) {
      queueMicrotask(() => cb({ uid: tabUid(), name: 'Demo', login: 'demo', isTrainer: true, isAdmin: false }));
      return () => {};
    },
    async signIn() {},
    async signOut() {},
  };
}
