import type { App } from '../engine/App';

export function buildLayerPanel(app: App, onChange: () => void): HTMLElement {
  const root = document.createElement('aside');
  root.className = 'layer-panel';

  const header = document.createElement('div');
  header.className = 'layer-panel-header';
  header.innerHTML = '<strong>Layers</strong>';

  const addBtn = document.createElement('button');
  addBtn.className = 'tool';
  addBtn.textContent = '+';
  addBtn.title = 'Add layer';
  addBtn.addEventListener('click', () => {
    app.doc.addLayer();
    rebuild();
    onChange();
  });
  header.appendChild(addBtn);
  root.appendChild(header);

  const list = document.createElement('div');
  list.className = 'layer-list';
  root.appendChild(list);

  const rebuild = () => {
    list.innerHTML = '';
    // Display top-to-bottom (line art first).
    const layers = [...app.doc.layers].reverse();
    for (const layer of layers) {
      const row = document.createElement('div');
      row.className = 'layer-row';
      if (layer.id === app.doc.activeLayerId) row.classList.add('active');

      const eye = document.createElement('button');
      eye.className = 'layer-eye';
      eye.textContent = layer.visible ? '👁' : '·';
      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        rebuild();
        onChange();
      });
      row.appendChild(eye);

      const name = document.createElement('span');
      name.className = 'layer-name';
      name.textContent = layer.name + (layer.locked ? ' 🔒' : '');
      row.appendChild(name);

      const opacity = document.createElement('input');
      opacity.type = 'range';
      opacity.min = '0';
      opacity.max = '100';
      opacity.value = String(Math.round(layer.opacity * 100));
      opacity.className = 'layer-opacity';
      opacity.addEventListener('input', (e) => {
        e.stopPropagation();
        layer.opacity = +opacity.value / 100;
        onChange();
      });
      row.appendChild(opacity);

      if (!layer.locked) {
        const del = document.createElement('button');
        del.className = 'layer-del';
        del.textContent = '×';
        del.title = 'Delete layer';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          app.doc.removeLayer(layer.id);
          rebuild();
          onChange();
        });
        row.appendChild(del);
      }

      row.addEventListener('click', () => {
        if (layer.locked) return;
        app.doc.activeLayerId = layer.id;
        rebuild();
      });

      list.appendChild(row);
    }
  };

  rebuild();
  app.subscribe(() => rebuild());
  return root;
}
