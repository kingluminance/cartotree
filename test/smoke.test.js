const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { buildIndex, search, stem } = require('../src/atlas/locate');
const { peek } = require('../src/atlas/peek');
const { parseExports } = require('../src/exports');
const { plan } = require('../src/atlas/init');

const root = path.join(__dirname, '..');

test('stemmer merges word forms', () => {
  assert.equal(stem('settings'), 'set');
  assert.equal(stem('locales'), stem('localize'));
});

test('exports parser ignores comments', () => {
  const names = parseExports(path.join(root, 'src/exports.js'));
  assert.ok(!names.includes('foo'));
});

test('locate finds the exports parser', () => {
  const idx = buildIndex(root, { graph: true, chunks: true, keepText: true });
  const res = search(idx, 'parse exported names and strip comments', { k: 3, chunkWeight: 0.5 });
  assert.ok(res.map(r => r.file).includes('src/exports.js'), JSON.stringify(res.map(r => r.file)));
});

test('peek returns only matching lines', () => {
  const r = peek(root, 'src/exports.js', ['stripComments']);
  assert.ok(r.lines.length > 0 && r.lines.every(l => /strip|comment/i.test(l.code)));
});

test('init plans skill, MCP server, hook and gitignore', () => {
  const { steps } = plan(root, { agents: ['claude-code'] });
  const files = steps.map(s => s.file);
  for (const f of ['.mcp.json', '.claude/settings.json', '.gitignore']) assert.ok(files.includes(f));
});
