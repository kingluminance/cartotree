/**
 * atlas peek — show only the lines of a file that matter for some words.
 * A compressed replacement for `grep -n` when an agent verifies a candidate file.
 */
const { readSafe } = require('./files');
const { splitWords } = require('./locate');

function peek(root, file, words, { max = 10 } = {}) {
  const text = readSafe(root, file, 2_000_000);
  if (!text) return { file, error: 'cannot read file' };
  const q = [...new Set(splitWords(words.join(' ')))];
  const lines = text.split('\n');
  const hits = [];
  lines.forEach((ln, i) => {
    if (ln.length > 400) return;
    const ws = new Set(splitWords(ln));
    const m = q.filter(w => ws.has(w));
    if (m.length) hits.push({ line: i + 1, score: m.length, code: ln.trim().slice(0, 120) });
  });
  const top = hits.sort((a, b) => b.score - a.score || a.line - b.line).slice(0, max).sort((a, b) => a.line - b.line);
  return { file, totalLines: lines.length, matchedLines: hits.length, lines: top };
}

module.exports = { peek };
