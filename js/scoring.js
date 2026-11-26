// Scoring rules of the iSAQB CPSA-F examination (Prüfungsregeln, "Arten von Fragen").
// A question never scores below 0; negative points are not carried over to other questions.
//
// Answer formats:
//   A, P: array of selected option indices, e.g. [0, 2]
//   K:    array with one entry per row: 0 or 1 (index of the chosen category) or null (row left empty)

export function scoreQuestion(q, answer) {
  if (!answer) return 0;
  switch (q.type) {
    case 'A': {
      // exactly one cross, and it must be the correct one
      if (answer.length !== 1) return 0;
      return q.options[answer[0]]?.correct ? q.points : 0;
    }
    case 'P': {
      // more crosses than required -> 0; each correct cross +1/n, each wrong cross -1/n
      if (answer.length > q.pick) return 0;
      const net = answer.reduce((s, i) => s + (q.options[i]?.correct ? 1 : -1), 0);
      return Math.max(0, (net * q.points) / q.pick);
    }
    case 'K': {
      // each row: correct +1/n, wrong -1/n, empty 0
      const n = q.rows.length;
      const net = q.rows.reduce((s, row, i) => {
        const a = answer[i];
        if (a === null || a === undefined) return s;
        return s + (a === row.answer ? 1 : -1);
      }, 0);
      return Math.max(0, (net * q.points) / n);
    }
    default:
      throw new Error(`Unknown question type: ${q.type}`);
  }
}

export function maxPoints(questions) {
  return questions.reduce((s, q) => s + q.points, 0);
}

export function correctAnswer(q) {
  if (q.type === 'K') return q.rows.map((r) => r.answer);
  return q.options.flatMap((o, i) => (o.correct ? [i] : []));
}

// Answers are stored as short strings:
//   A, P: selected option indices, comma-separated ("0,2"; "" = nothing selected)
//   K:    one character per row: "0", "1" or "-" for an empty row ("01-0")
export function encodeAnswer(q, answer) {
  if (q.type === 'K') return answer.map((a) => (a === null || a === undefined ? '-' : String(a))).join('');
  return [...answer].sort((a, b) => a - b).join(',');
}

export function decodeAnswer(q, s) {
  if (s === null || s === undefined) return null;
  if (q.type === 'K') return [...s].map((c) => (c === '-' ? null : Number(c)));
  return s === '' ? [] : s.split(',').map(Number);
}
