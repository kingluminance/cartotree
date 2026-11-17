/**
 * Lightweight, regex-based symbol facts (no TypeScript compiler):
 * exports, relative imports, and call sites.
 */
const path = require('path');
const { stripComments } = require('../exports');

const EXPORT_RE = /export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|abstract\s+class|type|interface|enum)\s+(\w+)/g;
const EXPORT_LIST_RE = /export\s*\{([^}]+)\}/g;
const IMPORT_RE = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|require\s*\(\s*|export\s[^'"]*?from\s*)['"]([^'"]+)['"]/g;

function parseExportsFromText(text) {
  const src = stripComments(text);
  const out = new Set();
  let m;
  while ((m = EXPORT_RE.exec(src))) out.add(m[1]);
  while ((m = EXPORT_LIST_RE.exec(src))) {
    m[1].split(',').map(s => s.trim().split(/\s+as\s+/).pop().trim()).filter(s => /^\w+$/.test(s)).forEach(n => out.add(n));
  }
  return [...out];
}

/** Relative imports resolved against the known file set. */
function parseImports(text, fromFile, fileSet) {
  const out = new Set();
  let m;
  const src = stripComments(text);
  while ((m = IMPORT_RE.exec(src))) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
    const stem = base.replace(/\.(m|c)?js$/, '');
    const cands = [base, ...['.ts', '.tsx', '.js', '.jsx', '.mjs'].map(e => stem + e),
      ...['index.ts', 'index.tsx', 'index.js'].map(i => `${base}/${i}`)];
    const hit = cands.find(c => fileSet.has(c));
    if (hit && hit !== fromFile) out.add(hit);
  }
  return [...out];
}

module.exports = { parseExportsFromText, parseImports };
