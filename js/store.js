// Domain operations on top of the small database API (db-local.js / db-firebase.js).
//
// Data layout (same in Firebase and in demo mode):
//   sessions/{code}        { owner, catalog, lang, createdAt, state: { phase, index, qkey, skipped: {q3: true} } }
//   participants/{code}/{uid}  { joinedAt }
//   presence/{code}/{uid}      true while the participant's browser is connected
//   answers/{code}/{uid}/{qkey} { a: "0,2", t }   qkey = "q" + question index
//   trainers/{uid}, admins/{uid}, trainerRequests/{uid}
//
// phase: lobby -> answering -> revealed -> answering (next question) ... -> finished; paused at any time.

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const qkey = (index) => `q${index}`;

export function makeStore(db) {
  return {
    uid: db.uid,
    demo: db.demo,

    async createSession({ catalog, lang }) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
        if (await db.get(`sessions/${code}/owner`).catch(() => null)) continue;
        await db.set(`sessions/${code}`, {
          owner: db.uid, catalog, lang, createdAt: db.now(),
          state: { phase: 'lobby', index: 0, qkey: qkey(0) },
        });
        return code;
      }
      throw new Error('No free session code found');
    },
    getSession: (code) => db.get(`sessions/${code}`),
    watchSession: (code, cb, onError) => db.watch(`sessions/${code}`, cb, onError),
    setState: (code, state) => db.set(`sessions/${code}/state`, state),
    async listMySessions() {
      const all = await db.queryByChild('sessions', 'owner', db.uid);
      return Object.entries(all || {})
        .map(([code, s]) => ({ code, ...s }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },
    async deleteSession(code) {
      for (const p of ['answers', 'participants', 'presence']) await db.remove(`${p}/${code}`);
      await db.remove(`sessions/${code}`);
    },

    // participants
    async join(code) {
      const known = await db.get(`participants/${code}/${db.uid}`);
      if (!known) await db.set(`participants/${code}/${db.uid}`, { joinedAt: db.now() });
      return db.presence(`presence/${code}/${db.uid}`);
    },
    submitAnswer: (code, index, encoded) => db.set(`answers/${code}/${db.uid}/${qkey(index)}`, { a: encoded, t: db.now() }),
    watchMyAnswers: (code, cb) => db.watch(`answers/${code}/${db.uid}`, (v) => cb(v || {})),

    // trainer
    watchPresence: (code, cb) => db.watch(`presence/${code}`, (v) => cb(v || {})),
    watchParticipants: (code, cb) => db.watch(`participants/${code}`, (v) => cb(v || {})),
    watchAllAnswers: (code, cb) => db.watch(`answers/${code}`, (v) => cb(v || {})),

    // admin
    watchRequests: (cb) => db.watch('trainerRequests', (v) => cb(v || {})),
    watchTrainers: (cb) => db.watch('trainers', (v) => cb(v || {})),
    async approve(uid, req) {
      await db.set(`trainers/${uid}`, { name: req.name || '', login: req.login || '' });
      await db.remove(`trainerRequests/${uid}`);
    },
    reject: (uid) => db.remove(`trainerRequests/${uid}`),
    removeTrainer: (uid) => db.remove(`trainers/${uid}`),
  };
}

// Which question indices have been asked so far (not skipped). Used for the maximum points.
export function askedIndices(state, total) {
  const last = state.phase === 'finished' ? Math.min(state.index, total - 1) : state.index;
  const out = [];
  for (let i = 0; i <= last && i < total; i++) {
    if (state.skipped?.[qkey(i)]) continue;
    // the current question only counts once it has been revealed (or the exam is over)
    if (i === state.index && state.phase !== 'revealed' && state.phase !== 'finished'
        && !(state.phase === 'paused' && state.resume === 'revealed')) continue;
    out.push(i);
  }
  return out;
}
