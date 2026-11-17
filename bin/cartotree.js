#!/usr/bin/env node

const { program } = require('commander');
const { generateTree } = require('../src/tree');
const { generateAI, generateJSON } = require('../src/ai');
const { syncToFile } = require('../src/sync');
const { copyToClipboard } = require('../src/clipboard');
const { loadIgnorePatterns } = require('../src/ignore');
const { loadConfig } = require('../src/config');
const { version } = require('../package.json');

program
  .name('cartotree')
  .description('AI-friendly annotated directory tree + code navigation for agents')
  .version(version)
  .option('-d, --depth <number>', 'max depth')
  .option('-e, --exclude <patterns>', 'exclude patterns (comma-separated)')
  .option('--ai', 'AI-optimized compact format')
  .option('--json', 'JSON format')
  .option('--no-exports', 'disable export parsing')
  .option('--copy', 'copy to clipboard')
  .option('--sync [file]', 'sync to CLAUDE.md or specified file')
  .option('--full', 'no depth limit')
  .action(opts => {
    const config = loadConfig(process.cwd());
    const depth = opts.full ? Infinity : parseInt(opts.depth ?? config.depth);
    const useAI = opts.ai || config.ai;
    const useJSON = opts.json || config.json;
    const useCopy = opts.copy || config.copy;
    const useSync = opts.sync || config.sync;
    const showExports = opts.exports ?? config.exports;

    const ignorePatterns = loadIgnorePatterns(process.cwd());
    const manualExclude = opts.exclude ? opts.exclude.split(',').map(s => s.trim()) : [];
    const exclude = [...new Set([...ignorePatterns, ...manualExclude])];
    const target = typeof useSync === 'string' ? useSync : 'CLAUDE.md';

    let output;
    if (useAI) output = generateAI(process.cwd(), { depth, exclude, showExports });
    else if (useJSON) output = generateJSON(process.cwd(), { depth, exclude, showExports });
    else output = generateTree(process.cwd(), { depth, exclude, showExports });

    if (useCopy) copyToClipboard(output);
    else if (useSync) syncToFile(output, target);
    else console.log(output);
  });

// ---------- atlas: navigation commands for agents ----------

program
  .command('locate <task...>')
  .description('suggest which files to open first for a task (no LLM): BM25F over path/exports/code/past commit messages + import-graph boost')
  .option('-k, --top <n>', 'number of results', '6')
  .option('--no-history', 'ignore git commit history')
  .option('--tests', 'include test files')
  .option('--json', 'JSON output')
  .action((task, o) => {
    const { buildIndex, search } = require('../src/atlas/locate');
    const { readHistory } = require('../src/atlas/git');
    const root = process.cwd();
    const { cached } = require('../src/atlas/cache');
    const index = cached(root, 'locate', { tests: !!o.tests, history: o.history, v: 2 }, () =>
      buildIndex(root, { includeTests: !!o.tests, graph: true, chunks: true, history: o.history ? readHistory(root) : null }));
    const res = search(index, task.join(' '), { k: parseInt(o.top), chunkWeight: 0.5 });
    if (o.history && res.length) {
      // attach "usually changes with" for the top 2 results: helps find the second file of a change
      const { coChanges } = require('../src/atlas/git');
      const hist = readHistory(root);
      const known = new Set(index.files);
      for (const r of res.slice(0, 2)) {
        const cc = coChanges(hist, r.file, 8);
        if (cc.total >= 2) r.changesWith = cc.files.filter(c => known.has(c.file) && c.ratio >= 0.3).slice(0, 2);
      }
    }
    if (o.json) return console.log(JSON.stringify({ ambiguous: !!res.ambiguous, results: res }, null, 2));
    if (!res.length) return console.log('no match — try other words (function names, folder names)');
    const lines = res.map((r, i) => {
      const ev = (r.evidence || []).map(e => `\n     L${e.line}: ${e.code}`).join('')
        + (r.changesWith && r.changesWith.length ? `\n     usually changes with: ${r.changesWith.map(c => `${c.file} (${Math.round(c.ratio * 100)}%)`).join(', ')}` : '');
      return `${i + 1}. ${r.file}  (score ${r.score}; ${r.matched.join(', ')})${ev}`;
    });
    if (res.ambiguous) lines.unshift('! top results are close — verify before choosing');
    console.log(lines.join('\n'));
  });

