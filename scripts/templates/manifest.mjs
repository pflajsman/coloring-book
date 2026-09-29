// Merge generated entries into templates/manifest.json: drop removed ids,
// replace or add generated ones, keep "blank" first and group by category.

export const CATEGORY_ORDER = ['Other', 'Animals', 'Fairy tales', 'Fantasy', 'Vehicles', 'Places', 'Nature', 'Food', 'Toys', 'Games'];

export function mergeManifest(existing, { remove, upsert }) {
  const seen = new Set();
  for (const e of upsert) {
    if (seen.has(e.id)) throw new Error(`duplicate template id: ${e.id}`);
    seen.add(e.id);
  }
  const drop = new Set(remove);
  const byId = new Map();
  for (const e of existing) if (!drop.has(e.id)) byId.set(e.id, e);
  for (const e of upsert) byId.set(e.id, e);
  const rank = (c) => {
    const i = CATEGORY_ORDER.indexOf(c);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  // Stable: keeps existing order inside a category, new entries after.
  return [...byId.values()]
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(a.e.category) - rank(b.e.category) || a.i - b.i)
    .map(({ e }) => e);
}
