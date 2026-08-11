import { readdir, readFile } from 'node:fs/promises';
import { extname, relative } from 'node:path';

const forbidden = [
  'connect four', 'othello', 'yahtzee', '야찌', 'battleship', 'mastermind',
  'uno', 'quoridor', 'farkle', 'perudo', 'qwixx', 'rummikub', 'catan',
  'skull king', 'wizard', '부루마블', '신윷놀이', 'hive', 'onitama',
  'santorini', 'azul', 'pente', 'codenames', 'hanabi', '좀비 다이스',
  '간지 셴 클레버', 'scrabulous', 'wordle', 'monopoly', 'scrabble',
];
const roots = ['src', 'public'];
const topFiles = ['index.html', 'package.json', 'README.md'];
const textExtensions = new Set(['.ts', '.tsx', '.css', '.svg', '.webmanifest', '.html', '.json', '.md', '.txt']);

async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await walk(child));
    else if (textExtensions.has(extname(entry.name))) files.push(child);
  }
  return files;
}

const files = [...topFiles];
for (const root of roots) files.push(...await walk(root));
const hits = [];
for (const file of files) {
  const pathText = relative('.', file).replaceAll('\\', '/').toLowerCase();
  const body = (await readFile(file, 'utf8')).toLowerCase();
  for (const term of forbidden) {
    if (pathText.includes(term) || body.includes(term)) hits.push(`${file}: ${term}`);
  }
}
if (hits.length) {
  console.error(`Forbidden commercial terms found:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log(`Forbidden-term gate passed: ${files.length} files, ${forbidden.length} terms.`);
