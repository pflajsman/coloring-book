export type ModalOptions = {
  narrow?: boolean;
  // Called when the user closes the modal with the × button or by tapping
  // the backdrop. Dialog helpers use it to settle their promise, so callers
  // never wait forever on a dismissed dialog.
  onDismiss?: () => void;
};

export function showModal(title: string, body: HTMLElement, opts: ModalOptions = {}): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const card = document.createElement('div');
  card.className = 'modal' + (opts.narrow ? ' is-narrow' : '');

  const head = document.createElement('div');
  head.className = 'modal-head';
  const titleEl = document.createElement('strong');
  titleEl.textContent = title;
  const close = document.createElement('button');
  close.className = 'tool';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => dismiss());
  head.append(titleEl, close);

  card.append(head, body);
  overlay.appendChild(card);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });
  document.body.appendChild(overlay);

  let removed = false;
  function destroy() {
    if (removed) return;
    removed = true;
    overlay.remove();
  }
  function dismiss() {
    if (removed) return;
    destroy();
    opts.onDismiss?.();
  }
  return destroy;
}

// Custom in-app prompt. Resolves to the entered string, or null if cancelled.
// We don't use window.prompt() because (a) it blocks the event loop, (b) it
// can't be styled, and (c) some PWAs / iOS standalone modes suppress it.
export function promptDialog(opts: {
  title: string;
  message?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  maxLength?: number;
}): Promise<string | null> {
  return new Promise((resolve) => {
    const body = document.createElement('div');
    body.className = 'kid-dialog';

    if (opts.message) {
      const msg = document.createElement('div');
      msg.className = 'kid-dialog-message';
      msg.textContent = opts.message;
      body.appendChild(msg);
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'kid-dialog-input';
    input.value = opts.initialValue ?? '';
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.maxLength) input.maxLength = opts.maxLength;
    body.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'kid-dialog-actions';
    const cancel = document.createElement('button');
    cancel.className = 'kid-dialog-btn kid-dialog-cancel';
    cancel.textContent = opts.cancelLabel ?? 'Cancel';
    const ok = document.createElement('button');
    ok.className = 'kid-dialog-btn kid-dialog-ok';
    ok.textContent = opts.confirmLabel ?? 'OK';
    actions.append(cancel, ok);
    body.appendChild(actions);

    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      destroy();
      resolve(value);
    };

    cancel.addEventListener('click', () => finish(null));
    ok.addEventListener('click', () => finish(input.value.trim()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(input.value.trim());
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(null);
      }
    });

    const destroy = showModal(opts.title, body, { narrow: true, onDismiss: () => finish(null) });

    // Focus + select on next frame so the field is ready when the modal lands.
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}

// Custom in-app confirm. Resolves to true/false.
export function confirmDialog(opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const body = document.createElement('div');
    body.className = 'kid-dialog';

    const msg = document.createElement('div');
    msg.className = 'kid-dialog-message';
    msg.textContent = opts.message;
    body.appendChild(msg);

    const actions = document.createElement('div');
    actions.className = 'kid-dialog-actions';
    const cancel = document.createElement('button');
    cancel.className = 'kid-dialog-btn kid-dialog-cancel';
    cancel.textContent = opts.cancelLabel ?? 'Cancel';
    const ok = document.createElement('button');
    ok.className = 'kid-dialog-btn ' + (opts.destructive ? 'kid-dialog-destructive' : 'kid-dialog-ok');
    ok.textContent = opts.confirmLabel ?? 'OK';
    actions.append(cancel, ok);
    body.appendChild(actions);

    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      destroy();
      resolve(value);
    };

    cancel.addEventListener('click', () => finish(false));
    ok.addEventListener('click', () => finish(true));

    const destroy = showModal(opts.title, body, { narrow: true, onDismiss: () => finish(false) });

    requestAnimationFrame(() => ok.focus());
  });
}
