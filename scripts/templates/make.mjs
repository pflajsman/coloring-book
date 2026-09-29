// Write generated pages to public/templates and update manifest.json.
// Usage: npm run templates
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { GAMES } from './games.mjs';
import { PICTURES } from './pictures/index.mjs';
import { mergeManifest } from './manifest.mjs';
import { withServer, pageJson } from './chrome.mjs';

const DIR = path.resolve('public/templates');
// Rejected in the 2026-09-29 review and not redrawn.
export const REMOVE = ['santa', 'princess-couple', 'princess-fairy', 'unicorn', 'unicorn-castle'];

const generated = [...PICTURES, ...GAMES];

// Crop each page's viewBox to its drawing (plus a margin) so the app's
// letterbox scales the art up to fill the page like the tightly cropped
// clipart does. Measured in headless Chrome from memory, before anything is
// written, so a failed run leaves public/templates untouched.
const PAD = 24;
const memory = Object.fromEntries(generated.map((g) => [`templates/${g.id}.svg`, g.svg]));
let boxes;
try {
  boxes = await withServer((base) => pageJson(`${base}/fit.html?ids=${generated.map((g) => g.id).join(',')}`, 'BOXES'), memory);
} catch (e) {
  console.error(`Nothing written: ${e.message}`);
  process.exit(1);
}
for (const g of generated) {
  const [x, y, w, h] = boxes[g.id];
  const vb = [x - PAD, y - PAD, w + PAD * 2, h + PAD * 2].map((v) => Math.round(v));
  const svg = g.svg.replace('viewBox="0 0 1200 800" width="1200" height="800"', `viewBox="${vb.join(' ')}" width="${vb[2]}" height="${vb[3]}"`);
  await writeFile(path.join(DIR, `${g.id}.svg`), svg);
}
for (const id of REMOVE) await rm(path.join(DIR, `${id}.svg`), { force: true });

const manifestPath = path.join(DIR, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const templates = mergeManifest(manifest.templates, {
  remove: REMOVE,
  upsert: generated.map(({ id, name, category }) => ({ id, name, file: `${id}.svg`, category })),
});
await writeFile(manifestPath, JSON.stringify({ templates }, null, 2) + '\n');
console.log(`Wrote ${generated.length} templates, removed ${REMOVE.length}; manifest has ${templates.length} entries.`);
