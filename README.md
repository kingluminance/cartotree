### `README.md`


# 🌲 cartotree

> AI-friendly codebase mapping CLI — annotated directory trees that save tokens, not just space.

[![npm version](https://img.shields.io/npm/v/cartotree)](https://www.npmjs.com/package/cartotree)
[![license](https://img.shields.io/npm/l/cartotree)](./LICENSE)

---

## The Problem

When you paste your project structure into an AI assistant, two things happen:

1. **Token waste** — Raw `tree` output burns hundreds of tokens on ASCII box characters with zero semantic value.
2. **Hallucination** — AI has no idea what each folder *does*, so it guesses wrong.

## The Solution

cartotree generates a compact, annotated map of your codebase — folder descriptions, exported functions, and an AI-optimized serialization format that fits your architecture into a fraction of the tokens.

---

## Quick Start

```bash
npx cartotree
```

No install required.

---

## Output Formats

### Default — Annotated ASCII Tree
```
my-app/
├── src/                    # Core application source
│   ├── components/         # Reusable UI components
│   │   ├── Button.tsx      <Button, ButtonProps>
│   │   └── Modal.tsx       <Modal, useModal>
│   ├── hooks/
│   │   └── useAuth.ts      <useAuth, useUser>
│   └── services/
│       └── api.ts          <fetchUser, postData>
└── package.json
```

### `--ai` — Token-Optimized Serialization
```
# cartotree fmt: name{desc}[children]<exports>
my-app{Core application source}[src{Core application source}[components{Reusable UI components}[Button.tsx<Button,ButtonProps>,Modal.tsx<Modal,useModal>],hooks[useAuth.ts<useAuth,useUser>],services[api.ts<fetchUser,postData>]],package.json]
```

### `--json` — JSON Format
```json
{
  "my-app": {
    "src": {
      "_desc": "Core application source",
      "components": {
        "Button.tsx": ["Button", "ButtonProps"],
        "Modal.tsx": ["Modal", "useModal"]
      }
    }
  }
}
```

---

## Usage

```bash
# Default annotated ASCII tree
npx cartotree

# AI-optimized single-line serialization
npx cartotree --ai

# JSON format
npx cartotree --json

# Copy to clipboard (paste directly into AI)
npx cartotree --ai --copy

# Sync into CLAUDE.md / AGENTS.md
npx cartotree --ai --sync

# Sync into custom file
npx cartotree --sync .cursorrules

# Limit depth
npx cartotree --depth 2

# No depth limit
npx cartotree --full

# Exclude patterns
npx cartotree --exclude "tests,*.log"

# Disable export parsing
npx cartotree --no-exports
```

---

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--ai` | false | AI-optimized compact serialization |
| `--json` | false | JSON format |
| `--copy` | false | Copy output to clipboard |
| `--sync [file]` | CLAUDE.md | Inject into AI config file |
| `--depth <n>` | 3 | Max traversal depth |
| `--full` | false | No depth limit |
| `--exclude <patterns>` | — | Comma-separated exclude patterns |
| `--no-exports` | false | Disable export parsing |

---

## Configuration

Create `.cartotreerc` in your project root to set persistent defaults:

```json
{
  "default": {
    "ai": true,
    "exports": false,
    "depth": 3
  }
}
```

Now `npx cartotree` automatically runs with `--ai --no-exports`.

---

## Folder Annotations

Add a `.folder.md` to any directory — the first line becomes the annotation:

```
# Reusable UI components
Atomic design system built with Radix UI primitives.
```

cartotree also falls back to the first line of `README.md` if no `.folder.md` exists.

---

## Ignoring Files

Create `.cartotreeignore` in your project root:

```
# .cartotreeignore
*.log
temp
coverage
.env*
```

`node_modules`, `.git`, `dist`, `build` are excluded by default.

---

## `--sync` Integration

Running `cartotree --sync` injects the tree between marker tags:

```html
<!-- CARTOTREE-START -->
(auto-updated on every sync)
<!-- CARTOTREE-END -->
```

Works with `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, or any file.

---

## Export Parsing

cartotree reads your source files and surfaces exported symbols directly in the tree:

```
hooks/
└── useAuth.ts  <useAuth, useUser, AuthProvider>
```

Supports `.js`, `.ts`, `.jsx`, `.tsx`, `.mjs`, `.cjs`.

---

## License

MIT
```

---
