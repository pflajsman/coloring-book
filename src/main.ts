import './ui/styles.css';
import { App } from './engine/App';
import { Document, newId } from './engine/Document';
import { buildKidUI } from './ui/KidUI';
import { showModal, promptDialog, confirmDialog } from './ui/Modal';
import { loadManifest, rasterizeTemplate, thumbnailUrl, type Template } from './templates';
import { saveDocument, listDocuments, loadDocument, deleteDocument, renameProject, applyStoredDocument } from './storage/db';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

// Suppress the OS long-press / right-click context menu everywhere in the
// app. On a tablet this is the "Save Image / Download / Inspect" sheet that
// pops up if a kid holds their finger on the toolbar or panel background;
// it interrupts whatever they were doing. The canvas already has its own
// handler in App.ts but the topbar / palette / dock backgrounds do not, so
// catch it at the document level.
window.addEventListener('contextmenu', (e) => e.preventDefault());

// ----- Boot -----

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

const canvasWrap = document.createElement('div');
canvasWrap.className = 'canvas-wrap';
const canvas = document.createElement('canvas');
canvas.id = 'canvas';
canvasWrap.appendChild(canvas);

const initialDoc = new Document({
  id: newId('doc'),
  name: 'Untitled',
  width: 1200,
  height: 800,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const app = new App(canvas, initialDoc);

// Kid-friendly defaults: bigger brush, pen-only on, fill as the favored tool
// (most 3-year-olds will tap shapes to color them, not draw).
app.setState({
  size: 24,
  pressureSensitivity: 1,
  penOnly: false, // start permissive — touchscreen-only devices still need to work; expose toggle in settings
  tool: 'fill',
  color: '#e74c3c',
});

const ui = buildKidUI(app, {
  onUndo: () => { if (app.history.undo(app.doc)) app.scheduleRender(); },
  onClear: () => {
    // Wipe every non-locked layer (the bg and template layers are locked,
    // so the line art stays). No confirmation: a stray tap is recoverable
    // by Undo, which is right next to it in the dock.
    //
    // We push a single ClearCommand so undo restores all paint layers in
    // one step.
    const beforeMap = new Map<string, ImageData>();
    for (const layer of app.doc.layers) {
      if (layer.locked) continue;
      beforeMap.set(
        layer.id,
        layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height),
      );
      layer.clear();
    }
    if (beforeMap.size === 0) return;
    app.history.push({
      apply(doc) {
        for (const layer of doc.layers) {
          if (beforeMap.has(layer.id)) layer.clear();
        }
      },
      invert(doc) {
        for (const [id, before] of beforeMap) {
          const layer = doc.getLayer(id);
          if (layer) layer.ctx.putImageData(before, 0, 0);
        }
      },
    });
    app.scheduleRender();
  },
  onSave: async () => {
    // First save: ask for a name. Subsequent saves on the same project keep
    // the existing name silently (the user can rename via the projects list).
    const isFirstSave = app.doc.meta.name === 'Untitled' || !app.doc.meta.name;
    if (isFirstSave) {
      const suggested = defaultProjectName();
      const name = await promptDialog({
        title: 'Save project',
        message: 'Give it a name so you can find it later.',
        initialValue: suggested,
        placeholder: 'My drawing',
        confirmLabel: 'Save',
        maxLength: 40,
      });
      if (name === null) return;
      app.doc.meta.name = name || suggested;
    }
    await saveDocument(app.doc);
    flash(`Saved "${app.doc.meta.name}"`);
  },
  onSavePng: async () => savePng(),
  onLoadTemplate: () => openTemplateChooser(),
  onOpenProjects: () => openProjects(),
});

root.append(canvasWrap, ui.topBar, ui.palette, ui.dock);

// Defer fitToWindow until after layout.
requestAnimationFrame(() => app.fitToWindow());

// Boot with a blank canvas so kids see a fresh page they can immediately use.
loadManifest()
  .then((tpls) => {
    const blank = tpls.find((t) => t.id === 'blank') ?? tpls[0];
    if (blank) return loadTemplate(blank);
  })
  .catch(console.error);

// Auto-save on tab close so unsaved work isn't lost — but only if the user
// has explicitly saved this project at least once (it has a real name).
// Otherwise we'd pollute the projects list with anonymous "Untitled" entries.
window.addEventListener('beforeunload', () => {
  if (app.doc.meta.name && app.doc.meta.name !== 'Untitled') {
    void saveDocument(app.doc);
  }
});

function defaultProjectName(): string {
  const tplId = app.doc.meta.templateId;
  const base = tplId && tplId !== 'blank' ? capitalize(tplId) : 'Drawing';
  const d = new Date();
  const stamp = `${d.getMonth() + 1}/${d.getDate()}`;
  return `${base} ${stamp}`;
}
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ----- Helpers -----

async function loadTemplate(tpl: Template) {
  const w = app.doc.meta.width;
  const h = app.doc.meta.height;
  const layer = app.doc.getLayer(app.doc.templateLayerId);
  if (!layer) return;
  layer.clear();
  if (tpl.file) {
    const bmp = await rasterizeTemplate(tpl, w, h);
    if (bmp) {
      layer.ctx.drawImage(bmp, 0, 0);
      bmp.close();
    }
  }
  app.doc.meta.templateId = tpl.id;
  // Also clear the paint layer so kids start fresh on the new picture.
  const paint = app.doc.layers.find((l) => !l.locked && l.id !== app.doc.templateLayerId);
  paint?.clear();
  app.history.clear();
  app.scheduleRender();
}

async function savePng() {
  const w = app.doc.meta.width;
  const h = app.doc.meta.height;
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext('2d');
  if (!ctx) return;
  for (const layer of app.doc.layers) {
    if (!layer.visible) continue;
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(layer.canvas as CanvasImageSource, 0, 0);
  }
  const url = tmp.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${app.doc.meta.name || 'coloring'}.png`;
  a.click();
}

async function openTemplateChooser() {
  const body = document.createElement('div');
  body.className = 'modal-body';
  body.innerHTML = '<div class="loading">Loading pictures…</div>';
  const destroy = showModal('Pick a picture', body);
  let tpls: Template[];
  try {
    tpls = await loadManifest();
  } catch (e) {
    body.innerHTML = '<div>Could not load pictures.</div>';
    console.error(e);
    return;
  }

  // Collect categories (preserving manifest order — Set keeps insertion order).
  const cats = new Set<string>();
  for (const t of tpls) if (t.category) cats.add(t.category);
  const allCats = ['All', ...cats];
  let activeCat = 'All';

  const render = () => {
    body.innerHTML = '';

    // Category filter row
    if (allCats.length > 1) {
      const catRow = document.createElement('div');
      catRow.className = 'template-categories';
      for (const c of allCats) {
        const btn = document.createElement('button');
        btn.className = 'template-category' + (c === activeCat ? ' active' : '');
        btn.textContent = c;
        btn.addEventListener('click', () => {
          activeCat = c;
          render();
        });
        catRow.appendChild(btn);
      }
      body.appendChild(catRow);
    }

    const filtered = tpls.filter((t) =>
      activeCat === 'All' ? true : t.category === activeCat || (!t.category && activeCat === 'All'),
    );

    for (const tpl of filtered) {
      const card = document.createElement('button');
      card.className = 'template-card';
      const thumb = document.createElement('div');
      thumb.className = 'template-thumb';
      const url = thumbnailUrl(tpl);
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = tpl.name;
        img.loading = 'lazy';
        thumb.appendChild(img);
      } else {
        thumb.classList.add('blank');
        thumb.textContent = '＋';
      }
      const label = document.createElement('div');
      label.className = 'template-label';
      label.textContent = tpl.name;
      card.append(thumb, label);
      card.addEventListener('click', () => {
        loadTemplate(tpl).then(() => destroy());
      });
      body.appendChild(card);
    }
  };

  render();
}

async function openProjects() {
  // Plain wrapper — no modal-body grid here. We render a real <table> so
  // each project is one row with Name / Date / Actions columns.
  const body = document.createElement('div');
  body.className = 'projects-list-wrap';
  body.innerHTML = '<div class="loading">Loading…</div>';
  const destroy = showModal('Saved projects', body);
  let docs = await listDocuments();

  const render = () => {
    body.innerHTML = '';
    if (docs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'loading';
      empty.textContent = 'No saved projects yet.';
      body.appendChild(empty);
      return;
    }

    const table = document.createElement('table');
    table.className = 'projects-table';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th class="col-name">Name</th>
        <th class="col-date">Saved</th>
        <th class="col-actions"></th>
      </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const meta of docs) {
      const row = document.createElement('tr');
      row.className = 'project-row';

      const nameCell = document.createElement('td');
      nameCell.className = 'col-name';
      nameCell.textContent = meta.name;
      nameCell.title = meta.name;

      const dateCell = document.createElement('td');
      dateCell.className = 'col-date';
      dateCell.textContent = new Date(meta.updatedAt).toLocaleString();

      const actionsCell = document.createElement('td');
      actionsCell.className = 'col-actions';
      const actions = document.createElement('div');
      actions.className = 'project-actions';

      const open = document.createElement('button');
      open.textContent = 'Open';
      open.addEventListener('click', async () => {
        const stored = await loadDocument(meta.id);
        if (!stored) return;
        await applyStoredDocument(app.doc, stored);
        app.history.clear();
        app.scheduleRender();
        destroy();
      });

      const rename = document.createElement('button');
      rename.textContent = 'Rename';
      rename.className = 'project-rename';
      rename.addEventListener('click', async () => {
        const newName = await promptDialog({
          title: 'Rename project',
          initialValue: meta.name,
          placeholder: 'New name',
          confirmLabel: 'Save',
          maxLength: 40,
        });
        if (newName === null || !newName) return;
        const stored = await loadDocument(meta.id);
        if (!stored) return;
        stored.meta.name = newName;
        // Re-save the loaded record. saveDocument needs a Document instance
        // to capture the layer blobs; here we already have blobs in `stored`,
        // so we hit the IDB store directly.
        await renameProject(meta.id, newName);
        // Also rename the live doc if it's the same project.
        if (app.doc.meta.id === meta.id) app.doc.meta.name = newName;
        docs = await listDocuments();
        render();
      });

      const del = document.createElement('button');
      del.textContent = 'Delete';
      del.className = 'project-delete';
      del.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Delete this drawing?',
          message: `"${meta.name}" will be gone forever. This can't be undone.`,
          confirmLabel: 'Delete',
          cancelLabel: 'Keep',
          destructive: true,
        });
        if (!ok) return;
        await deleteDocument(meta.id);
        docs = docs.filter((d) => d.id !== meta.id);
        render();
      });

      actions.append(open, rename, del);
      actionsCell.appendChild(actions);
      row.append(nameCell, dateCell, actionsCell);
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    body.appendChild(table);
  };

  render();
}

function flash(msg: string) {
  const n = document.createElement('div');
  n.textContent = msg;
  n.className = 'kid-flash';
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 1400);
}

