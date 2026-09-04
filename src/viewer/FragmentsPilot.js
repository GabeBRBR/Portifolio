import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { ObjectBVH } from 'three-mesh-bvh';
import fragmentsWorkerUrl from '@thatopen/fragments/worker?url';

const FRAGMENTS_MANIFEST = 'assets/fragments/models.json';

/**
 * Isolated Fragments proof of concept. The legacy viewer stays active by default
 * until selection, properties and walking are migrated in later phases.
 */
export class FragmentsPilot {
  constructor({ container, list, empty, properties, search, tree, walkHelp, walkCrosshair, setLoading, showStatus }) {
    this.container = container;
    this.list = list;
    this.empty = empty;
    this.properties = properties;
    this.search = search;
    this.tree = tree;
    this.walkHelp = walkHelp;
    this.walkCrosshair = walkCrosshair;
    this.setLoading = setLoading;
    this.showStatus = showStatus;
    this.loadedWork = null;
    this.modelRecords = new Map();
    this.walk = { mode: 'orbit', keys: new Set(), jumpRequested: false, velocityY: 0, grounded: false, height: 1.7, radius: 0.28, stepHeight: 0.2, gravity: 24, terminalVelocity: 28, speed: 3.8, run: 7.2, zoom: 1, lastFrame: performance.now(), mouseReleased: false, ignoreEscapeUntil: 0 };
    this.walkVectors = { down: new THREE.Vector3(0, -1, 0), forward: new THREE.Vector3(), right: new THREE.Vector3(), move: new THREE.Vector3(), next: new THREE.Vector3(), origin: new THREE.Vector3(), normal: new THREE.Vector3() };
  }

  async open(workKey = 'casa-terrea') {
    if (!this.components) await this.setup();
    this.setActive(true);
    if (this.loadedWork !== workKey) await this.loadWork(workKey);
  }

  async setup() {
    this.components = new OBC.Components();
    const worlds = this.components.get(OBC.Worlds);
    this.world = worlds.create();
    this.world.scene = new OBC.SimpleScene(this.components);
    this.world.scene.setup();
    this.world.scene.three.background = null;
    this.world.renderer = new OBC.SimpleRenderer(this.components, this.container, { antialias: true, powerPreference: 'default' });
    this.world.renderer.showLogo = false;
    this.world.renderer.mode = OBC.RendererMode.MANUAL;
    this.world.renderer.three.shadowMap.enabled = false;
    this.world.renderer.three.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
    this.world.camera = new OBC.OrthoPerspectiveCamera(this.components);
    this.components.init();
    this.walkControls = new PointerLockControls(this.world.camera.three, this.world.renderer.three.domElement);
    this.walkControls.pointerSpeed = 0.85;
    this.walkControls.addEventListener('unlock', () => this.onWalkUnlock());
    this.world.renderer.three.domElement.addEventListener('click', (event) => this.onWalkCanvasClick(event));
    this.world.renderer.three.domElement.addEventListener('wheel', (event) => this.onWalkWheel(event), { passive: false });
    window.addEventListener('keydown', (event) => this.onWalkKey(event, true));
    window.addEventListener('keyup', (event) => this.onWalkKey(event, false));

    this.fragments = this.components.get(OBC.FragmentsManager);
    // Vite emits this dependency as a local worker asset, keeping Pages/CDN-independent.
    this.fragments.init(fragmentsWorkerUrl);
    // Normalize the work close to the render origin. Some Revit exports (the
    // galpao in particular) retain large survey coordinates that push the
    // WebGL camera/culling precision beyond a practical range.
    this.fragments.core.settings.autoCoordinate = true;
    this.highlighter = this.components.get(OBCF.Highlighter);
    this.highlighter.setup({
      world: this.world,
      selectMaterialDefinition: { color: new THREE.Color('#2474c6'), opacity: 0.8, transparent: false, preserveOriginalMaterial: true },
      zoomToSelection: false
    });
    this.highlighter.events.select.onHighlight.add((selection) => this.inspectSelection(selection));
    this.highlighter.events.select.onClear.add(() => this.renderEmptyProperties());
    this.fragments.list.onItemSet.add(({ value: model }) => {
      model.useCamera(this.world.camera.three);
      this.world.scene.three.add(model.object);
      this.fragments.core.update(true);
      this.world.renderer.needsUpdate = true;
    });
    this.world.camera.controls.addEventListener('update', () => {
      this.fragments.core.update();
      this.world.renderer.needsUpdate = true;
    });
    await this.world.camera.controls.setLookAt(18, 14, 18, 0, 0, 0);
    this.animateWalk();
  }

