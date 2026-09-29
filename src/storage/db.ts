import { openDB, type IDBPDatabase } from 'idb';
import type { Document } from '../engine/Document';
import type { DocumentMeta } from '../types/document';
import { Layer } from '../engine/Layer';

// Schema designed so a future server-sync layer can replay deltas. We persist
// the layer pixel data as PNG blobs (compact, easy to re-import) plus the
// document metadata. When sync is added, we'll add an `ops` store keyed by
// {docId, seq} that the server can ingest in order.

interface Schema {
  documents: { key: string; value: StoredDocument };
  aiTemplates: { key: string; value: AiTemplateRecord };
  autosave: { key: string; value: StoredDocument };
}

// AI-generated coloring page saved by the user. The PNG blob is the
// already-processed line-art (white-stripped, letterboxed) so reload
// is instant and we never re-call the API for the same picture.
export type AiTemplateRecord = {
  id: string;
  name: string;
  prompt: string;
  createdAt: number;
  blob: Blob;
  // Document dimensions the blob was rendered at. Lets us defensively skip
  // entries baked at a different size if we ever change the canvas size.
  width: number;
  height: number;
};

type StoredLayer = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  blob: Blob;
  isTemplate: boolean;
};

type StoredDocument = {
  meta: DocumentMeta;
  activeLayerId: string;
  layers: StoredLayer[];
};

let dbPromise: Promise<IDBPDatabase> | null = null;
function getDb() {
  if (!dbPromise) {
    // v2 added the `aiTemplates` store. The `upgrade` callback runs for
    // each version transition the user is missing, so first-time installs
    // and existing users both end up with both stores.
    dbPromise = openDB('coloring-book', 3, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'meta.id' });
        }
        if (!db.objectStoreNames.contains('aiTemplates')) {
          db.createObjectStore('aiTemplates', { keyPath: 'id' });
        }
        // v3: single-record store for the always-on autosave. Kept apart
        // from `documents` so it never shows up in "My projects".
        if (!db.objectStoreNames.contains('autosave')) {
          db.createObjectStore('autosave');
        }
      },
    });
  }
  return dbPromise;
}

export async function saveDocument(doc: Document): Promise<void> {
  const db = await getDb();
  const stored = await toStored(doc);
  await db.put('documents', stored as unknown as Schema['documents']['value']);
}

// Serialise a live document (layer pixels as PNG blobs) into the stored
// record shape shared by named projects and the autosave.
async function toStored(doc: Document): Promise<StoredDocument> {
  const layers: StoredLayer[] = [];
  for (const l of doc.layers) {
    layers.push({
      id: l.id,
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      locked: l.locked,
      blob: await l.toBlob(),
      isTemplate: l.id === doc.templateLayerId,
    });
  }
  const stored: StoredDocument = {
    meta: { ...doc.meta, updatedAt: Date.now() },
    activeLayerId: doc.activeLayerId,
    layers,
  };
  return stored;
}

export async function listDocuments(): Promise<DocumentMeta[]> {
  const db = await getDb();
  const all = (await db.getAll('documents')) as unknown as StoredDocument[];
  return all
    .map((d) => d.meta)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadDocument(id: string): Promise<StoredDocument | undefined> {
  const db = await getDb();
  return (await db.get('documents', id)) as unknown as StoredDocument | undefined;
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('documents', id);
}

// Rename without re-uploading the layer blobs. Reads → mutates meta → writes.
export async function renameProject(id: string, name: string): Promise<void> {
  const db = await getDb();
  const stored = (await db.get('documents', id)) as unknown as StoredDocument | undefined;
  if (!stored) return;
  stored.meta.name = name;
  stored.meta.updatedAt = Date.now();
  await db.put('documents', stored as unknown as Schema['documents']['value']);
}

export async function applyStoredDocument(
  target: Document,
  stored: StoredDocument,
  decode: (blob: Blob) => Promise<ImageBitmap> = (b) => createImageBitmap(b),
): Promise<void> {
  // Decode every layer before touching the target. A truncated or corrupt
  // blob then throws with the live document still intact, instead of leaving
  // it half replaced (no active layer, every stroke throwing).
  const bitmaps = await Promise.all(stored.layers.map((sl) => decode(sl.blob)));
  const layers: Layer[] = [];
  let templateLayerId = '';
  stored.layers.forEach((sl, i) => {
    const layer = new Layer(sl.id, sl.name, stored.meta.width, stored.meta.height);
    layer.visible = sl.visible;
    layer.opacity = sl.opacity;
    layer.locked = sl.locked;
    layer.ctx.drawImage(bitmaps[i], 0, 0);
    bitmaps[i].close();
    layers.push(layer);
    if (sl.isTemplate) templateLayerId = layer.id;
  });
  target.meta = stored.meta;
  target.layers = layers;
  target.templateLayerId = templateLayerId;
  target.activeLayerId = stored.activeLayerId;
}

export type { StoredDocument };

// ---------- AI-generated templates ----------

export async function saveAiTemplate(record: AiTemplateRecord): Promise<void> {
  const db = await getDb();
  await db.put('aiTemplates', record as unknown as Schema['aiTemplates']['value']);
}

export async function listAiTemplates(): Promise<AiTemplateRecord[]> {
  const db = await getDb();
  const all = (await db.getAll('aiTemplates')) as unknown as AiTemplateRecord[];
  // Newest first — kids most often want the picture they just saved.
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteAiTemplate(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('aiTemplates', id);
}

// ---------- Autosave (current drawing) ----------

const AUTOSAVE_KEY = 'current';

export async function saveAutosave(doc: Document): Promise<void> {
  const db = await getDb();
  await db.put('autosave', (await toStored(doc)) as never, AUTOSAVE_KEY);
}

export async function clearAutosave(): Promise<void> {
  const db = await getDb();
  await db.delete('autosave', AUTOSAVE_KEY);
}

export async function loadAutosave(): Promise<StoredDocument | undefined> {
  const db = await getDb();
  return (await db.get('autosave', AUTOSAVE_KEY)) as StoredDocument | undefined;
}

// Ask the browser not to evict our data under storage pressure (Safari
// clears site data for sites it considers unused). Best effort only.
export function requestPersistentStorage(): void {
  void navigator.storage?.persist?.().catch(() => {});
}
