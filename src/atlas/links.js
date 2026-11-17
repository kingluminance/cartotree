/**
 * atlas links — a compact "connection map" for a file or symbol, so an agent
 * can follow a call chain without reading whole files.
 */
const { listSourceFiles, readSafe } = require('./files');
const { parseExportsFromText, parseImports } = require('./symbols');
const { readHistory, coChanges, recentChanges } = require('./git');

function buildGraph(root) {
  const files = listSourceFiles(root, { includeTests: true });
  const set = new Set(files);
  const imports = new Map();
  const importers = new Map();
  const exportsOf = new Map();
  for (const f of files) {
    const t = readSafe(root, f);
    exportsOf.set(f, parseExportsFromText(t));
    const im = parseImports(t, f, set);
    imports.set(f, im);
    for (const g of im) {
      if (!importers.has(g)) importers.set(g, []);
      importers.get(g).push(f);
    }
  }
  return { files, set, imports, importers, exportsOf };
}

function lineOf(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

/** Where a symbol is defined and where it is called (file:line + trimmed code). */
function candidateFiles(root, graph, name) {
  try {
    const out = require('child_process').execSync(`git grep -l -w -- ${JSON.stringify(name)}`, { cwd: root, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return out.split('\n').filter(f => graph.set.has(f));
  } catch (e) {
    return e.status === 1 ? [] : graph.files; // 1 = no match; otherwise not git -> scan all
  }
}

function symbolLinks(graph, name, { maxUses = 12, root = process.cwd() } = {}) {
  const defs = [];
  const uses = [];
  const defRe = new RegExp(`(?:function\\*?|class|const|let|var|type|interface|enum)\\s+${name}\\b`);
  const useRe = new RegExp(`\\b${name}\\s*[(<.]`, 'g');
  for (const f of candidateFiles(root, graph, name)) {
    const t = readSafe(root, f);
    if (!t.includes(name)) continue;
    const d = defRe.exec(t);
    if (d) defs.push({ file: f, line: lineOf(t, d.index), exported: graph.exportsOf.get(f).includes(name) });
    let m;
    while ((m = useRe.exec(t)) && uses.length < maxUses * 4) {
      if (d && m.index >= d.index && m.index <= d.index + d[0].length + 2) continue;
      const ln = lineOf(t, m.index);
      const code = t.split('\n')[ln - 1].trim().slice(0, 90);
      uses.push({ file: f, line: ln, code });
    }
  }
  const byFile = new Map();
  for (const u of uses) {
    if (!byFile.has(u.file)) byFile.set(u.file, []);
    byFile.get(u.file).push(u);
  }
  return {
    symbol: name,
    definedIn: defs,
    usedIn: [...byFile.entries()].slice(0, maxUses).map(([file, us]) => ({ file, count: us.length, first: `${us[0].line}: ${us[0].code}` })),
    moreFiles: Math.max(0, byFile.size - maxUses),
  };
}

/** What a file pulls in, who depends on it, and how it tends to change. */
function fileLinks(graph, root, file, { history = null } = {}) {
  const hist = history || readHistory(root);
  return {
    file,
    exports: graph.exportsOf.get(file) || [],
    imports: graph.imports.get(file) || [],
    importedBy: (graph.importers.get(file) || []).slice(0, 15),
    importedByCount: (graph.importers.get(file) || []).length,
    changedWith: coChanges(hist, file),
    recent: recentChanges(hist, file),
  };
}

module.exports = { buildGraph, symbolLinks, fileLinks };
