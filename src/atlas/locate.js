/**
 * atlas locate — find where a task should start, without calling an LLM.
 * BM25 over each source file's path words, exported names and code identifiers,
 * optionally boosted by git change history (heat).
 */
const { listSourceFiles, readSafe } = require('./files');
const { parseExportsFromText } = require('./symbols');

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'when', 'into', 'that', 'this', 'are', 'not', 'fix', 'feat', 'refactor', 'perf', 'add', 'use', 'its', 'all', 'any', 'out', 'new']);

function splitWords(s) {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map(w => w.toLowerCase())
    .filter(w => w.length > 1 && !STOP.has(w));
}

function buildDoc(root, rel) {
  const text = readSafe(root, rel, 60000);
  const pathWords = splitWords(rel);
  const exportWords = splitWords(parseExportsFromText(text).join(' '));
  const idents = splitWords((text.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) || []).join(' ')).slice(0, 4000);
  // weights: path x4, exports x3, body x1
  return [].concat(pathWords, pathWords, pathWords, pathWords, exportWords, exportWords, exportWords, idents);
}

function buildIndex(root, opts = {}) {
  const files = listSourceFiles(root, opts);
  const docs = files.map(f => buildDoc(root, f));
  const tf = docs.map(d => {
    const m = new Map();
    for (const w of d) m.set(w, (m.get(w) || 0) + 1);
    return m;
  });
  const df = new Map();
  for (const m of tf) for (const w of m.keys()) df.set(w, (df.get(w) || 0) + 1);
  const avgLen = docs.reduce((a, d) => a + d.length, 0) / Math.max(1, docs.length);
  return { files, tf, df, lens: docs.map(d => d.length), avgLen, N: docs.length };
}

function search(index, query, { k = 10, heat = null, heatWeight = 0.15 } = {}) {
  const k1 = 1.5, b = 0.75;
  const q = [...new Set(splitWords(query))];
  const scores = index.files.map((file, i) => {
    let s = 0;
    const why = [];
    for (const w of q) {
      const f = index.tf[i].get(w);
      if (!f) continue;
      const n = index.df.get(w);
      const idf = Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
      const part = idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * index.lens[i] / index.avgLen));
      s += part;
      why.push([w, part]);
    }
    if (s > 0 && heat) s *= 1 + heatWeight * Math.log1p(heat.get(file) || 0);
    return { file, score: s, why };
  });
  return scores
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(x => ({
      file: x.file,
      score: +x.score.toFixed(2),
      matched: x.why.sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w),
    }));
}

module.exports = { buildIndex, search, splitWords };
