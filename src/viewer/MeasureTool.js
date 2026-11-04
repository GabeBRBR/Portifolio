import * as THREE from 'three';
import { SnappingClass } from '@thatopen/fragments';

const COLOR = '#d99a00';
const CLICK_SLOP_PX = 5;
const CLOSE_PX = 12;
const SNAP_SHAPES = { [SnappingClass.POINT]: 'end', [SnappingClass.LINE]: 'line', [SnappingClass.FACE]: 'face' };
const SNAP_NAMES = { end: 'Ponto final', mid: 'Ponto médio', perp: 'Perpendicular', line: 'Aresta', face: 'Face' };
// Screen distance (px) within which an edge hit is pulled to its midpoint or perpendicular foot.
// CAD-style aperture: inside it, snaps win by priority (end > mid > perp > edge), never by distance.
const SNAP_RADIUS_PX = { end: 16, mid: 16, perp: 16, line: 9 };
const SNAP_PRIORITY = ['end', 'mid', 'perp', 'line'];
const meters = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const degrees = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const coordinate = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const HINTS = {
  point: ['Clique em um ponto para ler suas coordenadas (copiadas automaticamente). Encaixes: ponto final, ponto médio, aresta e face.'],
  length: [
    'Clique no ponto A. Encaixes: ponto final, ponto médio, perpendicular, aresta e face.',
    'Clique no ponto B para concluir. Esc cancela este ponto.'
  ],
  angle: [
    'Clique no primeiro ponto do ângulo. Encaixes: ponto final, ponto médio, aresta e face.',
    'Clique no vértice do ângulo. Esc cancela.',
    'Clique no terceiro ponto para concluir. Esc cancela.'
  ],
  area: [
    'Clique em cada vértice do polígono. Encaixes: ponto final, ponto médio, aresta e face.',
    'Continue clicando nos vértices. Enter ou clique no primeiro ponto fecha a área.',
    'Enter ou clique no primeiro ponto fecha a área. Esc cancela.'
  ]
};

/**
 * Click-driven measuring tool (distance, angle, area) with live preview and
 * snapping to vertices, edges and faces. Scene units are metres in this
 * viewer; the BIM axes are X/Y on the plan and Z as height (scene Y).
 */
