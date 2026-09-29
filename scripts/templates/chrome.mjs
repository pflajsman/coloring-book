// Shared helpers for the template scripts: serve public/ plus the script
// pages on a throwaway port and drive headless Chrome against them.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);
const ROOT = path.resolve('public');
const HERE = path.resolve('scripts/templates');
export const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FLAGS = ['--headless=new', '--disable-gpu', '--virtual-time-budget=120000'];

// `memory` maps URL paths (without leading slash) to file contents served
// instead of disk, so pages can be measured before anything is written.
export async function withServer(fn, memory = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const mem = memory[url.pathname.slice(1)];
    if (mem !== undefined) {
      res.writeHead(200, { 'content-type': 'image/svg+xml' }).end(mem);
      return;
    }
    const file = url.pathname.endsWith('.html') ? path.join(HERE, path.basename(url.pathname)) : path.join(ROOT, url.pathname);
    try {
      const body = await readFile(file);
      const type = file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.json') ? 'application/json' : 'text/html';
      res.writeHead(200, { 'content-type': type }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  }).listen(0);
  try {
    return await fn(`http://localhost:${server.address().port}`);
  } finally {
    server.close();
  }
}

// Load a page and return the JSON it writes as `<marker>[...]` into the DOM.
export function chromeMissingMessage(err, chromePath) {
  if (err?.code !== 'ENOENT') return null;
  return `Google Chrome not found at ${chromePath}. Install Chrome or set CHROME=/path/to/chrome.`;
}

async function chrome(args, opts) {
  try {
    return await run(CHROME, args, opts);
  } catch (e) {
    const msg = chromeMissingMessage(e, CHROME);
    throw msg ? new Error(msg) : e;
  }
}

export async function pageJson(url, marker) {
  const { stdout } = await chrome([...FLAGS, '--dump-dom', url], { maxBuffer: 64 * 1024 * 1024 });
  const json = stdout.match(new RegExp(`${marker}(\\[.*?\\]|\\{.*?\\})</pre>`, 's'))?.[1];
  if (!json) throw new Error(`${url} produced no ${marker} output`);
  return JSON.parse(json.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
}

export async function screenshot(url, file, width, height) {
  await chrome([...FLAGS, `--window-size=${width},${height}`, `--screenshot=${path.resolve(file)}`, url]);
}
