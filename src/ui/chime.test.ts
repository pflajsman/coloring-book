import { describe, expect, it } from 'vitest';
import { chimeWav } from './chime';

describe('chimeWav', () => {
  it('is a 16-bit mono WAV with audible, unclipped samples', () => {
    const buf = chimeWav();
    const v = new DataView(buf);
    const tag = (o: number) => String.fromCharCode(...new Uint8Array(buf, o, 4));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(buf.byteLength - 44);
    let peak = 0;
    for (let o = 44; o < buf.byteLength; o += 2) peak = Math.max(peak, Math.abs(v.getInt16(o, true)));
    expect(peak).toBeGreaterThan(8000);
    expect(peak).toBeLessThan(0x7fff);
  });
});
