/**
 * cartotree MCP server (stdio).
 * Keeps the index in memory, so after the first call every lookup is a few milliseconds.
 *
 * Tools:
 *   cartotree_locate  — which files to open first for a task
 *   cartotree_peek    — only the lines of a file that contain some words
 *   cartotree_links   — connection map of a file or symbol
 */
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { version } = require('../../package.json');
const { buildIndex, search } = require('./locate');
const { readHistory, coChanges } = require('./git');
const { peek } = require('./peek');
const { buildGraph, symbolLinks, fileLinks } = require('./links');
const { cached } = require('./cache');

function text(s) {
  return { content: [{ type: 'text', text: s }] };
}

function formatLocate(res) {
  if (!res.length) return 'no match — try other words (function names, folder names)';
  const lines = res.map((r, i) => {
    const ev = (r.evidence || []).map(e => `\n     L${e.line}: ${e.code}`).join('');
    const cw = r.changesWith && r.changesWith.length
      ? `\n     usually changes with: ${r.changesWith.map(c => `${c.file} (${Math.round(c.ratio * 100)}%)`).join(', ')}` : '';
    return `${i + 1}. ${r.file}  (score ${r.score}; ${r.matched.join(', ')})${ev}${cw}`;
  });
  if (res.ambiguous) lines.unshift('! top results are close — verify before choosing');
  return lines.join('\n');
}

async function startMcpServer(root = process.cwd()) {
  let index = null;
  let history = null;
  let graph = null;
  const getHistory = () => (history ||= readHistory(root));
  const getIndex = () => (index ||= cached(root, 'locate', { tests: false, history: true, v: 2 },
    () => buildIndex(root, { graph: true, chunks: true, history: getHistory() })));
  const getGraph = () => (graph ||= cached(root, 'graph', {}, () => buildGraph(root)));

  const server = new McpServer({ name: 'cartotree', version });

  server.registerTool('cartotree_locate', {
    title: 'Locate files for a task',
    description: 'Rank the source files most likely to need changes for a task, without reading them. '
      + 'Use FIRST when you do not know where code lives. Returns paths with evidence lines; '
      + '"top results are close" means verify with cartotree_peek. Pass the task in plain words, or likely identifiers.',
    inputSchema: { task: z.string().describe('task description or likely identifiers'), top: z.number().int().min(1).max(20).optional() },
  }, async ({ task, top }) => {
    const res = search(getIndex(), task, { k: top || 6, chunkWeight: 0.5 });
    const known = new Set(getIndex().files);
    for (const r of res.slice(0, 2)) {
      const cc = coChanges(getHistory(), r.file, 8);
      if (cc.total >= 2) r.changesWith = cc.files.filter(c => known.has(c.file) && c.ratio >= 0.3).slice(0, 2);
    }
    return text(formatLocate(res));
  });

  server.registerTool('cartotree_peek', {
    title: 'Peek into a file',
    description: 'Show only the lines of one file that contain the given words (max ~10 lines). '
      + 'Cheaper than reading the whole file or a broad grep; use it to confirm a candidate from cartotree_locate.',
    inputSchema: { file: z.string(), words: z.array(z.string()).min(1), max: z.number().int().min(1).max(40).optional() },
  }, async ({ file, words, max }) => {
    const r = peek(root, file, words, { max: max || 10 });
    if (r.error) return text(`${file}: ${r.error}`);
    const out = [`# ${r.file} (${r.totalLines} lines, ${r.matchedLines} matching)`, ...r.lines.map(l => `${l.line}: ${l.code}`)];
    if (r.matchedLines > r.lines.length) out.push(`... ${r.matchedLines - r.lines.length} more matching lines`);
    return text(out.join('\n'));
  });

  server.registerTool('cartotree_links', {
    title: 'Connection map',
    description: 'For a file path: its exports, imports, importers, files usually changed with it, recent commits. '
      + 'For a symbol name: where it is defined and called. Use to follow a call chain or find the second file of a change.',
    inputSchema: { target: z.string().describe('file path relative to the repo root, or a symbol name') },
  }, async ({ target }) => {
    const g = getGraph();
    if (g.set.has(target)) {
      const r = fileLinks(g, root, target, { history: getHistory() });
      const out = [`# ${r.file}`];
      if (r.exports.length) out.push(`exports: ${r.exports.slice(0, 12).join(', ')}`);
      out.push(`imports (${r.imports.length}): ${r.imports.join(', ') || '-'}`);
      out.push(`imported by (${r.importedByCount}): ${r.importedBy.join(', ') || '-'}`);
      if (r.changedWith.total) {
        out.push(`usually changes with (of ${r.changedWith.total} commits):`);
        r.changedWith.files.forEach(c => out.push(`  ${c.file}  ${Math.round(c.ratio * 100)}%`));
      }
      r.recent.forEach(c => out.push(`recent: ${c.date} ${c.hash} ${c.subject}`));
      return text(out.join('\n'));
    }
    const r = symbolLinks(g, target, { root });
    const out = [`# symbol ${r.symbol}`, 'defined in: ' + (r.definedIn.map(d => `${d.file}:${d.line}`).join(', ') || '-'), 'used in:'];
    r.usedIn.forEach(u => out.push(`  ${u.file} (${u.count}x)  ${u.first}`));
    if (r.moreFiles) out.push(`  ... +${r.moreFiles} more files`);
    return text(out.join('\n'));
  });

  await server.connect(new StdioServerTransport());
}

module.exports = { startMcpServer, formatLocate };
