import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FragmentsModels } from '@thatopen/fragments';
import fragmentsWorkerUrl from '@thatopen/fragments/worker?url';

/**
 * Visualizador 3D mínimo dos cards da vitrine: gira, move (pan) e dá zoom.
 *
 * Usa three + Fragments direto (sem @thatopen/components), carrega um único
 * modelo geométrico (.frag) e desenha sob demanda, sem laço contínuo.
 */
export class MiniViewer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x252e3a);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(1, 2, 1.2);
    this.scene.add(sun);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.panSpeed = 0.9;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.addEventListener('change', () => this.invalidate());

    this.fragments = new FragmentsModels(fragmentsWorkerUrl);
    this.fragments.settings.maxUpdateRate = 60;
    this.model = null;
    this.dirty = true;
    this.disposed = false;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  invalidate() { this.dirty = true; }

  /**
   * "rotate": arrastar gira (botão direito, Shift ou dois dedos movem).
   * "pan": arrastar move a vista (útil no trackpad e no toque, sem botão direito).
   */
  setMode(mode) {
    const mover = mode === 'pan';
    this.controls.mouseButtons.LEFT = mover ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.RIGHT = mover ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    this.controls.touches.ONE = mover ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  async load(url) {
    const buffer = await (await fetch(url)).arrayBuffer();
    if (this.disposed) return;
    this.model = await this.fragments.load(buffer, { modelId: 'vitrine', camera: this.camera });
    this.model.object.rotation.set(0, 0, 0);
    this.scene.add(this.model.object);
    this.model.onViewUpdated.add(() => this.invalidate());
    await this.fragments.update(true);

    const caixas = await this.model.getBoxes();
    const caixa = this.robustBox(caixas);
    if (caixa.isEmpty()) caixa.setFromObject(this.model.object);
    this.frame(caixa);
    await this.fragments.update(true);
  }

  /**
   * Caixa que ignora elementos isolados muito longe do resto (comuns em exportações do Revit):
   * usa a faixa de 0,5% a 99,5% dos centros e a une às caixas desses elementos.
   */
  robustBox(caixas) {
    const caixa = new THREE.Box3();
    if (!caixas.length) return caixa;
    const centros = caixas.map((b) => b.getCenter(new THREE.Vector3()));
    const faixa = (eixo) => {
      const v = centros.map((c) => c[eixo]).sort((x, y) => x - y);
      return [v[Math.floor((v.length - 1) * 0.005)], v[Math.ceil((v.length - 1) * 0.995)]];
    };
    const [x0, x1] = faixa('x'); const [y0, y1] = faixa('y'); const [z0, z1] = faixa('z');
    caixas.forEach((b, i) => {
      const c = centros[i];
      if (c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1 && c.z >= z0 && c.z <= z1) caixa.union(b);
    });
    return caixa;
  }

  frame(caixa) {
    const centro = caixa.getCenter(new THREE.Vector3());
    const raio = Math.max(caixa.getSize(new THREE.Vector3()).length() / 2, 1);
    const distancia = raio / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.05;
    this.camera.near = Math.max(raio / 200, 0.05);
    this.camera.far = distancia * 20;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(centro).add(new THREE.Vector3(1, 0.75, 1).normalize().multiplyScalar(distancia));
    this.controls.target.copy(centro);
    this.controls.minDistance = raio * 0.3;
    this.controls.maxDistance = distancia * 3;
    this.controls.update();
    this.invalidate();
  }

  loop() {
    if (this.disposed) return;
    requestAnimationFrame(this.loop);
    const moving = this.controls.update();
    if (this.dirty || moving) {
      this.dirty = false;
      this.fragments.update();
      this.renderer.render(this.scene, this.camera);
    }
  }

  async dispose() {
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.controls.dispose();
    try { await this.fragments.dispose(); } catch { /* o worker já pode ter sido encerrado */ }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
