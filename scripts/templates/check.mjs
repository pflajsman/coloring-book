// Render every template through the app's pipeline in headless Chrome,
// apply checkEntry, write a contact sheet, exit non-zero on problems.
// Usage: npm run templates:check [-- --ids=a,b] [-- --sheet=path.png]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { checkEntry } from './checkRules.mjs';
import { GAMES } from './games.mjs';
import { PICTURES } from './pictures/index.mjs';

// Only generated pages are held to the rules; kept clipart was accepted
// as-is in the 2026-09-29 review and is reported for information.
const generatedIds = new Set([...GAMES, ...PICTURES].map((g) => g.id));
const run = promisify(execFile);
const ROOT = path.resolve('public');
const HERE = path.resolve('scripts/templates');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const ids = arg('ids') ?? '';
const sheet = arg('sheet');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = url.pathname === '/check.html' ? path.join(HERE, 'check.html') : path.join(ROOT, url.pathname);
  try {
    const body = await readFile(file);
    const type = file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.json') ? 'application/json' : 'text/html';
    res.writeHead(200, { 'content-type': type }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const port = server.address().port;
const page = `http://localhost:${port}/check.html${ids ? `?ids=${ids}` : ''}`;
const flags = ['--headless=new', '--disable-gpu', '--virtual-time-budget=120000'];

try {
  const { stdout } = await run(CHROME, [...flags, '--dump-dom', page], { maxBuffer: 64 * 1024 * 1024 });
  const json = stdout.match(/RESULTS(\[.*?\])<\/pre>/s)?.[1];
  if (!json) throw new Error('checker page produced no results');
  const results = JSON.parse(json.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  if (sheet) {
    const rowsN = Math.ceil(results.length / 4);
    await run(CHROME, [...flags, `--window-size=1590,${Math.max(300, rowsN * 290 + 40)}`, `--screenshot=${path.resolve(sheet)}`, page]);
  }
  const problems = results.filter((m) => generatedIds.has(m.id)).flatMap((m) => checkEntry(m, m.category === 'Games'));
  for (const m of results) console.log(`${generatedIds.has(m.id) ? ' ' : 'i'} ${m.id.padEnd(22)} ink ${String(m.ink).padStart(4)}% big ${m.big} small ${m.small} tiny ${m.tiny}`);
  if (problems.length) {
    console.error('\nProblems:\n' + problems.join('\n'));
    process.exitCode = 1;
  } else console.log(`\nAll ${results.length} templates pass.`);
} finally {
  server.close();
}
