import * as THREE from 'three';
import { SnappingClass } from '@thatopen/fragments';

const COLOR = '#d99a00';
const CLICK_SLOP_PX = 5;
const SNAP_SHAPES = { [SnappingClass.POINT]: 'point', [SnappingClass.LINE]: 'line', [SnappingClass.FACE]: 'face' };
const meters = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Click-click distance tool with live preview and snapping to vertices, edges
 * and faces. Distances are in scene units, which are metres in this viewer.
 * The BIM axes are reported as X/Y on the plan and Z as height (scene Y).
 */
export class DistanceMeasure {
  constructor({ world, raycaster, container, onChange, onHint }) {
    this.world = world;
    this.raycaster = raycaster;
    this.container = container;
    this.onChange = onChange;
    this.onHint = onHint;
    this.enabled = false;
    this.start = null;
    this.hover = null;
    this.items = [];
    this.pending = false;
    this.down = null;
    this.frame = 0;

    this.group = new THREE.Group();
    this.group.name = 'distance-measure';
    this.group.renderOrder = 999;
    world.scene.three.add(this.group);

    this.layer = document.createElement('div');
    this.layer.className = 'bim-measure-layer';
    this.marker = document.createElement('div');
    this.marker.className = 'bim-snap-marker';
    this.marker.hidden = true;
    this.layer.appendChild(this.marker);
    container.appendChild(this.layer);

    this.canvas = world.renderer.three.domElement;
    this.onMove = (event) => this.handleMove(event);
    this.onDown = (event) => { this.down = { x: event.clientX, y: event.clientY }; };
    this.onUp = (event) => this.handleUp(event);
    this.onKey = (event) => this.handleKey(event);
    this.onLeave = () => { this.hover = null; this.marker.hidden = true; };
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('pointerleave', this.onLeave);
    window.addEventListener('keydown', this.onKey);
    this.canvas.classList.add('bim-measure-cursor');
    this.hint();
    this.loop();
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    window.removeEventListener('keydown', this.onKey);
    this.canvas.classList.remove('bim-measure-cursor');
    this.cancelPending();
    this.marker.hidden = true;
    this.onHint?.('');
  }

  hint() {
    this.onHint?.(this.start
      ? 'Clique no ponto B para concluir. Esc cancela este ponto.'
      : 'Clique no ponto A. O marcador mostra vértice (quadrado), aresta (losango) ou face (círculo).');
  }

