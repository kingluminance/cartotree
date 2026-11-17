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
  .description('suggest which files to open first for a task (no LLM; BM25 + git history)')
  .option('-k, --top <n>', 'number of results', '10')
  .option('--history', 'boost frequently changed files (git history; mixed results in tests)')
  .option('--tests', 'include test files')
  .option('--json', 'JSON output')
  .action((task, o) => {
    const { buildIndex, search } = require('../src/atlas/locate');
    const { readHistory, heatMap } = require('../src/atlas/git');
    const root = process.cwd();
    const index = buildIndex(root, { includeTests: !!o.tests });
    const heat = o.history ? heatMap(readHistory(root)) : null;
    const res = search(index, task.join(' '), { k: parseInt(o.top), heat });
    if (o.json) return console.log(JSON.stringify(res, null, 2));
    if (!res.length) return console.log('no match — try other words (function names, folder names)');
    console.log(res.map((r, i) => `${i + 1}. ${r.file}  [${r.matched.join(', ')}]`).join('\n'));
  });

program
  .command('links <target>')
  .description('connection map for a file (imports, importers, co-changes, recent commits) or a symbol (definition + call sites)')
  .option('--json', 'JSON output')
  .action((target, o) => {
    const fs = require('fs');
    const { buildGraph, symbolLinks, fileLinks } = require('../src/atlas/links');
    const root = process.cwd();
    const graph = buildGraph(root);
    const isFile = graph.set.has(target) || fs.existsSync(target);
    const res = isFile ? fileLinks(graph, root, target) : symbolLinks(graph, target);
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

program.parse(process.argv);
