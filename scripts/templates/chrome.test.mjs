import { describe, expect, it } from 'vitest';
import { chromeMissingMessage, withServer } from './chrome.mjs';

describe('withServer', () => {
  it('serves in-memory files so pages can be measured before anything is written', async () => {
    const body = await withServer((base) => fetch(`${base}/templates/probe.svg`).then((r) => r.text()), {
      'templates/probe.svg': '<svg>probe</svg>',
    });
    expect(body).toBe('<svg>probe</svg>');
  });
});

describe('chromeMissingMessage', () => {
  it('explains how to point the scripts at Chrome', () => {
    const msg = chromeMissingMessage({ code: 'ENOENT' }, '/nope');
    expect(msg).toMatch(/Google Chrome not found at \/nope/);
    expect(msg).toMatch(/CHROME=/);
    expect(chromeMissingMessage({ code: 'EOTHER' }, '/nope')).toBeNull();
  });
});