  async loadWork(workKey) {
    const workName = workKey === 'galpao' ? 'Galpão Industrial' : 'Casa Térrea';
    this.setLoading(true, `Carregando ${workName} otimizado…`, 0);
    this.list.innerHTML = '';
    this.empty.classList.add('hidden');
    const response = await fetch(FRAGMENTS_MANIFEST);
    if (!response.ok) throw new Error(`manifesto Fragments não encontrado (${response.status})`);
    const manifest = await response.json();
    const models = manifest.models.filter((model) => model.work === workKey);
    if (!models.length) throw new Error(`nenhum modelo otimizado encontrado para ${workName}`);
    if (this.loadedWork) {
      for (const modelId of [...this.fragments.list.keys()]) await this.fragments.core.disposeModel(modelId);
      this.modelRecords.clear();
    }
    for (let index = 0; index < models.length; index += 1) {
      const model = models[index];
      try {
        this.setLoading(true, `Carregando ${model.discipline} otimizado…`, Math.round((index / models.length) * 100));
        const fragmentResponse = await fetch(model.fragment);
        if (!fragmentResponse.ok) throw new Error(`arquivo otimizado não encontrado (${fragmentResponse.status})`);
        await this.fragments.core.load(await fragmentResponse.arrayBuffer(), { modelId: model.id });
        // Explicitly attach the root as some generated fragments use batched
        // geometry and do not expose a regular Mesh child at first.
        const loadedModel = this.fragments.list.get(model.id);
        if (loadedModel) {
          loadedModel.useCamera(this.world.camera.three);
          this.world.scene.three.add(loadedModel.object);
          loadedModel.object.visible = true;
          await this.hideSpaces(loadedModel);
        }
        this.modelRecords.set(model.id, { ...model, visible: true });
      } catch (error) {
        this.showStatus(`Piloto Fragments: não foi possível carregar ${model.discipline}: ${error.message}`);
      }
    }
    this.loadedWork = workKey;
    this.setLoading(false);
    this.renderModels(workName);
    this.renderTree(workName);
    this.buildCollisionProxy();
    await this.fit();
    this.showStatus(`${workName} otimizado ativo: órbita e zoom usam culling/LOD. Seleção, cortes e caminhada continuam no motor atual nesta fase.`);
  }

  renderModels(workName) {
    this.list.innerHTML = '';
    this.empty.classList.toggle('hidden', this.modelRecords.size > 0);
    this.modelRecords.forEach((record) => {
      const row = document.createElement('div');
      row.className = 'ifc-model-row';
      row.innerHTML = `<input type="checkbox" ${record.visible ? 'checked' : ''} aria-label="Mostrar ${record.discipline}"><div><strong>${record.discipline}</strong><small>Fragments · ${(record.fragmentBytes / 1024).toFixed(0)} KB</small><button class="ifc-model-isolate" type="button">Isolar disciplina</button></div>`;
      row.querySelector('input').addEventListener('change', (event) => this.setModelVisibility(record.id, event.target.checked));
      row.querySelector('.ifc-model-isolate').addEventListener('click', () => this.isolateModel(record.id));
      this.list.append(row);
    });
    this.showStatus(`${workName}: ${this.modelRecords.size} disciplina(s) em Fragments. Clique em um elemento para consultar dados BIM.`);
  }

  renderTree(workName, selected = null) {
    if (!this.tree) return;
    const disciplines = [...this.modelRecords.values()].map((record) => `<li>${this.escape(record.discipline)} <span>(${this.escape(record.id)})</span></li>`).join('');
    const selectedLine = selected ? `<li>Elemento: ${this.escape(selected.type || 'IFC')} · ${this.escape(selected.name || 'Sem nome')}</li>` : '<li>Selecione um elemento para revelar sua classe e relações espaciais.</li>';
    this.tree.innerHTML = `<details open><summary>Estrutura BIM</summary><ul><li>Projeto: ${this.escape(workName)}<ul>${disciplines}</ul></li>${selectedLine}</ul></details>`;
    this.tree.classList.remove('hidden');
  }

