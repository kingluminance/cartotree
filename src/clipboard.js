const clipboardy = require('clipboardy');
const chalk = require('chalk');

function copyToClipboard(text) {
    const plain = text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
    clipboardy.writeSync(plain);
    console.log(chalk.green('✔ Copied to clipboard!'));
    console.log(chalk.gray('(Color codes stripped for clean paste)'));
}

module.exports = { copyToClipboard };