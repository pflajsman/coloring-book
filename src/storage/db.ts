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
}

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
    dbPromise = openDB('coloring-book', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'meta.id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveDocument(doc: Document): Promise<void> {
  const db = await getDb();
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
  await db.put('documents', stored as unknown as Schema['documents']['value']);
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

export async function applyStoredDocument(target: Document, stored: StoredDocument): Promise<void> {
  // Replace the target document's layers with what's in storage.
  target.meta = stored.meta;
  target.layers = [];
  target.templateLayerId = '';
  for (const sl of stored.layers) {
    const layer = new Layer(sl.id, sl.name, stored.meta.width, stored.meta.height);
    layer.visible = sl.visible;
    layer.opacity = sl.opacity;
    layer.locked = sl.locked;
    await layer.loadFromBlob(sl.blob);
    target.layers.push(layer);
    if (sl.isTemplate) target.templateLayerId = layer.id;
  }
  target.activeLayerId = stored.activeLayerId;
}

export type { StoredDocument };