  async setModelVisibility(modelId, visible) {
    const record = this.modelRecords.get(modelId);
    const model = this.fragments.list.get(modelId);
    if (!record || !model) return;
    record.visible = visible;
    model.object.visible = visible;
    this.buildCollisionProxy();
    if (!visible) await this.clearSelection();
    this.fragments.core.update(true);
    this.world.renderer.needsUpdate = true;
  }

  async isolateModel(modelId) {
    this.modelRecords.forEach((record, id) => {
      const visible = id === modelId;
      record.visible = visible;
      const model = this.fragments.list.get(id);
      if (model) model.object.visible = visible;
    });
    this.renderModels(this.loadedWork === 'galpao' ? 'Galpão Industrial' : 'Casa Térrea');
    await this.clearSelection();
    this.buildCollisionProxy();
    this.fragments.core.update(true);
    this.world.renderer.needsUpdate = true;
  }

  buildCollisionProxy() {
    const roots = [...this.fragments.list.entries()]
      .filter(([modelId]) => this.modelRecords.get(modelId)?.visible)
      .map(([, model]) => model.object);
    this.collisionProxy = roots.length ? new ObjectBVH(roots, { precise: false, includeInstances: true }) : null;
  }

  async hideSpaces(model) {
    const byCategory = await model.getItemsOfCategories([/^IFCSPACE$/i]);
    const spaces = Object.values(byCategory).flat();
    if (spaces.length) await model.setVisible(spaces, false);
  }

  startWalkPlacement() {
    if (!this.collisionProxy) return this.showStatus('Aguarde o carregamento de uma disciplina para iniciar a caminhada.');
    this.clearSelection();
    // The highlighter also listens to canvas clicks. Disable it before the
    // placement click so it is reserved exclusively for choosing the floor.
    if (this.highlighter) this.highlighter.enabled = false;
    this.walk.mode = 'placement';
    this.world.camera.controls.enabled = false;
    this.world.renderer.three.domElement.classList.add('ifc-place-cursor');
    this.walkHelp?.classList.remove('hidden');
    this.walkCrosshair?.classList.add('hidden');
    this.showStatus('Clique em um piso para posicionar-se. Depois use WASD, Espaço para pular e Shift para correr.');
  }

  async exitWalk({ fit = true } = {}) {
    const wasWalking = this.walk.mode !== 'orbit';
    this.walk.mode = 'orbit';
    this.walk.keys.clear();
    this.walk.jumpRequested = false;
    this.walk.velocityY = 0;
    if (this.walkControls?.isLocked) this.walkControls.unlock();
    if (this.highlighter) this.highlighter.enabled = true;
    this.world?.camera && (this.world.camera.controls.enabled = true);
    this.world?.renderer?.three.domElement.classList.remove('ifc-place-cursor');
    this.walkHelp?.classList.add('hidden');
    this.walkCrosshair?.classList.add('hidden');
    if (wasWalking && fit) await this.fit();
    if (wasWalking) this.showStatus('Caminhada encerrada. Órbita e zoom restaurados.');
  }

  async onWalkCanvasClick(event) {
    if (this.walk.mode === 'placement') {
      const hit = await this.pickWalkSurface(event);
      const normal = hit?.normal;
      // Revit's Generic Models frequently arrive with their triangulation
      // winding reversed. A horizontal slab is still a valid floor whether
      // its exported normal points up or down.
      if (!hit || !normal || Math.abs(normal.y) < 0.55) return this.showStatus('Escolha uma superfície aproximadamente horizontal para iniciar a caminhada.');
      this.world.camera.three.position.copy(hit.point).addScaledVector(this.walkVectors.normal.set(0, 1, 0), this.walk.height);
      // At this point the visible tiles beneath the chosen floor are loaded,
      // so the inexpensive BVH proxy can be rebuilt once for motion physics.
      this.buildCollisionProxy();
      this.walk.velocityY = 0;
      this.walk.grounded = true;
      this.walk.mode = 'walk';
      this.walkHelp?.classList.add('hidden');
      this.walkCrosshair?.classList.remove('hidden');
      this.world.renderer.three.domElement.classList.remove('ifc-place-cursor');
      this.walkControls.lock(true);
      return;
    }
    if (this.walk.mode === 'walk' && !this.walkControls.isLocked) {
      this.walk.mouseReleased = false;
      this.walkControls.lock(true);
    }
  }

