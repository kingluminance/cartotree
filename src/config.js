const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  ai: false,
  json: false,
  exports: true,
  depth: 3,
  copy: false,
  sync: false,
};

function loadConfig(rootPath) {
  const configPath = path.join(rootPath, '.cartotreerc');
  if (!fs.existsSync(configPath)) return DEFAULTS;

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return { ...DEFAULTS, ...parsed.default };
  } catch (err) {
    console.warn('⚠ .cartotreerc parse error, using defaults');
    return DEFAULTS;
  }
}

module.exports = { loadConfig };