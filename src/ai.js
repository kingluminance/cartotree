const fs = require('fs');
const path = require('path');
const { shouldIgnore } = require('./ignore');
const { parseExports } = require('./exports');

const AI_FORMAT_HEADER = '# cartotree fmt: name{desc}[children]<exports>';

function getFolderDescription(dirPath) {
  const folderMd = path.join(dirPath, '.folder.md');
  const readmeMd = path.join(dirPath, 'README.md');

  if (fs.existsSync(folderMd)) {
    return fs.readFileSync(folderMd, 'utf-8').trim().split('\n')[0].replace(/^#\s*/, '');
  }
  if (fs.existsSync(readmeMd)) {
    const first = fs.readFileSync(readmeMd, 'utf-8').trim().split('\n')[0].replace(/^#\s*/, '');
    if (first.length < 80) return first;
  }
  return null;
}

function buildAINode(entryPath, name, opts, isDir, currentDepth = 0) {
  if (isDir) {
    let entries;
    try {
      entries = fs.readdirSync(entryPath, { withFileTypes: true });
    } catch {
      return `${name}[!]`;
    }

    const filtered = entries
      .filter(e => !shouldIgnore(e.name, opts.exclude))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    const desc = getFolderDescription(entryPath);
    const descPart = desc ? `{${desc}}` : '';

    if (filtered.length === 0) return `${name}${descPart}[]`;

    if (currentDepth >= opts.depth) {
      const names = filtered.map(e => e.name + (e.isDirectory() ? '/' : '')).join(',');
      return `${name}${descPart}[${names}]`;
    }

    const children = filtered.map(e => {
      const fullPath = path.join(entryPath, e.name);
      return buildAINode(fullPath, e.name, opts, e.isDirectory(), currentDepth + 1);
    });

    return `${name}${descPart}[${children.join(',')}]`;
  } else {
  const exports = opts.showExports ? parseExports(entryPath) : null;
  const exportPart = exports && exports.length > 0
    ? `<${exports.slice(0, 4).join(',')}${exports.length > 4 ? `+${exports.length - 4}` : ''}>`
    : '';
  return `${name}${exportPart}`;
}
}

function buildJSONNode(entryPath, opts, currentDepth = 0) {
  let entries;
  try {
    entries = fs.readdirSync(entryPath, { withFileTypes: true });
  } catch {
    return null;
  }

  const filtered = entries
    .filter(e => !shouldIgnore(e.name, opts.exclude))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  const result = {};

  const desc = getFolderDescription(entryPath);
  if (desc) result['_desc'] = desc;

  filtered.forEach(entry => {
    const fullPath = path.join(entryPath, entry.name);

    if (entry.isDirectory()) {
      result[entry.name] = currentDepth < opts.depth
        ? buildJSONNode(fullPath, opts, currentDepth + 1)
        : {};
    } else {
      const exports = parseExports(fullPath);
      result[entry.name] = exports ?? null;
    }
  });

  return result;
}

function generateAI(rootPath, opts) {
  const rootName = path.basename(rootPath);
  const node = buildAINode(rootPath, rootName, opts, true);
  return `${AI_FORMAT_HEADER}\n${node}`;
}

function generateJSON(rootPath, opts) {
  const rootName = path.basename(rootPath);
  const tree = buildJSONNode(rootPath, opts);
  return JSON.stringify({ [rootName]: tree }, null, 2);
}

module.exports = { generateAI, generateJSON };