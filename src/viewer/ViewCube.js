import * as THREE from 'three';

// Labels in BoxGeometry material order (+X, -X, +Y, -Y, +Z, -Z). The scene is
// Y-up and BIM north is -Z, so "Frente" is the view from +Z, as in the standard views.
const FACE_LABELS = ['Direita', 'Esquerda', 'Topo', 'Base', 'Frente', 'Trás'];
// A point this close to an edge of the cube (as a fraction of its half size)
// picks the edge, and close to two edges picks the corner.
const EDGE_ZONE = 0.7;
const HOVER_COLOR = '#e6c27a';
const PAPER = '#fbfaf7';
const INK = '#1c2b3a';
const LINE = '#d9d4c7';

const labelTexture = (text) => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, size - 10, size - 10);
  ctx.fillStyle = INK;
  ctx.font = '600 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/**
 * Navigation cube in the corner of the viewer. It is drawn in its own small
 * renderer and turns with the main camera, so the faces always name the model
 * axes. Clicking a face, an edge or a corner moves the camera to that direction.
 */
export class ViewCube {
  constructor({ container, engine }) {
    this.container = container;
    this.engine = engine;
    this.hovered = null;

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 10);
    this.camera.position.set(0, 0, 3.4);

    this.materials = FACE_LABELS.map((label) => new THREE.MeshBasicMaterial({ map: labelTexture(label) }));
    this.cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.materials);
    this.scene.add(this.cube);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.canvas.addEventListener('pointerleave', () => this.setHovered(null));
    this.canvas.addEventListener('click', (event) => this.onClick(event));
    this.resize();
  }

  /** Called on every camera update; the cube keeps the model axes aligned with the view. */
  sync() {
    const camera = this.engine.world?.camera?.three;
    const hidden = !camera || this.engine.walk.mode !== 'orbit';
    this.container.hidden = hidden;
    if (hidden) return;
    this.cube.quaternion.copy(camera.quaternion).invert();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const size = this.container.clientWidth || 96;
    this.renderer.setSize(size, size, false);
  }

  pick(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const [hit] = this.raycaster.intersectObject(this.cube);
    return hit || null;
  }

  onPointerMove(event) {
    const hit = this.pick(event);
    this.setHovered(hit ? hit.face.materialIndex : null);
    this.canvas.style.cursor = hit ? 'pointer' : 'default';
  }

  setHovered(index) {
    if (this.hovered === index) return;
    if (this.hovered !== null) this.materials[this.hovered].color.set('#ffffff');
    this.hovered = index;
    if (index !== null) this.materials[index].color.set(HOVER_COLOR);
    this.renderer.render(this.scene, this.camera);
  }

  onClick(event) {
    const hit = this.pick(event);
    if (!hit) return;
    // The cube has no translation, so the local point tells which face, edge or
    // corner was clicked: each coordinate beyond EDGE_ZONE adds that axis.
    const local = this.cube.worldToLocal(hit.point.clone());
    const direction = new THREE.Vector3();
    const dominant = [local.x, local.y, local.z].map(Math.abs).indexOf(Math.max(Math.abs(local.x), Math.abs(local.y), Math.abs(local.z)));
    const axes = ['x', 'y', 'z'];
    axes.forEach((axis, index) => {
      const value = local[axis];
      if (index === dominant || Math.abs(value) > 0.5 * EDGE_ZONE) direction[axis] = Math.sign(value);
    });
    void this.engine.setViewDirection(direction.normalize());
  }
}
