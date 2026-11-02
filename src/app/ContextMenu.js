import { escapeHtml } from '../bim/labels.js';

/**
 * Right-click menu over the model. It lives inside the stage, so its position
 * is relative to the viewport and it closes on any outside pointer press, on
 * Escape and when the view moves.
 */
export class ContextMenu {
  constructor(element, { onClose } = {}) {
    this.element = element;
    this.onClose = onClose;
    this.handlers = [];
    this.element.addEventListener('click', (event) => {
      const button = event.target.closest('[data-menu-index]');
      if (!button || button.disabled) return;
      const item = this.items[Number(button.dataset.menuIndex)];
      this.close();
      item?.action?.();
    });
  }

  get isOpen() {
    return !this.element.classList.contains('hidden');
  }

  /** items: [{ label, icon, action, disabled }] or { divider: true }. */
  open(x, y, items, { title = '' } = {}) {
    this.items = items;
    const heading = title ? `<p class="bim-context-menu__title">${escapeHtml(title)}</p>` : '';
    this.element.innerHTML = heading + items.map((item, index) => {
      if (item.divider) return '<hr class="bim-context-menu__divider">';
      return `<button type="button" role="menuitem" class="bim-context-menu__item" data-menu-index="${index}"${item.disabled ? ' disabled' : ''}>`
        + `${item.icon ? `<i class="ph ${item.icon}"></i>` : ''}<span>${escapeHtml(item.label)}</span></button>`;
    }).join('');
    this.element.classList.remove('hidden');
    // Keep the menu inside the stage: flip it when it would overflow the right or bottom edge.
    const bounds = this.element.offsetParent?.getBoundingClientRect();
    const width = this.element.offsetWidth;
    const height = this.element.offsetHeight;
    const left = bounds ? Math.min(x - bounds.left, bounds.width - width - 8) : x;
    const top = bounds ? Math.min(y - bounds.top, bounds.height - height - 8) : y;
    this.element.style.left = `${Math.max(8, left)}px`;
    this.element.style.top = `${Math.max(8, top)}px`;
    this.bindDismiss();
  }

  close() {
    if (!this.isOpen) return;
    this.element.classList.add('hidden');
    this.unbindDismiss();
    this.onClose?.();
  }

  bindDismiss() {
    this.unbindDismiss();
    const onPointerDown = (event) => { if (!this.element.contains(event.target)) this.close(); };
    const onKey = (event) => { if (event.key === 'Escape') this.close(); };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey, true);
    this.handlers = [['pointerdown', onPointerDown, true], ['keydown', onKey, true]];
  }

  unbindDismiss() {
    this.handlers.forEach(([type, handler, capture]) => document.removeEventListener(type, handler, capture));
    this.handlers = [];
  }
}