export class MeasureTool {
  constructor({ world, raycaster, container, onChange, onHint }) {
    this.world = world;
    this.raycaster = raycaster;
    this.container = container;
    this.onChange = onChange;
    this.onHint = onHint;
    this.enabled = false;
    this.mode = 'length';
    this.points = [];
    this.pendingDots = [];
    this.previewLine = null;
    this.previewLabel = null;
    this.hover = null;
    this.items = [];
    this.pending = false;
    this.down = null;
    this.frame = 0;

    this.group = new THREE.Group();
    this.group.name = 'measure-tool';
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
    this.canvasSize = { width: this.canvas.clientWidth || 1, height: this.canvas.clientHeight || 1 };
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          this.canvasSize = {
            width: entry.contentRect.width || this.canvas.clientWidth || 1,
            height: entry.contentRect.height || this.canvas.clientHeight || 1
          };
        }
      });
      this.resizeObserver.observe(this.canvas);
    }
    this.onMove = (event) => this.handleMove(event);
    this.onDown = (event) => { this.down = { x: event.clientX, y: event.clientY }; };
    this.onUp = (event) => this.handleUp(event);
    this.onKey = (event) => this.handleKey(event);
    this.onLeave = () => { this.hover = null; this.marker.hidden = true; };
  }

  enable(mode = 'length') {
    if (this.enabled && this.mode === mode) return;
    if (this.enabled) {
      this.cancelPending();
      this.mode = mode;
      this.hint();
      return;
    }
    this.mode = mode;
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
    const steps = HINTS[this.mode];
    this.onHint?.(steps[Math.min(this.points.length, steps.length - 1)]);
  }

  /** Last placed point of the measurement in progress. */
  get start() {
    return this.points.length ? this.points[this.points.length - 1] : null;
  }

  /** Points needed to finish the current measurement; area is open-ended. */
  get needed() {
    return this.mode === 'point' ? 1 : this.mode === 'length' ? 2 : this.mode === 'angle' ? 3 : Infinity;
  }

  async pick(event) {
    const rect = this.canvas.getBoundingClientRect();
    const position = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const hit = await Promise.race([
      this.raycaster.castRay({ items: [], position, snappingClasses: [SnappingClass.FACE] }),
      new Promise((resolve) => setTimeout(() => resolve(null), 600))
    ]).catch(() => null);
    if (!hit?.point) return null;
    const result = { point: hit.point.clone(), shape: SNAP_SHAPES[hit.snappingClass] || 'face', x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.refineSnap(result, hit, rect);
    return result;
  }

  toScreen(point, rect) {
    const projected = point.clone().project(this.world.camera.three);
    return { x: ((projected.x + 1) / 2) * rect.width, y: ((1 - projected.y) / 2) * rect.height };
  }

  /**
   * Magnetic snaps around a surface or edge hit: the cursor can be anywhere on
   * the surface, but endpoints, midpoints and perpendicular feet pull harder
   * (larger screen radius) than a plain edge, which pulls harder than the face.
   */
  refineSnap(result, hit, rect) {
    const vertices = [];
    const segments = [];
    const vec = (x, y, z) => new THREE.Vector3(x, y, z);
    if (hit.snappedEdgeP1 && hit.snappedEdgeP2) {
      const a = vec(hit.snappedEdgeP1.x, hit.snappedEdgeP1.y, hit.snappedEdgeP1.z);
      const b = vec(hit.snappedEdgeP2.x, hit.snappedEdgeP2.y, hit.snappedEdgeP2.z);
      vertices.push(a, b);
      segments.push([a, b]);
    } else if (hit.facePoints?.length >= 9) {
      const f = hit.facePoints;
      const count = Math.floor(f.length / 3);
      for (let i = 0; i < count; i += 1) vertices.push(vec(f[i * 3], f[i * 3 + 1], f[i * 3 + 2]));
      for (let i = 0; i < count; i += 1) segments.push([vertices[i], vertices[(i + 1) % count]]);
    }
    if (!segments.length) return;
    const candidates = vertices.map((point) => ({ shape: 'end', point }));
    segments.forEach(([a, b]) => {
      candidates.push({ shape: 'mid', point: a.clone().add(b).multiplyScalar(0.5) });
      const edge = b.clone().sub(a);
      const lengthSq = edge.lengthSq();
      if (!lengthSq) return;
      if (this.start && this.mode === 'length') {
        const t = this.start.clone().sub(a).dot(edge) / lengthSq;
        if (t > 0.001 && t < 0.999) candidates.push({ shape: 'perp', point: a.clone().addScaledVector(edge, t) });
      }
      // Plain edge: closest point on the segment to the surface hit.
      const u = Math.min(1, Math.max(0, result.point.clone().sub(a).dot(edge) / lengthSq));
      candidates.push({ shape: 'line', point: a.clone().addScaledVector(edge, u) });
    });
    let best = null;
    candidates.forEach((candidate) => {
      const screen = this.toScreen(candidate.point, rect);
      const distance = Math.hypot(screen.x - result.x, screen.y - result.y);
      if (distance > SNAP_RADIUS_PX[candidate.shape]) return;
      const rank = SNAP_PRIORITY.indexOf(candidate.shape);
      if (!best || rank < best.rank || (rank === best.rank && distance < best.distance)) best = { ...candidate, rank, distance, screen };
    });
    if (!best) return;
    result.point = best.point;
    result.shape = best.shape;
    result.x = best.screen.x;
    result.y = best.screen.y;
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
    const rect = this.canvas.getBoundingClientRect();
    const cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    // Area: a click back on the first vertex closes the polygon.
    if (this.mode === 'area' && this.points.length >= 3) {
      const first = this.toScreen(this.points[0], rect);
      if (Math.hypot(first.x - cursor.x, first.y - cursor.y) <= CLOSE_PX) {
        this.finish();
        return;
      }
    }
    // Reuse the snap the marker was already showing so the committed point
    // matches the preview; fall back to a fresh pick when the cursor jumped.
    const near = this.hover && Math.hypot(this.hover.x - cursor.x, this.hover.y - cursor.y) < 4;
    const hit = near ? this.hover : await this.pick(event);
    if (!hit || !this.enabled) return;
    if (this.mode === 'point') this.copyCoordinates(hit.point);
    this.points.push(hit.point.clone());
    this.pendingDots.push(this.makeDot(hit.point));
    if (this.points.length === 1) this.previewLabel = this.makeLabel();
    this.hover = hit;
    if (this.points.length >= this.needed) {
      this.finish();
      return;
    }
    this.rebuildPreviewLine();
    this.hint();
    this.updatePreview();
    this.world.renderer.needsUpdate = true;
  }

  /** Puts "X; Y; Z" (BIM axes, metres, point as decimal comma) on the clipboard; silent when the browser refuses. */
  copyCoordinates(point) {
    const text = [point.x, -point.z, point.y].map((value) => coordinate.format(value)).join('; ');
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  finish() {
    if (this.mode === 'area' && this.points.length < 3) return;
    this.commit(this.mode, this.points);
    this.cancelPending();
    this.hint();
  }

  handleKey(event) {
    if (event.target?.closest?.('input, textarea, select')) return;
    if (event.code === 'Escape' && this.points.length) {
      this.cancelPending();
      this.hint();
    } else if (event.code === 'Enter' && this.mode === 'area') {
      this.finish();
    } else if (event.code === 'Delete' || event.code === 'Backspace') {
      this.removeLast();
    }
  }

  commit(mode, points) {
    const pts = points.map((point) => point.clone());
    const objects = pts.length > 1 ? [this.makePolyline(mode === 'area' ? [...pts, pts[0]] : pts, false)] : [];
    pts.forEach((point) => objects.push(this.makeDot(point)));
    if (mode === 'area') {
      const fill = this.makeFill(pts);
      if (fill) objects.push(fill);
    }
    const label = this.makeLabel();
    this.items.push({ mode, points: pts, objects, label });
    this.writeLabel(label, mode, pts);
    this.onChange?.(this.items.length);
  }

  cancelPending() {
    this.points = [];
    [this.previewLine, ...this.pendingDots].forEach((object) => this.dispose(object));
    this.previewLabel?.remove();
    this.pendingDots = [];
    this.previewLine = null;
    this.previewLabel = null;
    this.world.renderer.needsUpdate = true;
  }

  removeLast() {
    const item = this.items.pop();
    if (!item) return;
    item.objects.forEach((object) => this.dispose(object));
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

  makePolyline(points, dashed) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
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

  /** Semi-transparent fill of a (near-)planar polygon, triangulated in its own plane. */
  makeFill(points) {
    const normal = polygonNormal(points);
    if (normal.lengthSq() < 1e-12) return null;
    normal.normalize();
    const axis = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = axis.cross(normal).normalize();
    const v = normal.clone().cross(u);
    const flat = points.map((point) => new THREE.Vector2(point.dot(u), point.dot(v)));
    const triangles = THREE.ShapeUtils.triangulateShape(flat, []);
    if (!triangles.length) return null;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.setIndex(triangles.flat());
    const material = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 998;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }

  /** Dashed outline through the placed points, ending at the cursor (last vertex is rewritten on move). */
  rebuildPreviewLine() {
    this.dispose(this.previewLine);
    const tail = this.hover?.point || this.start;
    this.previewLine = this.makePolyline([...this.points, tail], true);
  }

  makeLabel() {
    const label = document.createElement('div');
    label.className = 'bim-measure-label';
    this.layer.appendChild(label);
    return label;
  }

  writeLabel(label, mode, points) {
    if (mode === 'point') {
      const [p] = points;
      label.innerHTML = `<b>X ${coordinate.format(p.x)} · Y ${coordinate.format(-p.z)}</b><small>Z (cota) ${coordinate.format(p.y)} m · copiado</small>`;
    } else if (mode === 'length') {
      const [a, b] = points;
      label.innerHTML = `<b>${meters.format(a.distanceTo(b))} m</b><small>ΔX ${meters.format(Math.abs(b.x - a.x))} · ΔY ${meters.format(Math.abs(b.z - a.z))} · ΔZ ${meters.format(Math.abs(b.y - a.y))}</small>`;
    } else if (mode === 'angle') {
      const [a, vertex, c] = points;
      const first = a.clone().sub(vertex);
      const second = c.clone().sub(vertex);
      const value = first.length() && second.length() ? THREE.MathUtils.radToDeg(first.angleTo(second)) : 0;
      label.innerHTML = `<b>${degrees.format(value)}°</b><small>${meters.format(first.length())} m · ${meters.format(second.length())} m</small>`;
    } else {
      label.innerHTML = `<b>${meters.format(polygonArea(points))} m²</b><small>perímetro ${meters.format(polygonPerimeter(points))} m</small>`;
    }
  }

  /** Where a label sits: segment midpoint, angle vertex or polygon centroid. */
  anchorOf(mode, points) {
    if (mode === 'angle') return points[1];
    const sum = points.reduce((total, point) => total.add(point.clone()), new THREE.Vector3());
    return sum.multiplyScalar(1 / points.length);
  }

  updateMarker() {
    if (!this.hover) {
      this.marker.hidden = true;
      return;
    }
    this.marker.hidden = false;
    this.marker.dataset.shape = this.hover.shape;
    const p = this.hover.point;
    this.marker.dataset.label = this.mode === 'point'
      ? `${SNAP_NAMES[this.hover.shape] || ''}: X ${coordinate.format(p.x)} · Y ${coordinate.format(-p.z)} · Z ${coordinate.format(p.y)}`
      : SNAP_NAMES[this.hover.shape] || '';
    this.marker.style.transform = `translate(${this.hover.x}px, ${this.hover.y}px)`;
  }

  /** Live points of the measurement in progress, cursor included. */
  livePoints() {
    return this.hover ? [...this.points, this.hover.point] : [...this.points];
  }

  updatePreview() {
    if (!this.points.length || !this.hover || !this.previewLine) return;
    const positions = this.previewLine.geometry.attributes.position;
    positions.setXYZ(positions.count - 1, this.hover.point.x, this.hover.point.y, this.hover.point.z);
    positions.needsUpdate = true;
    this.previewLine.geometry.computeBoundingSphere();
    this.previewLine.computeLineDistances();
    const live = this.livePoints();
    const ready = this.mode === 'point' ||
      this.mode === 'length' || (this.mode === 'angle' && live.length === 3) || (this.mode === 'area' && live.length >= 3);
    this.previewLabel.style.visibility = ready ? '' : 'hidden';
    if (ready) this.writeLabel(this.previewLabel, this.mode, live);
    this.world.renderer.needsUpdate = true;
  }

  /** Keeps the HTML labels glued to their 3D anchors while the camera moves. */
  loop() {
    cancelAnimationFrame(this.frame);
    const tick = () => {
      if ((!this.enabled && !this.items.length) || (this.world && !this.world.enabled)) return;
      this.placeLabels();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  placeLabels() {
    const camera = this.world.camera.three;
    const width = this.canvasSize?.width || this.canvas.clientWidth || 1;
    const height = this.canvasSize?.height || this.canvas.clientHeight || 1;
    const place = (label, anchor) => {
      if (!label || !anchor) return;
      const projected = anchor.clone().project(camera);
      label.style.display = projected.z > -1 && projected.z < 1 ? '' : 'none';
      label.style.transform = `translate(${((projected.x + 1) / 2) * width}px, ${((1 - projected.y) / 2) * height}px) translate(-50%, -120%)`;
    };
    this.items.forEach((item) => place(item.label, this.anchorOf(item.mode, item.points)));
    if (this.points.length && this.hover) {
      const live = this.livePoints();
      place(this.previewLabel, this.mode === 'angle' ? (live.length === 3 ? live[1] : live[live.length - 1]) : this.anchorOf('area', live));
    }
  }

  setVisible(visible) {
    this.group.visible = visible;
    this.layer.style.display = visible ? '' : 'none';
  }

  get count() {
    return this.items.length;
  }
}

function polygonNormal(points) {
  const normal = new THREE.Vector3();
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    normal.x += (current.y - next.y) * (current.z + next.z);
    normal.y += (current.z - next.z) * (current.x + next.x);
    normal.z += (current.x - next.x) * (current.y + next.y);
  }
  return normal;
}

/** Newell's method: exact for planar polygons, a good estimate otherwise. */
function polygonArea(points) {
  return polygonNormal(points).length() / 2;
}

function polygonPerimeter(points) {
  return points.reduce((total, point, index) => total + point.distanceTo(points[(index + 1) % points.length]), 0);
}
