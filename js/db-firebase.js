// Firebase backend: Realtime Database + Authentication (anonymous for participants, GitHub for trainers).
import {
  initializeApp, getAuth, signInAnonymously, signInWithPopup, GithubAuthProvider, getAdditionalUserInfo,
  signOut, onAuthStateChanged, connectAuthEmulator, getDatabase, ref, get, set, update, remove, onValue,
  onDisconnect, serverTimestamp, connectDatabaseEmulator, query, orderByChild, equalTo,
} from './vendor/firebase.mjs';

let app, auth, rtdb;
function init(config) {
  if (app) return;
  app = initializeApp(config);
  auth = getAuth(app);
  rtdb = getDatabase(app);
  // ?emu=1 uses the local Firebase emulators (for development and tests)
  if (new URLSearchParams(location.search).has('emu')) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(rtdb, '127.0.0.1', 9000);
  }
}

function makeDb(uid) {
  return {
    demo: false,
    uid,
    now: () => serverTimestamp(),
    async get(path) {
      return (await get(ref(rtdb, path))).val();
    },
    set: (path, value) => set(ref(rtdb, path), value),
    update: (path, obj) => update(ref(rtdb, path), obj),
    remove: (path) => remove(ref(rtdb, path)),
    watch(path, cb, onError) {
      return onValue(ref(rtdb, path), (snap) => cb(snap.val()), (e) => (onError ? onError(e) : console.error(path, e)));
    },
    async queryByChild(path, child, value) {
      return (await get(query(ref(rtdb, path), orderByChild(child), equalTo(value)))).val() || {};
    },
    presence(path) {
      const r = ref(rtdb, path);
      const conn = ref(rtdb, '.info/connected');
      const stop = onValue(conn, async (snap) => {
        if (snap.val() !== true) return;
        await onDisconnect(r).remove();
        await set(r, true);
      });
      return () => {
        stop();
        remove(r);
      };
    },
  };
}

// Participants: anonymous account, kept by the browser, so a reload keeps the same identity.
export async function createFirebaseDb(config) {
  init(config);
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  return makeDb(auth.currentUser.uid);
}

// Trainers: GitHub sign-in. Unknown GitHub accounts leave a request that an admin approves.
export function createFirebaseAuth(config) {
  init(config);
  let lastLogin = null;
  return {
    demo: false,
    onChange(cb) {
      return onAuthStateChanged(auth, async (user) => {
        if (!user || user.isAnonymous) return cb(null);
        const gh = user.providerData.find((p) => p.providerId === 'github.com') || {};
        const info = {
          uid: user.uid,
          name: user.displayName || gh.displayName || '',
          login: lastLogin || user.reloadUserInfo?.screenName || '',
          email: user.email || gh.email || '',
        };
        const [trainer, admin] = await Promise.all([
          get(ref(rtdb, `trainers/${user.uid}`)).then((s) => s.val()).catch(() => null),
          get(ref(rtdb, `admins/${user.uid}`)).then((s) => s.val()).catch(() => null),
        ]);
        info.isTrainer = !!trainer;
        info.isAdmin = admin === true;
        if (!info.isTrainer) {
          await set(ref(rtdb, `trainerRequests/${user.uid}`), {
            name: info.name, login: info.login, email: info.email, at: serverTimestamp(),
          }).catch((e) => console.error('request', e));
        }
        cb(info);
      });
    },
    async signIn() {
      const res = await signInWithPopup(auth, new GithubAuthProvider());
      lastLogin = getAdditionalUserInfo(res)?.username || null;
    },
    signOut: () => signOut(auth),
    db: () => makeDb(auth.currentUser.uid),
  };
}
