/**
 * cartotree init — set up a project so AI agents use cartotree automatically.
 * Only runs when the user calls it (never from npm postinstall). Shows every change; --dry-run writes nothing.
 *
 * Claude Code:
 *   .claude/skills/cartotree/SKILL.md   how and when to use the tools
 *   .mcp.json                           registers the cartotree MCP server
 *   .claude/settings.json               SessionStart hook with a one-line reminder (skip with --no-hook)
 *   .gitignore                          ignores .cartotree/ (index cache)
 * Other agents (Cursor, Codex, ...): writes the skill under their skills folder when it exists.
 */
const fs = require('fs');
const path = require('path');

const SKILL_SRC = path.join(__dirname, '..', '..', 'skills', 'cartotree', 'SKILL.md');
const HOOK_CMD = "echo 'cartotree is available: to find where code lives, call cartotree_locate first (then cartotree_peek to confirm) before grep or reading whole files.'";
const MCP_ENTRY = { command: 'npx', args: ['-y', 'cartotree@latest', 'mcp'] };

const AGENT_SKILL_DIRS = {
  'claude-code': '.claude/skills',
  cursor: '.cursor/skills',
  codex: '.codex/skills',
  windsurf: '.windsurf/skills',
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

function detectAgents(root) {
  const found = Object.keys(AGENT_SKILL_DIRS).filter(a => fs.existsSync(path.join(root, AGENT_SKILL_DIRS[a].split('/')[0])));
  return found.length ? found : ['claude-code'];
}

function plan(root, { agents, hook = true } = {}) {
  const steps = [];
  const list = agents && agents.length ? agents : detectAgents(root);
  const skill = fs.readFileSync(SKILL_SRC, 'utf-8');

  for (const a of list) {
    const dir = AGENT_SKILL_DIRS[a];
    if (!dir) continue;
    steps.push({ file: path.join(dir, 'cartotree', 'SKILL.md'), why: `skill for ${a}`, write: () => skill });
  }

  if (list.includes('claude-code')) {
    steps.push({
      file: '.mcp.json',
      why: 'register cartotree MCP server',
      write: prev => {
        const j = prev ? JSON.parse(prev) : {};
        j.mcpServers = { ...(j.mcpServers || {}), cartotree: MCP_ENTRY };
        return JSON.stringify(j, null, 2) + '\n';
      },
    });
    if (hook) {
      steps.push({
        file: '.claude/settings.json',
        why: 'SessionStart reminder to use cartotree',
        write: prev => {
          const j = prev ? JSON.parse(prev) : {};
          j.hooks = j.hooks || {};
          const ss = (j.hooks.SessionStart = j.hooks.SessionStart || []);
          const exists = ss.some(g => (g.hooks || []).some(h => h.command === HOOK_CMD));
          if (!exists) ss.push({ hooks: [{ type: 'command', command: HOOK_CMD }] });
          return JSON.stringify(j, null, 2) + '\n';
        },
      });
    }
  }

  steps.push({
    file: '.gitignore',
    why: 'ignore index cache',
    write: prev => {
      const body = prev || '';
      if (body.split('\n').some(l => l.trim() === '.cartotree/')) return body;
      return body + (body && !body.endsWith('\n') ? '\n' : '') + '.cartotree/\n';
    },
  });
  return { agents: list, steps };
}

function runInit(root, { agents, hook = true, dryRun = false } = {}) {
  const { agents: list, steps } = plan(root, { agents, hook });
  const report = [];
  for (const s of steps) {
    const abs = path.join(root, s.file);
    const prev = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : null;
    if (prev !== null && s.file.endsWith('.json')) {
      if (readJson(abs, null) === null) {
        report.push(`skip   ${s.file} (not valid JSON — edit it by hand)`);
        continue;
      }
    }
    const next = s.write(prev);
    if (prev === next) {
      report.push(`ok     ${s.file} (already set up)`);
      continue;
    }
    report.push(`${prev === null ? 'create' : 'update'} ${s.file} — ${s.why}`);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, next);
    }
  }
  return { agents: list, report };
}

module.exports = { runInit, plan, MCP_ENTRY };