  onWalkUnlock() {
    if (this.walk.mode !== 'walk') return;
    this.walk.keys.clear();
    this.walk.jumpRequested = false;
    this.walk.mouseReleased = true;
    this.walk.ignoreEscapeUntil = performance.now() + 150;
    this.showStatus('Mouse liberado. Clique no modelo para continuar caminhando ou pressione Esc novamente para sair.');
  }

  onWalkWheel(event) {
    if (this.walk.mode !== 'walk' || !this.walkControls?.isLocked) return;
    event.preventDefault();
    this.walk.zoom = THREE.MathUtils.clamp(this.walk.zoom - event.deltaY * 0.0015, 0.65, 2.5);
    this.world.camera.three.zoom = this.walk.zoom;
    this.world.camera.three.updateProjectionMatrix();
    this.world.renderer.needsUpdate = true;
  }

  onWalkKey(event, down) {
    if (this.walk.mode !== 'walk') return;
    if (event.code === 'Escape' && down) {
      if (this.walkControls?.isLocked) this.walkControls.unlock();
      else if (performance.now() >= this.walk.ignoreEscapeUntil) this.exitWalk();
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      if (down && !event.repeat) this.walk.jumpRequested = true;
      return;
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      event.preventDefault();
      if (down) this.walk.keys.add(event.code); else this.walk.keys.delete(event.code);
    }
  }

  pickCollision(event) {
    if (!this.collisionProxy) return null;
    const rect = this.world.renderer.three.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.firstHitOnly = true;
    raycaster.setFromCamera(mouse, this.world.camera.three);
    return this.collisionProxy.raycast(raycaster, [])[0] || null;
  }

  async pickWalkSurface(event) {
    const rect = this.world.renderer.three.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    const dom = this.world.renderer.three.domElement;
    const hits = await Promise.all([...this.fragments.list.entries()]
      .filter(([modelId]) => this.modelRecords.get(modelId)?.visible)
      .map(([, model]) => model.raycast({ camera: this.world.camera.three, mouse, dom })));
    return hits.filter(Boolean).sort((a, b) => a.distance - b.distance)[0] || null;
  }

  collisionRay(origin, direction, far) {
    if (!this.collisionProxy) return null;
    const raycaster = new THREE.Raycaster(origin, direction, 0, far);
    raycaster.firstHitOnly = true;
    return this.collisionProxy.raycast(raycaster, [])[0] || null;
  }

  floorBelow(position, lift = 0, maxDrop = 6) {
    const origin = this.walkVectors.origin.copy(position);
    origin.y -= this.walk.height - lift;
    const hit = this.collisionRay(origin, this.walkVectors.down, lift + maxDrop);
    if (!hit?.face) return null;
    const normal = this.walkVectors.normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    return Math.abs(normal.y) > 0.55 ? hit : null;
  }

