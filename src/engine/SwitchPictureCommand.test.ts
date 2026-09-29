import { describe, expect, it } from 'vitest';
import { SwitchPictureCommand, freshMeta } from './SwitchPictureCommand';
import type { Document } from './Document';

// Minimal fake: layers whose ctx records the last putImageData argument.
const fakeDoc = () => {
  const put: Record<string, unknown> = {};
  const layer = (id: string) => ({ id, ctx: { putImageData: (img: unknown) => { put[id] = img; } } });
  const doc = { layers: [layer('paint'), layer('art')], getLayer(id: string) { return this.layers.find((l) => l.id === id); }, meta: { templateId: 'dog' } };
  return { doc: doc as unknown as Document, put };
};

describe('SwitchPictureCommand', () => {
  it('invert restores the before pixels and template id; redo re-applies', () => {
    const { doc, put } = fakeDoc();
    const before = new Map([['paint', 'P0' as unknown as ImageData], ['art', 'A0' as unknown as ImageData]]);
    const after = new Map([['paint', 'P1' as unknown as ImageData], ['art', 'A1' as unknown as ImageData]]);
    const cmd = new SwitchPictureCommand(before, after, 'cat', 'dog');
    cmd.invert(doc);
    expect(put).toEqual({ paint: 'P0', art: 'A0' });
    expect(doc.meta.templateId).toBe('cat');
    cmd.apply(doc);
    expect(put).toEqual({ paint: 'P1', art: 'A1' });
    expect(doc.meta.templateId).toBe('dog');
  });
});

describe('freshMeta', () => {
  it('gives a new id and the Untitled name, keeps the size', () => {
    const m = freshMeta({ id: 'doc_old', name: 'Cat 9/28', width: 1200, height: 800, createdAt: 1, updatedAt: 2 }, 50);
    expect(m.id).not.toBe('doc_old');
    expect(m.name).toBe('Untitled');
    expect(m).toMatchObject({ width: 1200, height: 800, createdAt: 50, updatedAt: 50 });
  });
});
