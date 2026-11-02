import * as THREE from 'three';

const HOVER_STYLE = 'hover';
const HOVER_COLOR = '#f0c463';
// The highlight and the info card wait until the pointer rests on an element.
// Picking while the pointer moves made the viewer stutter.
const HOVER_DELAY_MS = 1500;

/**
 * Hover feedback in the 3D view: after the pointer rests on an element for
 * HOVER_DELAY_MS, the element is tinted and its BIM row is reported to the
 * interface. Moving the pointer clears it. It is off while walking, exploding
 * or measuring, where the pointer has other jobs.
 */
export class HoverMethods {
  setupHover() {
    this.ensureStyle(HOVER_STYLE, HOVER_COLOR, { opacity: 1, priority: 6 });
    this.hoverKey = null;
    this.hoverPointer = null;
    this.hoverTimer = null;
    this.hoverSequence = 0;
    const canvas = this.world.renderer.three.domElement;
    canvas.addEventListener('pointermove', (event) => this.onHoverPointerMove(event));
    canvas.addEventListener('pointerleave', () => this.clearHover());
  }

  onHoverPointerMove(event) {
    if (event.buttons) return;
    this.hoverPointer = { clientX: event.clientX, clientY: event.clientY };
    this.hoverSequence += 1;
    this.dropHover();
    clearTimeout(this.hoverTimer);
    this.hoverTimer = setTimeout(() => {
      this.hoverTimer = null;
      void this.runHoverPick();
    }, HOVER_DELAY_MS);
  }

  async runHoverPick() {
    const pointer = this.hoverPointer;
    if (!pointer || !this.highlighter || this.walk.mode !== 'orbit' || this.explodeDistance || this.measureMode) return;
    const sequence = this.hoverSequence;
    try {
      const row = await this.pickAt(pointer.clientX, pointer.clientY);
      // The pointer moved while the pick was running: its result is already stale.
      if (sequence !== this.hoverSequence || !row) return;
      this.hoverKey = row.key;
      await this.highlighter.highlightByID(HOVER_STYLE, { [row.modelId]: new Set([row.localId]) }, true, false);
      this.world.renderer.needsUpdate = true;
      this.onHoverChange?.({ row, clientX: pointer.clientX, clientY: pointer.clientY });
    } catch (error) {
      console.warn('Falha ao destacar o elemento sob o cursor:', error);
    }
  }

  /** Removes the highlight and the info card, if they are showing. */
  dropHover() {
    if (this.hoverKey === null) return;
    this.hoverKey = null;
    this.highlighter?.clear(HOVER_STYLE).catch(() => {});
    this.onHoverChange?.(null);
    if (this.world) this.world.renderer.needsUpdate = true;
  }

  clearHover() {
    clearTimeout(this.hoverTimer);
    this.hoverTimer = null;
    this.hoverPointer = null;
    this.hoverSequence += 1;
    this.dropHover();
  }

  /** BIM index row of the element under a screen point, or null. Shared by hover and the context menu. */
  async pickAt(clientX, clientY) {
    const rect = this.world.renderer.three.domElement.getBoundingClientRect();
    const position = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const hit = await this.sceneRaycaster.castRay({ items: [], position }).catch(() => null);
    const modelId = hit?.fragments?.modelId;
    const localId = hit?.localId;
    if (modelId === undefined || localId === undefined || localId === null) return null;
    return this.bimIndex.get(modelId, localId);
  }
}
