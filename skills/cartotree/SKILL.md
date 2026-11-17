---
name: cartotree
description: Navigate a codebase cheaply with cartotree. Use when you need to find which files to change for a task, confirm a candidate file, or follow how files and symbols connect — especially in large or unfamiliar repositories — before falling back to grep or reading whole files.
---

# cartotree — find the right files with few tokens

The `cartotree_*` MCP tools (or the `npx cartotree` CLI) answer "where is this?" from a local index — no file dumps.

## Workflow (fast mode — the default)

1. **Locate first.** `cartotree_locate` with the task in plain words (CLI: `npx cartotree locate <words>`).
   You get ranked files, each with 1–2 evidence lines, and sometimes *usually changes with* (files often edited together, from git history).
2. **Decide from the evidence.** If rank 1's evidence clearly implements the described behavior, go with it.
3. **Verify only when unsure.** If you see `! top results are close`, or the evidence is weak, call
   `cartotree_peek` on the top 1–2 candidates with the task's key words (CLI: `npx cartotree peek <file> <words...>`).
   Prefer peek over grep or reading whole files.
4. **Second file?** If the change likely spans two files (component + locales, implementation + its caller),
   check *usually changes with* or `cartotree_links <file>`.
5. **Follow a call chain** with `cartotree_links <SymbolName>`: where it is defined and called, one line each.

## Tips

- If locate misses, run it again with words that would appear in the code (guessed function/file names, camelCase).
- Words that never appear in code (e.g. a feature's marketing name) won't match; search for the identifiers instead.
- Keep listing 2–3 candidate files when unsure rather than committing to one too early.
- Fall back to grep/read only after locate + peek did not find it.

## Measured effect

On a 21k-file TypeScript monorepo with 30 real commits (Haiku agent): same accuracy as a grep-only agent,
63–80% fewer tool-output tokens, 17–66% less time.
