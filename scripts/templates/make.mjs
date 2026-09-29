// Write generated pages to public/templates and update manifest.json.
// Usage: npm run templates
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { GAMES } from './games.mjs';
import { PICTURES } from './pictures/index.mjs';
import { mergeManifest } from './manifest.mjs';

const DIR = path.resolve('public/templates');
// Rejected in the 2026-09-29 review and not redrawn.
export const REMOVE = ['santa', 'princess-couple', 'princess-fairy', 'unicorn', 'unicorn-castle'];

const generated = [...PICTURES, ...GAMES];
for (const g of generated) await writeFile(path.join(DIR, `${g.id}.svg`), g.svg);
for (const id of REMOVE) await rm(path.join(DIR, `${id}.svg`), { force: true });

const manifestPath = path.join(DIR, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const templates = mergeManifest(manifest.templates, {
  remove: REMOVE,
  upsert: generated.map(({ id, name, category }) => ({ id, name, file: `${id}.svg`, category })),
});
await writeFile(manifestPath, JSON.stringify({ templates }, null, 2) + '\n');
console.log(`Wrote ${generated.length} templates, removed ${REMOVE.length}; manifest has ${templates.length} entries.`);
