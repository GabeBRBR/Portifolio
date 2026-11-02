import * as THREE from 'three';

const HANDLES = [
  { key: 'minX', axis: 'x', label: 'X mín.' },
  { key: 'maxX', axis: 'x', label: 'X máx.' },
  { key: 'minY', axis: 'y', label: 'Altura mín.' },
  { key: 'maxY', axis: 'y', label: 'Altura máx.' },
  { key: 'minZ', axis: 'z', label: 'Z mín.' },
  { key: 'maxZ', axis: 'z', label: 'Z máx.' }
];
const KEY_STEP = 0.1;
const AXIS_UNIT = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

const format = (value) => `${value.toFixed(2).replace('.', ',')} m`;

/**
 * Drag handles on the faces of the section box. Each handle sits at the centre
 * of its face and follows it on screen; dragging moves that face along its
 * axis, the way a CAD section box works. Arrow keys nudge the face by 10 cm.
 */
export class ClipHandles {
  constructor({ container, engine, isActive, onChange }) {
    this.container = container;
    this.engine = engine;
    this.isActive = isActive;
    this.onChange = onChange;
    this.drag = null;
    this.handles = HANDLES.map((definition) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `bim-clip-handle bim-clip-handle--${definition.axis}`;
      button.dataset.face = definition.key;
      button.hidden = true;
      button.addEventListener('pointerdown', (event) => this.onPointerDown(event, definition));
      button.addEventListener('pointermove', (event) => this.onPointerMove(event));
      button.addEventListener('pointerup', (event) => this.onPointerUp(event));
      button.addEventListener('pointercancel', (event) => this.onPointerUp(event));
      button.addEventListener('keydown', (event) => this.onKeyDown(event, definition));
      container.appendChild(button);
      return { definition, button };
    });
  }

  /** Places the handles on the faces of the current box, or hides them when the box is not in use. */
  refresh() {
    const box = this.engine.getClipBox();
    const camera = this.engine.world?.camera?.three;
    const visible = Boolean(box && camera && this.isActive() && this.engine.walk.mode === 'orbit');
    if (!visible) {
      this.handles.forEach(({ button }) => { button.hidden = true; });
      return;
    }
    const rect = this.container.getBoundingClientRect();
    this.handles.forEach(({ definition, button }) => {
      const point = this.faceCentre(box, definition.key).project(camera);
      button.hidden = point.z > 1;
      if (button.hidden) return;
      button.style.left = `${((point.x + 1) / 2) * rect.width}px`;
      button.style.top = `${((1 - point.y) / 2) * rect.height}px`;
      button.setAttribute('aria-label', `Face ${definition.label}: ${format(box[definition.key])}`);
    });
  }

  faceCentre(box, key) {
    const axis = key.slice(-1).toLowerCase();
    const centre = {
      x: (box.minX + box.maxX) / 2,
      y: (box.minY + box.maxY) / 2,
      z: (box.minZ + box.maxZ) / 2
    };
    centre[axis] = box[key];
    return new THREE.Vector3(centre.x, centre.y, centre.z);
  }

  /** Screen position (CSS px, relative to the viewport) of a world point. */
  toScreen(point) {
    const camera = this.engine.world.camera.three;
    const rect = this.container.getBoundingClientRect();
    const projected = point.clone().project(camera);
    return { x: ((projected.x + 1) / 2) * rect.width, y: ((1 - projected.y) / 2) * rect.height };
  }

  setValue(key, value) {
    const updated = this.engine.setClipBox({ [key]: value });
    if (!updated) return;
    this.refresh();
    this.onChange?.(key, updated[key]);
  }

  onPointerDown(event, definition) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const box = this.engine.getClipBox();
    const centre = this.faceCentre(box, definition.key);
    const origin = this.toScreen(centre);
    const step = this.toScreen(centre.clone().add(AXIS_UNIT[definition.axis]));
    const along = { x: step.x - origin.x, y: step.y - origin.y };
    this.drag = {
      key: definition.key,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startValue: box[definition.key],
      along,
      lengthSq: along.x * along.x + along.y * along.y
    };
  }

  onPointerMove(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId || !drag.lengthSq) return;
    // Projection of the pointer movement on the axis, in metres: one metre along the axis is `along` on screen.
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const metres = (dx * drag.along.x + dy * drag.along.y) / drag.lengthSq;
    this.setValue(drag.key, drag.startValue + metres);
  }

  onPointerUp(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    this.drag = null;
  }

  onKeyDown(event, definition) {
    const box = this.engine.getClipBox();
    if (!box) return;
    const direction = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
    if (!direction) return;
    event.preventDefault();
    this.setValue(definition.key, box[definition.key] + direction * KEY_STEP);
  }
}