program
  .command('links <target>')
  .description('connection map for a file (imports, importers, co-changes, recent commits) or a symbol (definition + call sites)')
  .option('--json', 'JSON output')
  .action((target, o) => {
    const fs = require('fs');
    const { buildGraph, symbolLinks, fileLinks } = require('../src/atlas/links');
    const root = process.cwd();
    const { cached } = require('../src/atlas/cache');
    const graph = cached(root, 'graph', {}, () => buildGraph(root));
    const isFile = graph.set.has(target) || fs.existsSync(target);
    const res = isFile ? fileLinks(graph, root, target) : symbolLinks(graph, target, { root });
    if (o.json) return console.log(JSON.stringify(res, null, 2));
    const out = [];
    if (isFile) {
      out.push(`# ${res.file}`);
      if (res.exports.length) out.push(`exports: ${res.exports.slice(0, 12).join(', ')}`);
      out.push(`imports (${res.imports.length}): ${res.imports.join(', ') || '-'}`);
      out.push(`imported by (${res.importedByCount}): ${res.importedBy.join(', ') || '-'}`);
      if (res.changedWith.total) {
        out.push(`usually changes with (of ${res.changedWith.total} commits):`);
        res.changedWith.files.forEach(c => out.push(`  ${c.file}  ${Math.round(c.ratio * 100)}%`));
      }
      if (res.recent.length) {
        out.push('recent commits:');
        res.recent.forEach(c => out.push(`  ${c.date} ${c.hash} ${c.subject}`));
      }
    } else {
      out.push(`# symbol ${res.symbol}`);
      out.push('defined in: ' + (res.definedIn.map(d => `${d.file}:${d.line}${d.exported ? ' (exported)' : ''}`).join(', ') || '-'));
      out.push('used in:');
      res.usedIn.forEach(u => out.push(`  ${u.file} (${u.count}x)  ${u.first}`));
      if (res.moreFiles) out.push(`  ... +${res.moreFiles} more files`);
    }
    console.log(out.join('\n'));
  });

program
  .command('peek <file> <words...>')
  .description('show only the lines of a file that contain the given words (compact grep for verifying a candidate)')
  .option('-n, --max <n>', 'max lines', '10')
  .option('--json', 'JSON output')
  .action((file, words, o) => {
    const { peek } = require('../src/atlas/peek');
    const r = peek(process.cwd(), file, words, { max: parseInt(o.max) });
    if (o.json) return console.log(JSON.stringify(r, null, 2));
    if (r.error) return console.log(`${file}: ${r.error}`);
    const out = [`# ${r.file} (${r.totalLines} lines, ${r.matchedLines} matching)`];
    r.lines.forEach(l => out.push(`${l.line}: ${l.code}`));
    if (r.matchedLines > r.lines.length) out.push(`... ${r.matchedLines - r.lines.length} more matching lines`);
    console.log(out.join('\n'));
  });

program
  .command('mcp')
  .description('run the cartotree MCP server over stdio (tools: cartotree_locate, cartotree_peek, cartotree_links)')
  .action(async () => {
    const { startMcpServer } = require('../src/atlas/mcp');
    await startMcpServer(process.cwd());
  });

program
  .command('init')
  .description('set up this project so AI agents use cartotree automatically (skill + MCP server + reminder hook)')
  .option('--agent <names>', 'comma-separated: claude-code, cursor, codex, windsurf (default: detect)')
  .option('--no-hook', 'do not add the SessionStart reminder hook')
  .option('--dry-run', 'show what would change, write nothing')
  .action(o => {
    const { runInit } = require('../src/atlas/init');
    const agents = o.agent ? o.agent.split(',').map(s => s.trim()) : null;
    const { agents: list, report } = runInit(process.cwd(), { agents, hook: o.hook, dryRun: !!o.dryRun });
    console.log(`cartotree init${o.dryRun ? ' (dry run)' : ''} — agents: ${list.join(', ')}`);
    report.forEach(l => console.log('  ' + l));
    if (!o.dryRun) console.log('\nRestart your agent session to load the MCP server and skill.');
  });

program.parse(process.argv);
