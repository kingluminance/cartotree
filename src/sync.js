const fs = require('fs');
const chalk = require('chalk');

const START_MARKER = '<!-- CARTOTREE-START -->';
const END_MARKER = '<!-- CARTOTREE-END -->';

function syncToFile(tree, filePath) {
  const plain = tree.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
  const block = `${START_MARKER}\n\`\`\`\n${plain}\`\`\`\n${END_MARKER}`;

  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf-8');
    const startIdx = content.indexOf(START_MARKER);
    const endIdx = content.indexOf(END_MARKER);

    if (startIdx !== -1 && endIdx !== -1) {
      content = content.slice(0, startIdx) + block + content.slice(endIdx + END_MARKER.length);
    } else {
      content += `\n\n${block}\n`;
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(chalk.green(`✔ Synced to ${filePath}`));
  } else {
    fs.writeFileSync(filePath, `# Project Structure\n\n${block}\n`, 'utf-8');
    console.log(chalk.green(`✔ Created ${filePath}`));
  }
}

module.exports = { syncToFile };