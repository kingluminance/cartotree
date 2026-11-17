/**
 * atlas locate — find where a task should start, without calling an LLM.
 *
 * Scoring = BM25F over three fields of every source file:
 *   path    — folder and file name words (strongest signal)
 *   exports — exported symbol names
 *   body    — identifiers and words used in the code
 * plus light stemming, an optional neighbor boost over the import graph,
 * and an "ambiguous" flag when the top results are close.
 */
const { listSourceFiles, readSafe } = require('./files');
const { parseExportsFromText, parseImports } = require('./symbols');

const STOP = new Set(['in', 'on', 'of', 'to', 'an', 'as', 'at', 'by', 'is', 'it', 'or', 'be', 'if', 'so', 'do', 'we', 'up', 'no', 'its', 'the', 'and', 'for', 'with', 'from', 'when', 'into', 'that', 'this', 'are', 'not', 'fix', 'feat',
  'refactor', 'perf', 'add', 'use', 'its', 'all', 'any', 'out', 'new', 'get', 'set', 'make', 'only', 'also', 'via',
  'should', 'can', 'will', 'was', 'has', 'have', 'been', 'but', 'than', 'then', 'them', 'they', 'their', 'there',
  'instead', 'before', 'after', 'during', 'keep', 'let', 'more', 'less', 'one', 'two', 'too', 'does', 'don', 'isn']);

/** very light English stemmer: enough to merge locale/locales/localize, clean/cleanup/cleaning */
function stem(w) {
  if (w.length <= 4) return w;
  for (const suf of ['izations', 'ization', 'ations', 'ation', 'ings', 'ing', 'izes', 'ized', 'ize', 'ies', 'ers', 'er', 'es', 'ed', 's']) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) {
      const r = w.slice(0, -suf.length);
      // setting -> sett -> set, running -> runn -> run
      return /([bdgmnprt])\1$/.test(r) ? r.slice(0, -1) : r;
    }
  }
  return w;
}

function splitWords(s) {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map(w => w.toLowerCase())
    .filter(w => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w))
    .map(stem);
}

function counts(words) {
  const m = new Map();
  for (const w of words) m.set(w, (m.get(w) || 0) + 1);
  return m;
}

const FIELDS = ['path', 'exports', 'body', 'hist'];

function buildIndex(root, opts = {}) {
  const files = listSourceFiles(root, opts);
  const fileSet = new Set(files);
  const docs = [];
  const texts = [];
  for (const f of files) {
    const text = readSafe(root, f, 80000);
    texts.push(text);
    docs.push({
      path: counts(splitWords(f)),
      exports: counts(splitWords(parseExportsFromText(text).join(' '))),
      body: counts(splitWords((text.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) || []).slice(0, 6000).join(' '))),
    });
  }
  // hist: words from past commit messages that touched the file ("what this file has been about")
  const histWords = new Map();
  if (opts.history) {
    for (const c of opts.history.commits) {
      const ws = splitWords(c.subject.replace(/^\w+(\([^)]*\))?!?:\s*/, m => m.replace(/[()!:]/g, ' ')));
      for (const f of c.files) {
        if (!fileSet.has(f)) continue;
        if (!histWords.has(f)) histWords.set(f, []);
        const arr = histWords.get(f);
        if (arr.length < 3000) arr.push(...ws);
      }
    }
  }
  files.forEach((f, i) => { docs[i].hist = counts(histWords.get(f) || []); });
  if (opts.chunks) {
    // split code into top-level blocks (functions/classes/consts) so a match inside one function is not diluted by the whole file
    files.forEach((f, i) => {
      const lines = texts[i].split('\n');
      const chunks = [];
      let cur = [];
      const flush = () => { if (cur.length) { chunks.push(counts(splitWords((cur.join(' ').match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) || []).join(' ')))); cur = []; } };
      for (const ln of lines) {
        if ((/^(export\s|function\s|class\s|const\s|async\s|interface\s|type\s)/.test(ln) && cur.length > 5) || cur.length >= 80) flush();
        cur.push(ln);
      }
      flush();
      docs[i].chunks = chunks.map(c => { let len = 0; for (const v of c.values()) len += v; return { c, len }; });
    });
  }
  const df = new Map();
  const avgLen = {};
  for (const fld of FIELDS) {
    let total = 0;
    for (const d of docs) {
      let len = 0;
      for (const v of d[fld].values()) len += v;
      d[fld + 'Len'] = len;
      total += len;
    }
    avgLen[fld] = total / Math.max(1, docs.length);
  }
  for (const d of docs) {
    const seen = new Set([...d.path.keys(), ...d.exports.keys(), ...d.body.keys(), ...d.hist.keys()]);
    for (const w of seen) df.set(w, (df.get(w) || 0) + 1);
  }
  let neighbors = null;
  if (opts.graph) {
    neighbors = files.map(() => []);
    const pos = new Map(files.map((f, i) => [f, i]));
    files.forEach((f, i) => {
      for (const g of parseImports(texts[i], f, fileSet)) {
        const j = pos.get(g);
        if (j !== undefined) { neighbors[i].push(j); neighbors[j].push(i); }
      }
    });
  }
  return { root, files, docs, texts: opts.keepText ? texts : null, df, avgLen, N: docs.length, neighbors };
}

