// Small line diff for "what did this save change". Output is a unified-style text:
// lines start with '+', '-' or ' ', hunks are separated by '@@'. Large inputs fall back to a summary.

export function lineDiff(before, after, context = 2) {
  const a = before.split('\n'), b = after.split('\n');
  if (a.length * b.length > 4e6) return {added: b.length, removed: a.length, text: ''};
  // Trim common prefix and suffix, then LCS on the middle.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const x = a.slice(start, endA), y = b.slice(start, endB);
  const table = Array.from({length: x.length + 1}, () => new Uint32Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) table[i][j] = x[i] === y[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const ops = [];
  for (let k = 0; k < start; k++) ops.push([' ', a[k]]);
  let i = 0, j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) { ops.push([' ', x[i]]); i++; j++; }
    else if (j < y.length && (i === x.length || table[i][j + 1] >= table[i + 1][j])) { ops.push(['+', y[j]]); j++; }
    else { ops.push(['-', x[i]]); i++; }
  }
  for (let k = endA; k < a.length; k++) ops.push([' ', a[k]]);
  let added = 0, removed = 0;
  const keep = new Uint8Array(ops.length);
  ops.forEach(([op], n) => {
    if (op === ' ') return;
    op === '+' ? added++ : removed++;
    for (let k = Math.max(0, n - context); k <= Math.min(ops.length - 1, n + context); k++) keep[k] = 1;
  });
  const lines = [];
  let gap = false;
  ops.forEach(([op, line], n) => {
    if (!keep[n]) { gap = true; return; }
    if (gap && lines.length) lines.push('@@');
    gap = false;
    lines.push(op + line);
  });
  return {added, removed, text: lines.slice(0, 400).join('\n')};
}
