import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyStoredDocument, type StoredDocument } from './db';
import type { Document } from '../engine/Document';

// Layer needs a 2D canvas; a stub is enough because these tests only check
// which layers end up on the document, not their pixels.
class FakeCanvas {
  constructor(public width: number, public height: number) {}
  getContext() {
    return { clearRect() {}, drawImage() {} };
  }
}

const stored = (): StoredDocument => ({
  meta: { id: 'doc_saved', name: 'Untitled', width: 4, height: 4, createdAt: 1, updatedAt: 1 },
  activeLayerId: 'p',
  layers: [
    { id: 'bg', name: 'Background', visible: true, opacity: 1, locked: true, blob: new Blob([]), isTemplate: false },
    { id: 'p', name: 'Paint', visible: true, opacity: 1, locked: false, blob: new Blob([]), isTemplate: false },
    { id: 'art', name: 'Line art', visible: true, opacity: 1, locked: true, blob: new Blob([]), isTemplate: true },
  ],
});

const liveDoc = () =>
  ({
    meta: { id: 'doc_live', name: 'Untitled', width: 4, height: 4, createdAt: 0, updatedAt: 0 },
    layers: ['L1', 'L2', 'L3'],
    activeLayerId: 'L2',
    templateLayerId: 'L3',
  }) as unknown as Document;

describe('applyStoredDocument', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('leaves the live document untouched when a layer fails to decode', async () => {
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    const doc = liveDoc();
    let n = 0;
    const decode = async () => {
      if (++n === 2) throw new Error('truncated PNG');
      return { close() {} } as unknown as ImageBitmap;
    };
    await expect(applyStoredDocument(doc, stored(), decode)).rejects.toThrow('truncated PNG');
    expect(doc.meta.id).toBe('doc_live');
    expect(doc.layers).toEqual(['L1', 'L2', 'L3']);
    expect(doc.templateLayerId).toBe('L3');
  });

  it('swaps in all layers when every layer decodes', async () => {
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    const doc = liveDoc();
    const decode = async () => ({ close() {} }) as unknown as ImageBitmap;
    await applyStoredDocument(doc, stored(), decode);
    expect(doc.meta.id).toBe('doc_saved');
    expect(doc.layers.map((l) => l.id)).toEqual(['bg', 'p', 'art']);
    expect(doc.templateLayerId).toBe('art');
    expect(doc.activeLayerId).toBe('p');
  });
});
