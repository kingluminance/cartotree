const fs = require('fs');
const path = require('path');

const DEFAULTS = [
  'node_modules', '.git', 'dist', 'build', '.next',
  '.nuxt', 'coverage', '.cache', '.DS_Store', 'Thumbs.db'
];

function loadIgnorePatterns(rootPath) {
  const ignorePath = path.join(rootPath, '.cartotreeignore');

  if (!fs.existsSync(ignorePath)) return DEFAULTS;

  const lines = fs.readFileSync(ignorePath, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  return [...new Set([...DEFAULTS, ...lines])];
}

function shouldIgnore(name, patterns) {
  return patterns.some(pattern => {
    if (pattern.startsWith('*.')) {
      return name.endsWith(pattern.slice(1));
    }
    return name === pattern;
  });
}

module.exports = { loadIgnorePatterns, shouldIgnore };