const DEFAULT_WEIGHTS = { path: 3.0, exports: 2.0, body: 1.0, hist: 1.5 };

function scoreAll(index, qWords, { weights = DEFAULT_WEIGHTS, k1 = 1.2, b = { path: 0.3, exports: 0.5, body: 0.75, hist: 0.5 } } = {}) {
  const idf = new Map(qWords.map(w => {
    const n = index.df.get(w) || 0;
    return [w, n ? Math.log(1 + (index.N - n + 0.5) / (n + 0.5)) : 0];
  }));
  return index.docs.map(d => {
    let s = 0;
    const hit = [];
    for (const w of qWords) {
      if (!idf.get(w)) continue;
      // BM25F: combine normalized term frequency across fields, then saturate once
      let tf = 0;
      for (const fld of FIELDS) {
        if (!weights[fld]) continue;
        const f = d[fld].get(w);
        if (!f) continue;
        tf += weights[fld] * f / (1 - b[fld] + b[fld] * d[fld + 'Len'] / (index.avgLen[fld] || 1));
      }
      if (!tf) continue;
      const part = idf.get(w) * tf * (k1 + 1) / (tf + k1);
      s += part;
      hit.push([w, part]);
    }
    return { s, hit };
  });
}

/** best single line of a file for the query words (evidence for the agent) */
function bestLines(text, qWords, n = 1) {
  if (!text) return [];
  const lines = text.split('\n');
  const scored = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.length > 300) continue;
    const ws = new Set(splitWords(ln));
    let sc = 0;
    for (const w of qWords) if (ws.has(w)) sc++;
    if (sc) scored.push({ line: i + 1, sc, code: ln.trim().slice(0, 100) });
  }
  return scored.sort((a, b) => b.sc - a.sc || a.line - b.line).slice(0, n)
    .sort((a, b) => a.line - b.line).map(({ line, code }) => ({ line, code }));
}

function search(index, query, opts = {}) {
  const { k = 10, heat = null, heatWeight = 0.15, graphWeight = 0.3, snippet = true } = opts;
  const qWords = [...new Set(splitWords(query))];
  const base = scoreAll(index, qWords, opts);
  if (opts.chunkWeight && index.docs[0] && index.docs[0].chunks) {
    const idf = w => { const n = index.df.get(w) || 0; return n ? Math.log(1 + (index.N - n + 0.5) / (n + 0.5)) : 0; };
    const qi = qWords.map(w => [w, idf(w)]).filter(x => x[1]);
    const avg = 60;
    base.forEach((x, i) => {
      if (!x.s) return;
      let best = 0;
      for (const ch of index.docs[i].chunks) {
        let sc = 0;
        for (const [w, wi] of qi) {
          const f = ch.c.get(w);
          if (f) sc += wi * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * ch.len / avg));
        }
        if (sc > best) best = sc;
      }
      x.s += opts.chunkWeight * best;
    });
  }
  let scores = base.map(x => x.s);
  if (index.neighbors && graphWeight) {
    // a file whose neighbours also match is more likely the right place
    scores = scores.map((s, i) => {
      if (!s) return 0;
      const nb = index.neighbors[i];
      if (!nb.length) return s;
      const top = nb.map(j => base[j].s).sort((a, c) => c - a).slice(0, 3);
      return s + graphWeight * top.reduce((a, c) => a + c, 0) / 3;
    });
  }
  if (heat) scores = scores.map((s, i) => s * (1 + heatWeight * Math.log1p(heat.get(index.files[i]) || 0)));
  const order = scores.map((s, i) => [s, i]).filter(x => x[0] > 0).sort((a, c) => c[0] - a[0]).slice(0, k);
  const { evidenceTop = 3, evidenceLines = 2 } = opts;
  const out = order.map(([s, i], rank) => ({
    file: index.files[i],
    score: +s.toFixed(2),
    matched: base[i].hit.sort((a, c) => c[1] - a[1]).slice(0, 4).map(([w]) => w),
    ...(snippet ? { evidence: bestLines(index.texts ? index.texts[i] : readSafe(index.root, index.files[i], 200000), qWords, rank < evidenceTop ? evidenceLines : 1) } : {}),
  }));
  if (out.length > 1) {
    const ratio = out[1].score / out[0].score;
    out.ambiguous = ratio > 0.85;
  }
  return out;
}

module.exports = { buildIndex, search, splitWords, stem };
