/**
 * Disk cache for atlas indexes so repeated agent calls are fast.
 * Key = git HEAD + working-tree changes + options. Stored with v8.serialize (keeps Map objects).
 */
const fs = require('fs');
const path = require('path');
const v8 = require('v8');
const crypto = require('crypto');
const { execSync } = require('child_process');

function repoState(root) {
  try {
    const head = execSync('git rev-parse HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain --untracked-files=normal', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).toString();
    return head + '\n' + dirty.split('\n').filter(l => !l.includes('.cartotree/')).join('\n');
  } catch {
    return null; // not a git repo -> no caching
  }
}

function cached(root, name, opts, build) {
  if (process.env.CARTOTREE_NO_CACHE) return build();
  const state = repoState(root);
  if (state === null) return build();
  const key = crypto.createHash('sha1')
    .update(name + '\n' + JSON.stringify(opts) + '\n' + (process.env.CARTOTREE_HISTORY_SKIP || '') + '\n' + state)
    .digest('hex').slice(0, 16);
  const dir = path.join(root, '.cartotree', 'cache');
  const file = path.join(dir, `${name}-${key}.bin`);
  if (fs.existsSync(file)) {
    try {
      return v8.deserialize(fs.readFileSync(file));
    } catch { /* corrupted cache -> rebuild */ }
  }
  const value = build();
  try {
    fs.mkdirSync(dir, { recursive: true });
    const gi = path.join(root, '.cartotree', '.gitignore');
    if (!fs.existsSync(gi)) fs.writeFileSync(gi, 'cache/\n');
    for (const old of fs.readdirSync(dir)) if (old.startsWith(name + '-') && old !== path.basename(file)) fs.unlinkSync(path.join(dir, old));
    fs.writeFileSync(file, v8.serialize(value));
  } catch { /* read-only repo: just skip caching */ }
  return value;
}

module.exports = { cached };
