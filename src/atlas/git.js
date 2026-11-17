const { execSync } = require('child_process');
const { isGitRepo } = require('./files');

/**
 * Read recent commit history once.
 * @returns {{commits: {hash:string, date:string, subject:string, files:string[]}[]}}
 */
function readHistory(root, { limit = 3000, skip = 0, maxFilesPerCommit = 25 } = {}) {
  if (!isGitRepo(root)) return { commits: [] };
  let raw;
  try {
    raw = execSync(
      `git log -n ${limit} --skip=${skip} --no-merges --name-only --date=short --pretty=format:@@%h%x09%ad%x09%s`,
      { cwd: root, maxBuffer: 1 << 28 }
    ).toString();
  } catch {
    return { commits: [] };
  }
  const commits = [];
  for (const block of raw.split('@@').slice(1)) {
    const lines = block.split('\n').filter(Boolean);
    const [hash, date, ...subj] = lines[0].split('\t');
    const files = lines.slice(1);
    if (files.length && files.length <= maxFilesPerCommit) commits.push({ hash, date, subject: subj.join('\t'), files });
  }
  return { commits };
}

/** How often each file changed (heat). */
function heatMap(history) {
  const heat = new Map();
  for (const c of history.commits) for (const f of c.files) heat.set(f, (heat.get(f) || 0) + 1);
  return heat;
}

/** Files that usually change together with `file`. */
function coChanges(history, file, top = 5) {
  const counts = new Map();
  let total = 0;
  for (const c of history.commits) {
    if (!c.files.includes(file)) continue;
    total++;
    for (const f of c.files) if (f !== file) counts.set(f, (counts.get(f) || 0) + 1);
  }
  return {
    total,
    files: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .map(([f, n]) => ({ file: f, together: n, ratio: +(n / total).toFixed(2) })),
  };
}

/** Recent commits touching a file. */
function recentChanges(history, file, top = 3) {
  return history.commits.filter(c => c.files.includes(file)).slice(0, top)
    .map(({ hash, date, subject }) => ({ hash, date, subject }));
}

module.exports = { readHistory, heatMap, coChanges, recentChanges };
