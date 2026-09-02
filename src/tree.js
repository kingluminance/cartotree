const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { shouldIgnore } = require('./ignore');
const { parseExports, formatExports } = require('./exports');


function getFolderDescription(dirPath) {
  const folderMd = path.join(dirPath, '.folder.md');
  const readmeMd = path.join(dirPath, 'README.md');

  if (fs.existsSync(folderMd)) {
    const content = fs.readFileSync(folderMd, 'utf-8').trim();
    return content.split('\n')[0].replace(/^#\s*/, '');
  }

  if (fs.existsSync(readmeMd)) {
    const content = fs.readFileSync(readmeMd, 'utf-8').trim();
    const firstLine = content.split('\n')[0].replace(/^#\s*/, '');
    if (firstLine.length < 80) return firstLine;
  }

  return null;
}

function buildTree(dirPath, opts, prefix = '', currentDepth = 0) {
  if (currentDepth > opts.depth) return '';

  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'EACCES') {
      return `${prefix}${chalk.red('[permission denied]')}\n`;
    }
    return `${prefix}${chalk.red(`[error: ${err.code}]`)}\n`;
  }

  const filtered = entries
    .filter(e => !shouldIgnore(e.name, opts.exclude))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  if (filtered.length === 0) {
    return `${prefix}${chalk.gray('(empty)')}\n`;
  }

  let output = '';

  filtered.forEach((entry, index) => {
    const isLast = index === filtered.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isSymbolicLink()) {
      try {
        const target = fs.readlinkSync(fullPath);
        output += `${prefix}${connector}${chalk.magenta(entry.name)}${chalk.gray(` -> ${target}`)}\n`;
      } catch {
        output += `${prefix}${connector}${chalk.magenta(entry.name)}${chalk.red(' -> [broken link]')}\n`;
      }
      return;
    }

    if (entry.isDirectory()) {
      const desc = getFolderDescription(fullPath);
      const annotation = desc ? chalk.gray(`  # ${desc}`) : '';
      output += `${prefix}${connector}${chalk.cyan(entry.name)}/${annotation}\n`;
      if (currentDepth < opts.depth) {
        output += buildTree(fullPath, opts, prefix + childPrefix, currentDepth + 1);
      }
    } else {
        const exports = opts.showExports ? parseExports(fullPath) : null;
        const exportTag = exports ? chalk.yellow(` ${formatExports(exports)}`) : '';
        output += `${prefix}${connector}${entry.name}${exportTag}\n`;
    }
  });

  return output;
}

function generateTree(rootPath, opts) {
  const rootName = path.basename(rootPath);
  const desc = getFolderDescription(rootPath);
  const annotation = desc ? chalk.gray(`  # ${desc}`) : '';

  let output = `${chalk.bold.cyan(rootName)}/${annotation}\n`;
  output += buildTree(rootPath, opts);

  return output;
}

module.exports = { generateTree };