  async pick(event) {
    const rect = this.canvas.getBoundingClientRect();
    const position = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const hit = await Promise.race([
      this.raycaster.castRay({ items: [], position, snappingClasses: [SnappingClass.POINT, SnappingClass.LINE, SnappingClass.FACE] }),
      new Promise((resolve) => setTimeout(() => resolve(null), 600))
    ]).catch(() => null);
    if (!hit?.point) return null;
    return { point: hit.point.clone(), shape: SNAP_SHAPES[hit.snappingClass] || 'face', x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  async handleMove(event) {
    if (this.pending) return;
    this.pending = true;
    try {
      const hit = await this.pick(event);
      if (!this.enabled) return;
      this.hover = hit;
      this.updateMarker();
      this.updatePreview();
    } finally {
      this.pending = false;
    }
  }

  async handleUp(event) {
    if (event.button !== 0 || !this.down) return;
    const moved = Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y);
    this.down = null;
    if (moved > CLICK_SLOP_PX) return;
    // Reuse the snap the marker was already showing so the committed point
    // matches the preview; fall back to a fresh pick when the cursor jumped.
    const rect = this.canvas.getBoundingClientRect();
    const near = this.hover
      && Math.hypot(this.hover.x - (event.clientX - rect.left), this.hover.y - (event.clientY - rect.top)) < 4;
    const hit = near ? this.hover : await this.pick(event);
    if (!hit || !this.enabled) return;
    if (!this.start) {
      this.start = hit.point;
      this.startDot = this.makeDot(hit.point);
      this.previewLine = this.makeLine(hit.point, hit.point, true);
      this.previewLabel = this.makeLabel();
    } else {
      this.commit(this.start, hit.point);
      this.cancelPending();
    }
    this.hint();
    this.hover = hit;
    this.updatePreview();
    this.world.renderer.needsUpdate = true;
  }

  handleKey(event) {
    if (event.target?.closest?.('input, textarea, select')) return;
    if (event.code === 'Escape' && this.start) {
      this.cancelPending();
      this.hint();
    } else if (event.code === 'Delete' || event.code === 'Backspace') {
      this.removeLast();
    }
  }

  commit(a, b) {
    const line = this.makeLine(a, b, false);
    const dotA = this.makeDot(a);
    const dotB = this.makeDot(b);
    const label = this.makeLabel();
    this.items.push({ a: a.clone(), b: b.clone(), line, dots: [dotA, dotB], label });
    this.writeLabel(label, a, b);
    this.onChange?.(this.items.length);
  }

  cancelPending() {
    this.start = null;
    [this.startDot, this.previewLine].forEach((object) => this.dispose(object));
    this.previewLabel?.remove();
    this.startDot = this.previewLine = this.previewLabel = null;
    this.world.renderer.needsUpdate = true;
  }

  removeLast() {
    const item = this.items.pop();
    if (!item) return;
    [item.line, ...item.dots].forEach((object) => this.dispose(object));
    item.label.remove();
    this.onChange?.(this.items.length);
    this.world.renderer.needsUpdate = true;
  }

  clear() {
    this.cancelPending();
    while (this.items.length) this.removeLast();
  }

  dispose(object) {
    if (!object) return;
    this.group.remove(object);
    object.geometry?.dispose();
    object.material?.dispose();
  }

  makeDot(point) {
    const geometry = new THREE.BufferGeometry().setFromPoints([point]);
    const material = new THREE.PointsMaterial({ color: COLOR, size: 9, sizeAttenuation: false, depthTest: false, depthWrite: false });
    const dot = new THREE.Points(geometry, material);
    dot.renderOrder = 1000;
    dot.frustumCulled = false;
    this.group.add(dot);
    return dot;
  }

  makeLine(a, b, dashed) {
    const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
    const material = dashed
      ? new THREE.LineDashedMaterial({ color: COLOR, dashSize: 0.12, gapSize: 0.08, depthTest: false, depthWrite: false })
      : new THREE.LineBasicMaterial({ color: COLOR, depthTest: false, depthWrite: false });
    const line = new THREE.Line(geometry, material);
    if (dashed) line.computeLineDistances();
    line.renderOrder = 999;
    line.frustumCulled = false;
    this.group.add(line);
    return line;
  }

  makeLabel() {
    const label = document.createElement('div');
    label.className = 'bim-measure-label';
    this.layer.appendChild(label);
    return label;
  }

  writeLabel(label, a, b) {
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.z - a.z);
    const dz = Math.abs(b.y - a.y);
    label.innerHTML = `<b>${meters.format(a.distanceTo(b))} m</b><small>ΔX ${meters.format(dx)} · ΔY ${meters.format(dy)} · ΔZ ${meters.format(dz)}</small>`;
  }

  updateMarker() {
    if (!this.hover) {
      this.marker.hidden = true;
      return;
    }
    this.marker.hidden = false;
    this.marker.dataset.shape = this.hover.shape;
    this.marker.style.transform = `translate(${this.hover.x}px, ${this.hover.y}px)`;
  }

  updatePreview() {
    if (!this.start || !this.hover || !this.previewLine) return;
    const positions = this.previewLine.geometry.attributes.position;
    positions.setXYZ(1, this.hover.point.x, this.hover.point.y, this.hover.point.z);
    positions.needsUpdate = true;
    this.previewLine.geometry.computeBoundingSphere();
    this.previewLine.computeLineDistances();
    this.writeLabel(this.previewLabel, this.start, this.hover.point);
    this.world.renderer.needsUpdate = true;
  }

  /** Keeps the HTML labels glued to their 3D midpoints while the camera moves. */
  loop() {
    cancelAnimationFrame(this.frame);
    const tick = () => {
      if (!this.enabled && !this.items.length) return;
      this.placeLabels();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  placeLabels() {
    const camera = this.world.camera.three;
    const rect = this.canvas.getBoundingClientRect();
    const place = (label, a, b) => {
      if (!label) return;
      const mid = a.clone().add(b).multiplyScalar(0.5).project(camera);
      const visible = mid.z > -1 && mid.z < 1;
      label.style.display = visible ? '' : 'none';
      label.style.transform = `translate(${((mid.x + 1) / 2) * rect.width}px, ${((1 - mid.y) / 2) * rect.height}px) translate(-50%, -120%)`;
    };
    this.items.forEach((item) => place(item.label, item.a, item.b));
    if (this.start && this.hover) place(this.previewLabel, this.start, this.hover.point);
  }

  /** Called after the engine adds measurements while the tool is idle, so labels keep following the camera. */
  keepAlive() {
    if (this.items.length) this.loop();
  }

  setVisible(visible) {
    this.group.visible = visible;
    this.layer.style.display = visible ? '' : 'none';
  }

  get count() {
    return this.items.length;
  }
}
