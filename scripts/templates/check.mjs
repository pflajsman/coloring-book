// Render every template through the app's pipeline in headless Chrome,
// apply checkEntry, write a contact sheet, exit non-zero on problems.
// Usage: npm run templates:check [-- --ids=a,b] [-- --sheet=path.png]
import { withServer, pageJson, screenshot } from './chrome.mjs';
import { checkEntry } from './checkRules.mjs';
import { GAMES } from './games.mjs';
import { PICTURES } from './pictures/index.mjs';

// Only generated pages are held to the rules; kept clipart was accepted
// as-is in the 2026-09-29 review and is reported for information.
const generatedIds = new Set([...GAMES, ...PICTURES].map((g) => g.id));
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const ids = arg('ids') ?? '';
const sheet = arg('sheet');

await withServer(async (base) => {
  const page = `${base}/check.html${ids ? `?ids=${ids}` : ''}`;
  const results = await pageJson(page, 'RESULTS');
  if (sheet) {
    const rowsN = Math.ceil(results.length / 4);
    await screenshot(page, sheet, 1590, Math.max(300, rowsN * 290 + 40));
  }
  const problems = results.filter((m) => generatedIds.has(m.id)).flatMap((m) => checkEntry(m, m.category === 'Games'));
  for (const m of results) console.log(`${generatedIds.has(m.id) ? ' ' : 'i'} ${m.id.padEnd(22)} ink ${String(m.ink).padStart(4)}% big ${m.big} small ${m.small} tiny ${m.tiny}`);
  if (problems.length) {
    console.error('\nProblems:\n' + problems.join('\n'));
    process.exitCode = 1;
  } else console.log(`\nAll ${results.filter((m) => generatedIds.has(m.id)).length} generated templates pass.`);
});
