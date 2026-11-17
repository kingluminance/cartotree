const fs = require('fs');

const SUPPORTED_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'];

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function parseExports(filePath) {
  const ext = SUPPORTED_EXTENSIONS.find(e => filePath.endsWith(e));
  if (!ext) return null;

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  // strip comments so examples like `// export { foo }` are not parsed
  content = stripComments(content);

  const names = new Set();

  // export function foo / export async function foo / export class foo / export const foo
  const namedPattern = /export\s+(?:async\s+)?(?:function\*?|const|let|var|class|abstract\s+class|type|interface|enum)\s+(\w+)/g;
  let match;
  while ((match = namedPattern.exec(content)) !== null) {
    if (match[1] !== 'default') names.add(match[1]);
  }

  // export { foo, bar as baz }
  const bracketPattern = /export\s*\{([^}]+)\}/g;
  while ((match = bracketPattern.exec(content)) !== null) {
    match[1].split(',')
      .map(s => s.trim().split(/\s+as\s+/).pop().trim())
      .filter(Boolean)
      .forEach(n => names.add(n));
  }

  // export default function foo / export default class foo
  const defaultNamedPattern = /export\s+default\s+(?:function|class)\s+(\w+)/g;
  while ((match = defaultNamedPattern.exec(content)) !== null) {
    names.add(match[1]);
  }

  // module.exports = { foo, bar }
  const cjsPattern = /module\.exports\s*=\s*\{([^}]+)\}/g;
  while ((match = cjsPattern.exec(content)) !== null) {
    match[1].split(',')
      .map(s => s.trim().split(':')[0].trim())
      .filter(s => /^\w+$/.test(s))
      .forEach(n => names.add(n));
  }

  // module.exports.foo = ...
  const cjsDotPattern = /module\.exports\.(\w+)\s*=/g;
  while ((match = cjsDotPattern.exec(content)) !== null) {
    names.add(match[1]);
  }

  return names.size > 0 ? [...names] : null;
}

function formatExports(names, max = 4) {
  if (!names) return '';
  const visible = names.slice(0, max);
  const rest = names.length > max ? `, +${names.length - max}` : '';
  return `<${visible.join(', ')}${rest}>`;
}

module.exports = { parseExports, formatExports, stripComments };