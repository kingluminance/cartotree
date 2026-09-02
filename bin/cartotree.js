#!/usr/bin/env node

const { program } = require('commander');
const { generateTree } = require('../src/tree');
const { generateAI, generateJSON } = require('../src/ai');
const { syncToFile } = require('../src/sync');
const { copyToClipboard } = require('../src/clipboard');
const { loadIgnorePatterns } = require('../src/ignore');
const { loadConfig } = require('../src/config');

program
  .name('cartotree')
  .description('AI-friendly annotated directory tree')
  .version('0.1.0')
  .option('-d, --depth <number>', 'max depth')
  .option('-e, --exclude <patterns>', 'exclude patterns (comma-separated)')
  .option('--ai', 'AI-optimized compact format')
  .option('--json', 'JSON format')
  .option('--no-exports', 'disable export parsing')
  .option('--copy', 'copy to clipboard')
  .option('--sync [file]', 'sync to CLAUDE.md or specified file')
  .option('--full', 'no depth limit')
  .parse(process.argv);

const opts = program.opts();
const config = loadConfig(process.cwd());

const depth = opts.full ? Infinity : parseInt(opts.depth ?? config.depth);
const useAI    = opts.ai   || config.ai;
const useJSON  = opts.json || config.json;
const useCopy  = opts.copy || config.copy;
const useSync  = opts.sync || config.sync;
const showExports = opts.exports ?? config.exports;

const ignorePatterns = loadIgnorePatterns(process.cwd());
const manualExclude = opts.exclude ? opts.exclude.split(',').map(s => s.trim()) : [];
const exclude = [...new Set([...ignorePatterns, ...manualExclude])];
const target = typeof useSync === 'string' ? useSync : 'CLAUDE.md';

let output;
if (useAI) {
  output = generateAI(process.cwd(), { depth, exclude, showExports });
} else if (useJSON) {
  output = generateJSON(process.cwd(), { depth, exclude, showExports });
} else {
  output = generateTree(process.cwd(), { depth, exclude, showExports });
}

if (useCopy) {
  copyToClipboard(output);
} else if (useSync) {
  syncToFile(output, target);
} else {
  console.log(output);
}