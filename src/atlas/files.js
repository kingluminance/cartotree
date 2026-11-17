const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SRC_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIP_RE = /(^|\/)(node_modules|dist|build|coverage|\.next|out)\//;
const TEST_RE = /(\.test\.|\.spec\.|__tests__\/|(^|\/)tests?\/|fixtures\/|\.d\.ts$)/;

function isGitRepo(root) {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function walk(root, dir = '', out = []) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.isDirectory()) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!SKIP_RE.test(rel + '/')) walk(root, rel, out);
    } else {
      out.push(rel);
    }
  }
  return out;
}

/** Source files (relative paths), tests excluded unless includeTests. */
function listSourceFiles(root, { includeTests = false } = {}) {
  let files;
  if (isGitRepo(root)) {
    files = execSync('git ls-files', { cwd: root, maxBuffer: 1 << 28 }).toString().split('\n').filter(Boolean);
  } else {
    files = walk(root);
  }
  return files.filter(f => SRC_RE.test(f) && !SKIP_RE.test(f) && (includeTests || !TEST_RE.test(f)));
}

function readSafe(root, rel, max = 200000) {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf-8').slice(0, max);
  } catch {
    return '';
  }
}

module.exports = { listSourceFiles, readSafe, isGitRepo, SRC_RE, TEST_RE };
