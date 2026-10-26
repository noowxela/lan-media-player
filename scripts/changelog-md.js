#!/usr/bin/env node
// Generate docs/CHANGELOG.md from src/lib/changelog.json (the single source the app also reads).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const entries = JSON.parse(fs.readFileSync(path.join(root, 'src/lib/changelog.json'), 'utf8'));
const sections = [['features', '新功能 · New'], ['fixes', '修复 · Fixes'], ['improvements', '改进 · Improvements']];
let md = '# 更新说明 · Changelog\n\n<!-- Generated from src/lib/changelog.json by `node scripts/changelog-md.js`. Edit the JSON, not this file. -->\n';
for (const e of entries) {
  md += `\n## v${e.version} (build ${e.build}) · ${e.date}\n`;
  for (const [k, label] of sections) if (e[k] && e[k].length) md += `\n### ${label}\n\n` + e[k].map((x) => `- ${x}`).join('\n') + '\n';
}
fs.writeFileSync(path.join(root, 'docs/CHANGELOG.md'), md);
console.log('docs/CHANGELOG.md written (' + entries.length + ' versions)');