  hitsWall(position, direction, distance) {
    if (!distance) return false;
    const feet = position.y - this.walk.height;
    return [0.2, this.walk.height * 0.55, this.walk.height - 0.12].some((height) => {
      const origin = this.walkVectors.origin.copy(position).addScaledVector(direction, 0.01);
      origin.y = feet + height;
      const hit = this.collisionRay(origin, direction, distance + this.walk.radius);
      if (!hit?.face || hit.distance >= distance + this.walk.radius) return false;
      return Math.abs(this.walkVectors.normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).y) < 0.55;
    });
  }

  updateWalk(delta) {
    if (this.walk.mode !== 'walk' || !this.walkControls?.isLocked) return;
    if (this.walk.jumpRequested && this.walk.grounded) {
      this.walk.velocityY = 8.5;
      this.walk.grounded = false;
    }
    this.walk.jumpRequested = false;
    const speed = this.walk.keys.has('ShiftLeft') || this.walk.keys.has('ShiftRight') ? this.walk.run : this.walk.speed;
    const forwardInput = Number(this.walk.keys.has('KeyW')) - Number(this.walk.keys.has('KeyS'));
    const sideInput = Number(this.walk.keys.has('KeyD')) - Number(this.walk.keys.has('KeyA'));
    const { move, forward, right, next } = this.walkVectors;
    this.walkControls.getDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0.0001) forward.normalize();
    right.set(-forward.z, 0, forward.x);
    move.copy(forward).multiplyScalar(forwardInput).addScaledVector(right, sideInput);
    if (move.lengthSq()) {
      move.normalize().multiplyScalar(speed * delta);
      next.copy(this.world.camera.three.position).add(move);
      const feet = this.world.camera.three.position.y - this.walk.height;
      const step = this.floorBelow(next, this.walk.stepHeight + 0.06);
      const stepY = step?.point.y;
      const canStep = this.walk.grounded && stepY !== undefined && stepY >= feet - 0.08 && stepY <= feet + this.walk.stepHeight;
      if (!this.hitsWall(this.world.camera.three.position, move.clone().normalize(), move.length()) || canStep) {
        this.world.camera.three.position.x = next.x;
        this.world.camera.three.position.z = next.z;
        if (canStep) {
          this.world.camera.three.position.y = stepY + this.walk.height;
          this.walk.velocityY = 0;
          this.walk.grounded = true;
        }
      }
    }
    this.walk.velocityY = Math.max(this.walk.velocityY - this.walk.gravity * delta, -this.walk.terminalVelocity);
    const feet = this.world.camera.three.position.y - this.walk.height;
    const floor = this.floorBelow(this.world.camera.three.position, this.walk.stepHeight + 0.08);
    const floorY = floor?.point.y;
    const nextY = this.world.camera.three.position.y + this.walk.velocityY * delta;
    if (floorY !== undefined && this.walk.velocityY <= 0 && floorY <= feet + 0.08 && nextY - this.walk.height <= floorY) {
      this.world.camera.three.position.y = floorY + this.walk.height;
      this.walk.velocityY = 0;
      this.walk.grounded = true;
    } else {
      this.world.camera.three.position.y = nextY;
      this.walk.grounded = false;
    }
    this.world.renderer.needsUpdate = true;
  }

  animateWalk() {
    requestAnimationFrame(() => this.animateWalk());
    const now = performance.now();
    const delta = Math.min(0.05, (now - this.walk.lastFrame) / 1000);
    this.walk.lastFrame = now;
    this.updateWalk(delta);
  }

  async fit() {
    if (!this.world) return;
    const meshes = [];
    this.fragments?.list.forEach((model, modelId) => {
      if (!this.modelRecords.get(modelId)?.visible) return;
      model.object.traverse((object) => {
        if ((object.isMesh || object.isInstancedMesh || object.isBatchedMesh) && object.visible) meshes.push(object);
      });
    });
    if (!meshes.length) return;

    // Do not use camera.fit() here: it also merges auxiliary component boxes
    // and uses the largest dimension as a radius, which puts the galpao very
    // far away. Build a bounding box from the visible Fragment meshes only.
    const bounds = new THREE.Box3();
    for (const mesh of meshes) {
      const geometry = mesh.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (!geometry.boundingBox) continue;
      bounds.union(geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    }
    if (bounds.isEmpty()) return;
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.65;
    await this.world.camera.controls.fitToSphere(new THREE.Sphere(center, Math.max(radius, 1)), false);
    this.fragments.core.update(true);
    this.world.renderer.needsUpdate = true;
  }

  async inspectSelection(selection) {
    const first = Object.entries(selection).find(([, localIds]) => localIds.size);
    if (!first) return this.renderEmptyProperties();
    const [modelId, localIds] = first;
    const localId = [...localIds][0];
    this.properties.innerHTML = '<p class="ifc-empty-copy">Consultando propriedades BIM…</p>';
    try {
      const dataByModel = await this.fragments.getData({ [modelId]: new Set([localId]) }, {
        attributesDefault: true,
        // Keep the inspection scoped to this item. IsDefinedBy carries its
        // Psets/quantities; expanding containment or decomposition would pull
        // the wider model graph into this panel.
        relations: { IsDefinedBy: { attributes: true, relations: true } }
      });
      const item = dataByModel[modelId]?.[0];
      if (!item) throw new Error('dados do elemento não foram encontrados no Fragment');
      const record = this.modelRecords.get(modelId);
      const directRows = [];
      const propertyRows = [];
      Object.entries(item).forEach(([key, value]) => {
        if (key === 'IsDefinedBy') this.flattenItem(value, '', propertyRows, new WeakSet(), 0, 4, 120);
        else this.flattenItem(value, key, directRows, new WeakSet(), 0, 1, 40);
      });
      const identityKeys = new Set(['Entity', 'Name', 'ObjectType', 'Tag', 'GlobalId', 'expressID']);
      const identity = {
        'Model ID': modelId,
        'Local ID': localId,
        Disciplina: record?.discipline || '—'
      };
      const details = {};
      for (const { key, value } of directRows) {
        const target = identityKeys.has(key) ? identity : details;
        target[key] = value;
      }
      if (!identity['Classe IFC'] && identity.Entity) identity['Classe IFC'] = identity.Entity;
      const psets = Object.fromEntries(propertyRows.map(({ key, value }) => [key, value]));
      this.properties.innerHTML = this.renderPropertyGroups({ Identificação: identity, Atributos: details, 'Property Sets e quantidades': psets });
      this.renderTree(this.loadedWork === 'galpao' ? 'Galpão Industrial' : 'Casa Térrea', { type: identity.Entity || identity['Classe IFC'], name: identity.Name });
      this.filterProperties();
    } catch (error) {
      this.properties.innerHTML = `<p class="ifc-empty-copy">Não foi possível obter as propriedades: ${this.escape(error.message)}</p>`;
    }
  }

  flattenItem(value, prefix, output, visited = new WeakSet(), depth = 0, maxDepth = 4, maxRows = 120) {
    if (value === null || value === undefined || depth > maxDepth || output.length >= maxRows) return;
    if (typeof value !== 'object') {
      output.push({ key: prefix || 'Valor', value: String(value) });
      return;
    }
    if (visited.has(value)) return;
    visited.add(value);
    if (Object.prototype.hasOwnProperty.call(value, 'value')) {
      const plain = value.value;
      if (plain === null || plain === undefined || typeof plain !== 'object') output.push({ key: prefix || 'Valor', value: plain ?? '—' });
      else this.flattenItem(plain, prefix, output, visited, depth + 1, maxDepth, maxRows);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => this.flattenItem(entry, prefix ? `${prefix} ${index + 1}` : `Item ${index + 1}`, output, visited, depth + 1, maxDepth, maxRows));
      return;
    }
    Object.entries(value).forEach(([key, nested]) => this.flattenItem(nested, prefix ? `${prefix} › ${key}` : key, output, visited, depth + 1, maxDepth, maxRows));
  }

  renderPropertyGroups(groups) {
    return Object.entries(groups).map(([title, values]) => {
      const entries = Object.entries(values).filter(([, value]) => value !== undefined);
      if (!entries.length) return '';
      return `<section class="ifc-property-group"><h3>${this.escape(title)}</h3>${entries.map(([key, value]) => `<dl class="ifc-property-row"><dt>${this.escape(key)}</dt><dd>${this.escape(value)}</dd></dl>`).join('')}</section>`;
    }).join('');
  }

  renderEmptyProperties() {
    if (!this.properties) return;
    this.properties.innerHTML = '<p class="ifc-empty-copy">Selecione um elemento no modelo para consultar seus dados IFC.</p>';
    if (this.search) this.search.value = '';
    this.renderTree(this.loadedWork === 'galpao' ? 'Galpão Industrial' : 'Casa Térrea');
  }

  async clearSelection() {
    if (this.highlighter) await this.highlighter.clear('select');
    this.renderEmptyProperties();
  }

  filterProperties() {
    const query = this.search?.value.trim().toLocaleLowerCase('pt-BR') || '';
    this.properties.querySelectorAll('.ifc-property-row').forEach((row) => row.classList.toggle('is-hidden', !!query && !row.textContent.toLocaleLowerCase('pt-BR').includes(query)));
  }

  escape(value) {
    return String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }

  setActive(active) {
    if (!this.components) return;
    if (!active && this.walk.mode !== 'orbit') this.exitWalk({ fit: false });
    this.components.enabled = active;
    this.world.enabled = active;
    if (active) this.world.renderer.needsUpdate = true;
  }
}
