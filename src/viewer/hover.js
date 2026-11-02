import * as THREE from 'three';

const HOVER_STYLE = 'hover';
const HOVER_COLOR = '#f0c463';
// One GPU pick at a time, at most every HOVER_INTERVAL_MS; the latest pointer position wins.
const HOVER_INTERVAL_MS = 90;

/**
 * Hover feedback in the 3D view: the element under the pointer is tinted and
 * its BIM row is reported to the interface. It is off while walking, exploding
 * or measuring, where the pointer has other jobs.
 */
export class HoverMethods {
  setupHover() {
    this.ensureStyle(HOVER_STYLE, HOVER_COLOR, { opacity: 1, priority: 6 });
    this.hoverKey = null;
    this.hoverPointer = null;
    this.hoverDirty = false;
    this.hoverBusy = false;
    this.hoverTimer = null;
    const canvas = this.world.renderer.three.domElement;
    canvas.addEventListener('pointermove', (event) => this.onHoverPointerMove(event));
    canvas.addEventListener('pointerleave', () => this.clearHover());
  }

  onHoverPointerMove(event) {
    if (event.buttons) return;
    this.hoverPointer = { clientX: event.clientX, clientY: event.clientY };
    this.hoverDirty = true;
    this.scheduleHoverPick();
  }

  scheduleHoverPick() {
    if (this.hoverTimer || this.hoverBusy || !this.hoverDirty) return;
    this.hoverTimer = setTimeout(() => {
      this.hoverTimer = null;
      void this.runHoverPick();
    }, HOVER_INTERVAL_MS);
  }

  async runHoverPick() {
    const pointer = this.hoverPointer;
    if (!pointer || !this.highlighter || this.walk.mode !== 'orbit' || this.explodeDistance || this.measureMode) {
      this.clearHover();
      return;
    }
    this.hoverDirty = false;
    this.hoverBusy = true;
    try {
      const row = await this.pickAt(pointer.clientX, pointer.clientY);
      const key = row?.key ?? null;
      if (key !== this.hoverKey) {
        this.hoverKey = key;
        if (row) await this.highlighter.highlightByID(HOVER_STYLE, { [row.modelId]: new Set([row.localId]) }, true, false);
        else await this.highlighter.clear(HOVER_STYLE);
        this.world.renderer.needsUpdate = true;
      }
      this.onHoverChange?.(row ? { row, clientX: pointer.clientX, clientY: pointer.clientY } : null);
    } catch (error) {
      console.warn('Falha ao destacar o elemento sob o cursor:', error);
    } finally {
      this.hoverBusy = false;
      this.scheduleHoverPick();
    }
  }

  clearHover() {
    clearTimeout(this.hoverTimer);
    this.hoverTimer = null;
    this.hoverPointer = null;
    this.hoverDirty = false;
    if (this.hoverKey === null) return;
    this.hoverKey = null;
    this.highlighter?.clear(HOVER_STYLE).catch(() => {});
    this.onHoverChange?.(null);
    if (this.world) this.world.renderer.needsUpdate = true;
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
