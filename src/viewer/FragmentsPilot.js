import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { LodMode } from '@thatopen/fragments';
import fragmentsWorkerUrl from '@thatopen/fragments/worker?url';
import { FragmentCache } from './storage/FragmentCache.js';

const FRAGMENTS_MANIFEST = 'assets/fragments/models.json';
const MAX_LOCAL_MODELS = 3;
const MAX_TOTAL_MODELS = 8;
const MAX_LOCAL_FILE_BYTES = 200 * 1024 ** 2;
const MAX_LOCAL_COLLISION_TRIANGLES = 150000;
// `IfcImporter` appends `web-ifc.wasm` to this directory. copy-assets.mjs
// deliberately publishes that filename under a stable Vite-base-aware path.
const WEB_IFC_WASM_DIRECTORY = `${import.meta.env.BASE_URL}assets/wasm/`;

/**
 * Isolated Fragments proof of concept. The legacy viewer stays active by default
 * until selection, properties and walking are migrated in later phases.
 */
export class FragmentsPilot {
  constructor({ container, list, empty, properties, search, tree, walkHelp, walkCrosshair, setLoading, showStatus, onWalkDebug }) {
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
    this.onWalkDebug = onWalkDebug;
    this.loadedWork = null;
    this.modelRecords = new Map();
    this.fragmentCache = new FragmentCache();
    this.ifcLoader = null;
    this.collisionBounds = new THREE.Box3();
    // The player is intentionally independent from the camera. CameraControls
    // owns the orbit camera, while PointerLockControls owns only its rotation.
    // Keeping a feet position here prevents either control from restoring an
    // old orbit position in the first frame after a teleport.
    this.walk = {
      mode: 'orbit', keys: new Set(), jumpRequested: false, velocityY: 0,
      // 44 cm is deliberately narrower than the previous 72 cm collision
      // diameter. IFC doors commonly have a clear opening of 60–70 cm after
      // their frames are exported; the old capsule therefore blocked a real
      // doorway even after IFCDOOR itself was excluded from collision.
      grounded: false, height: 1.7, bodyHeight: 1.9, radius: 0.22, stepHeight: 0.2,
      gravity: 24, terminalVelocity: 28, speed: 3.8, run: 7.2, zoom: 1,
      lastFrame: performance.now(), accumulator: 0, fixedStep: 1 / 60,
      mouseReleased: false, ignoreEscapeUntil: 0, airborneSince: 0,
      feet: new THREE.Vector3(), lastSafeFeet: new THREE.Vector3(), spawnFeet: new THREE.Vector3(),
      hasSafeFeet: false, worldMinY: -Infinity, lastDebugAt: 0, lastFloorY: null,
      lastFragmentsUpdate: 0
    };
    this.walkVectors = {
      down: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 1, 0),
      forward: new THREE.Vector3(), right: new THREE.Vector3(), move: new THREE.Vector3(),
      next: new THREE.Vector3(), origin: new THREE.Vector3(), normal: new THREE.Vector3(),
      cameraPosition: new THREE.Vector3(), capsuleStart: new THREE.Vector3(),
      capsuleCorrection: new THREE.Vector3(), trianglePoint: new THREE.Vector3(),
      capsulePoint: new THREE.Vector3(), capsuleDirection: new THREE.Vector3(),
      capsuleSegment: new THREE.Line3(), capsuleBox: new THREE.Box3()
    };
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
    this.world.renderer = new OBC.SimpleRenderer(this.components, this.container, {
      antialias: true,
      powerPreference: 'default',
      // The first-person camera needs a very close near plane and a long BIM
      // view distance. Logarithmic depth avoids slicing/z-fighting geometry at
      // the screen edges under that large depth range.
      logarithmicDepthBuffer: true
    });
    this.world.renderer.showLogo = false;
    this.world.renderer.mode = OBC.RendererMode.MANUAL;
    this.world.renderer.three.shadowMap.enabled = false;
    this.world.renderer.three.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
    this.world.camera = new OBC.OrthoPerspectiveCamera(this.components);
    this.components.init();
    // The default far plane is intentionally conservative for small BIM
    // views. A first-person camera needs enough depth to see the next room or
    // bay before entering it; this only changes clipping, not the LOD policy.
    const renderCamera = this.world.camera.three;
    renderCamera.near = Math.min(renderCamera.near || 0.1, 0.025);
    renderCamera.far = Math.max(renderCamera.far || 0, 2500);
    renderCamera.updateProjectionMatrix();
    // Uses Fragments' GPU picker directly. Unlike a per-model worker raycast,
    // this is tied to the rendered pixel the user actually clicked.
    this.sceneRaycaster = this.components.get(OBC.Raycasters).get(this.world);
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
    // Fragments refreshes camera-driven visibility at most every 100 ms by
    // default. That is acceptable for orbit, but creates noticeable pop-in
    // when a player turns quickly. 40 ms stays below 25 updates/s while
    // letting the worker prefetch the player's forward view.
    this.fragments.core.settings.maxUpdateRate = 40;
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
        const colliderData = model.collider ? await this.loadCollider(model.collider) : null;
        this.modelRecords.set(model.id, { ...model, visible: true, colliderData });
      } catch (error) {
        this.showStatus(`Piloto Fragments: não foi possível carregar ${model.discipline}: ${error.message}`);
      }
    }
    this.loadedWork = workKey;
    this.setLoading(false);
    this.renderModels(workName);
    this.renderTree(workName);
    await this.fit();
    this.fragments.core.update(true);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    this.buildCollisionProxy();
    this.showStatus(`${workName} otimizado ativo: órbita e zoom usam culling/LOD. Seleção, cortes e caminhada continuam no motor atual nesta fase.`);
  }

  async addFiles(fileList) {
    const files = [...(fileList || [])].filter((file) => /\.ifc$/i.test(file.name));
    if (!files.length) return this.showStatus('Selecione um ou mais arquivos no formato IFC.');
    const localCount = [...this.modelRecords.values()].filter((record) => record.source === 'local').length;
    if (localCount + files.length > MAX_LOCAL_MODELS) return this.showStatus(`Você pode manter até ${MAX_LOCAL_MODELS} IFCs locais nesta sessão.`);
    if (this.modelRecords.size + files.length > MAX_TOTAL_MODELS) return this.showStatus(`Limite de ${MAX_TOTAL_MODELS} modelos atingido. Remova um IFC local antes de adicionar outro.`);

    const failures = [];
    let imported = 0;
    for (let index = 0; index < files.length; index += 1) {
      try {
        await this.addLocalIfc(files[index], index, files.length);
        imported += 1;
      } catch (error) {
        console.error('Falha ao importar IFC local:', error);
        failures.push(`${files[index].name}: ${error.message || 'arquivo IFC inválido'}`);
      }
    }
    this.setLoading(false);
    this.renderModels(this.loadedWork === 'galpao' ? 'Galpão Industrial' : 'Casa Térrea');
    this.renderTree(this.loadedWork === 'galpao' ? 'Galpão Industrial' : 'Casa Térrea');
    if (imported) await this.fit();
    if (failures.length) {
      const prefix = imported ? `${imported} IFC(s) aberto(s). ` : 'Nenhum IFC foi aberto. ';
      this.showStatus(`${prefix}${failures.join(' · ')}.`);
    }
  }

  async addLocalIfc(file, index, total) {
    if (file.size > MAX_LOCAL_FILE_BYTES) throw new Error('o arquivo excede 200 MB; escolha um IFC menor para evitar falta de memória');
    this.setLoading(true, `Lendo ${file.name}…`, Math.round((index / total) * 100));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const sourceBuffer = await file.arrayBuffer();
    const hash = await this.hashBuffer(sourceBuffer);
    const modelId = `local-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${index}`}`;
    const cached = hash ? await this.tryGetCachedFragment(hash) : null;
    let model;

    if (cached?.buffer) {
      this.setLoading(true, `Abrindo ${file.name} do cache local…`, Math.round(((index + 0.65) / total) * 100));
      await this.fragments.core.load(cached.buffer, { modelId });
      model = this.fragments.list.get(modelId);
    } else {
      const loader = await this.ensureIfcLoader();
      this.setLoading(true, `Convertendo ${file.name} no navegador…`, Math.round(((index + 0.1) / total) * 100));
      // Keep the same global-coordinate policy used by the hosted Fragments.
      // Passing false here made some Revit exports remain at their survey
      // coordinates, outside the practical camera/culling range.
      model = await loader.load(new Uint8Array(sourceBuffer), true, modelId, {
        processData: {
          progressCallback: (progress) => {
            const current = Math.max(0, Math.min(1, Number(progress) || 0));
            this.setLoading(true, `Convertendo ${file.name} no navegador…`, Math.round(((index + 0.1 + current * 0.8) / total) * 100));
          }
        }
      });
      // Caching is intentionally best-effort: quota/private-mode failures must
      // not turn a successfully converted local IFC into a failed import.
      if (hash) void this.cacheFragment(hash, file, model);
    }

    if (!model || !this.fragments.list.has(modelId)) throw new Error('o conversor não registrou um modelo visualizável');
    model.useCamera(this.world.camera.three);
    this.world.scene.three.add(model.object);
    model.object.visible = true;
    await this.hideSpaces(model);
    // A Fragment is made from BatchedMesh instances. Let the manager apply its
    // final transforms before sampling it for the walking proxy; otherwise a
    // locally imported floor can be rendered in one place and collided with in
    // another (usually around the old orbit origin).
    await this.fragments.core.update(true);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    model.object.updateWorldMatrix(true, true);
    this.modelRecords.set(modelId, {
      id: modelId,
      discipline: file.name,
      name: file.name,
      source: 'local',
      size: file.size,
      fragmentBytes: cached?.buffer?.byteLength || 0,
      visible: true,
      colliderData: await this.createLocalCollisionData(model),
      cacheHash: hash
    });
    this.buildCollisionProxy();
    this.world.renderer.needsUpdate = true;
    this.showStatus(`${file.name} foi convertido localmente${cached ? ' a partir do cache' : ''}. Nenhum arquivo foi enviado ao servidor.`);
  }

  async ensureIfcLoader() {
    if (this.ifcLoader) return this.ifcLoader;
    // That Open IfcLoader API: https://docs.thatopen.com/api/@thatopen/components/classes/IfcLoader
    // `autoSetWasm: false` keeps the converter offline and points it at the
    // stable local directory expected by IfcImporter instead of a CDN.
    this.ifcLoader = this.components.get(OBC.IfcLoader);
    await this.ifcLoader.setup({
      autoSetWasm: false,
      wasm: { path: WEB_IFC_WASM_DIRECTORY, absolute: true }
    });
    return this.ifcLoader;
  }

  async tryGetCachedFragment(hash) {
    try {
      return await this.fragmentCache.get(hash);
    } catch (error) {
      console.warn('Cache local indisponível:', error);
      return null;
    }
  }

  async cacheFragment(hash, file, model) {
    try {
      const buffer = await model.getBuffer(false);
      await this.fragmentCache.put({ hash, buffer, name: file.name, sourceBytes: file.size, fragmentBytes: buffer.byteLength, createdAt: Date.now() });
    } catch (error) {
      console.warn('Não foi possível salvar o Fragment no cache local:', error);
    }
  }

  async hashBuffer(buffer) {
    if (!globalThis.crypto?.subtle) return null;
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  }

  guessDiscipline(name) {
    const upper = name.toUpperCase();
    return /EST|STR/.test(upper) ? 'Estrutural' : /ELE|HID|MEP|HVAC/.test(upper) ? 'MEP' : 'IFC local';
  }

  async createLocalCollisionData(model) {
    // Hosted models have a compact collider generated during the build. For a
    // user-selected IFC we create an equivalent, decimated proxy once at load
    // time. It is never rebuilt by the walking loop.
    const excludedIds = await this.getLocalCollisionExcludedIds(model);
    // A local IFC may export furniture, finishes and even rugs as generic
    // building elements. Collision must be opt-in: temporarily retain only
    // navigable construction categories while sampling the static proxy.
    // Otherwise a thin object's vertical faces become an invisible wall.
    if (excludedIds.length) {
      await model.setVisible(excludedIds, false);
      await this.fragments.core.update(true);
    }
    model.object.updateWorldMatrix(true, true);
    try {
      let triangleCount = 0;
      this.forEachLocalCollisionSource(model, ({ count }) => {
        triangleCount += Math.floor(count / 3);
      });
      if (!triangleCount) return this.createLocalBoundsFloor(model);

      const stride = Math.max(1, Math.ceil(triangleCount / MAX_LOCAL_COLLISION_TRIANGLES));
      const maxVertices = Math.min(triangleCount, MAX_LOCAL_COLLISION_TRIANGLES) * 3;
      const floors = new Float32Array(maxVertices * 3);
      const obstacles = new Float32Array(maxVertices * 3);
      let floorValues = 0;
      let obstacleValues = 0;
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      const normal = new THREE.Vector3();

      this.forEachLocalCollisionSource(model, ({ position, index, start, count, matrixWorld }) => {
        for (let offset = 0; offset + 2 < count; offset += 3 * stride) {
          const vertexOffset = start + offset;
          const ia = index ? index.getX(vertexOffset) : vertexOffset;
          const ib = index ? index.getX(vertexOffset + 1) : vertexOffset + 1;
          const ic = index ? index.getX(vertexOffset + 2) : vertexOffset + 2;
          a.fromBufferAttribute(position, ia).applyMatrix4(matrixWorld);
          b.fromBufferAttribute(position, ib).applyMatrix4(matrixWorld);
          c.fromBufferAttribute(position, ic).applyMatrix4(matrixWorld);
          normal.subVectors(b, a).cross(this.walkVectors.next.subVectors(c, a));
          if (normal.lengthSq() < 1e-10) continue;
          normal.normalize();
          // Horizontal faces support the player even when the authoring tool
          // exported their winding downward. Reversing the two last vertices
          // gives floor raycasts a consistent upward-facing normal.
          const isFloor = Math.abs(normal.y) > 0.45;
          const target = isFloor ? floors : obstacles;
          let write = isFloor ? floorValues : obstacleValues;
          if (write + 9 > target.length) continue;
          if (isFloor && normal.y < 0) target.set([a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z], write);
          else target.set([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], write);
          if (isFloor) floorValues += 9; else obstacleValues += 9;
        }
      });
      const makeSource = (positions, length) => {
        const compact = positions.slice(0, length);
        const indices = new Uint32Array(compact.length / 3);
        for (let index = 0; index < indices.length; index += 1) indices[index] = index;
        return { positions: compact, indices };
      };
      const fallback = floorValues ? null : this.createLocalBoundsFloor(model);
      return {
        floors: floorValues ? makeSource(floors, floorValues) : fallback.floors,
        obstacles: makeSource(obstacles, obstacleValues)
      };
    } finally {
      if (excludedIds.length) {
        await model.setVisible(excludedIds, true);
        await this.hideSpaces(model);
        await this.fragments.core.update(true);
      }
    }
  }

  async getLocalCollisionExcludedIds(model) {
    // Local imports have no precomputed collider with per-item metadata. Use
    // a conservative allow-list of construction classes instead of attempting
    // to infer physicality from generic Revit families. In particular, do not
    // include IFCBUILDINGELEMENTPROXY, IFCBEAM or IFCMEMBER: the CREA IFC uses
    // those classes for a rug, appliances, TV, roof tiles and ceiling framing.
    const solid = '(?:IFCWALL(?:STANDARDCASE)?|IFCCOLUMN|IFCCURTAINWALL|IFCSLAB|IFCSTAIR(?:FLIGHT)?|IFCRAMP|IFCFOOTING|IFCPAVEMENT)';
    const nonSolidCategory = new RegExp(`^IFC(?!${solid}$).+`, 'i');
    const byCategory = await model.getItemsOfCategories([nonSolidCategory]);
    return [...new Set(Object.values(byCategory).flat())];
  }

  forEachLocalCollisionSource(model, callback) {
    // Fragments render most IFC elements through THREE.BatchedMesh. Its shared
    // vertex buffer stores every shape at local coordinates while every element
    // has its own instance matrix. Sampling only object.matrixWorld made local
    // IFCSLAB floors generate a collider at the wrong place. Include those
    // per-instance matrices (and InstancedMesh for compatibility) here.
    model.object.traverse((object) => {
      const geometry = object.geometry;
      const position = geometry?.getAttribute?.('position');
      if (!position?.count) return;
      const index = geometry.index;
      const fullCount = index ? index.count : position.count;
      if (fullCount < 3) return;

      if (object.isBatchedMesh && typeof object.getGeometryRangeAt === 'function') {
        const instanceCount = Array.isArray(object._instanceInfo) ? object._instanceInfo.length : object.instanceCount;
        const instanceMatrix = new THREE.Matrix4();
        const worldMatrix = new THREE.Matrix4();
        const range = {};
        for (let instanceId = 0; instanceId < instanceCount; instanceId += 1) {
          // Removed batch slots are retained internally but must not become
          // invisible collision walls or floors.
          if (object._instanceInfo?.[instanceId]?.active === false) continue;
          if (typeof object.getVisibleAt === 'function' && !object.getVisibleAt(instanceId)) continue;
          const geometryId = object.getGeometryIdAt(instanceId);
          object.getGeometryRangeAt(geometryId, range);
          const count = index ? range.indexCount : range.vertexCount;
          if (count < 3) continue;
          object.getMatrixAt(instanceId, instanceMatrix);
          worldMatrix.copy(object.matrixWorld).multiply(instanceMatrix);
          callback({ position, index, start: index ? range.indexStart : range.vertexStart, count, matrixWorld: worldMatrix });
        }
        return;
      }

      if (object.isInstancedMesh && typeof object.getMatrixAt === 'function') {
        const instanceMatrix = new THREE.Matrix4();
        const worldMatrix = new THREE.Matrix4();
        for (let instanceId = 0; instanceId < object.count; instanceId += 1) {
          object.getMatrixAt(instanceId, instanceMatrix);
          worldMatrix.copy(object.matrixWorld).multiply(instanceMatrix);
          callback({ position, index, start: 0, count: fullCount, matrixWorld: worldMatrix });
        }
        return;
      }

      callback({ position, index, start: 0, count: fullCount, matrixWorld: object.matrixWorld });
    });
  }

  createLocalBoundsFloor(model) {
    const bounds = new THREE.Box3().setFromObject(model.object);
    if (bounds.isEmpty()) {
      return { floors: this.emptyCollisionSource(), obstacles: this.emptyCollisionSource() };
    }
    const { min, max } = bounds;
    const y = min.y - 0.01;
    const positions = new Float32Array([
      min.x, y, min.z, max.x, y, min.z, max.x, y, max.z,
      min.x, y, min.z, max.x, y, max.z, min.x, y, max.z
    ]);
    return { floors: { positions, indices: new Uint32Array([0, 1, 2, 3, 4, 5]) }, obstacles: this.emptyCollisionSource() };
  }

  emptyCollisionSource() {
    return { positions: new Float32Array(), indices: new Uint32Array() };
  }

  renderModels(workName) {
    this.list.innerHTML = '';
    this.empty.classList.toggle('hidden', this.modelRecords.size > 0);
    this.modelRecords.forEach((record) => {
      const row = document.createElement('div');
      row.className = 'ifc-model-row';
      const label = record.source === 'local'
        ? `${this.escape(record.name)} · IFC local · ${(record.size / 1024 ** 2).toFixed(1)} MB`
        : `Fragments · ${(record.fragmentBytes / 1024).toFixed(0)} KB`;
      const remove = record.source === 'local' ? '<button class="ifc-model-remove" type="button" aria-label="Remover IFC local">🗑</button>' : '';
      row.innerHTML = `<input type="checkbox" ${record.visible ? 'checked' : ''} aria-label="Mostrar ${this.escape(record.discipline)}"><div><strong>${this.escape(record.discipline)}</strong><small>${label}</small><button class="ifc-model-isolate" type="button">Isolar disciplina</button></div>${remove}`;
      row.querySelector('input').addEventListener('change', (event) => this.setModelVisibility(record.id, event.target.checked));
      row.querySelector('.ifc-model-isolate').addEventListener('click', () => this.isolateModel(record.id));
      row.querySelector('.ifc-model-remove')?.addEventListener('click', () => this.removeModel(record.id));
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

  async removeModel(modelId) {
    const record = this.modelRecords.get(modelId);
    if (!record || record.source !== 'local') return;
    if (this.walk.mode !== 'orbit') await this.exitWalk({ fit: false });
    await this.fragments.core.disposeModel(modelId);
    this.modelRecords.delete(modelId);
    this.buildCollisionProxy();
    await this.clearSelection();
    this.renderModels(this.loadedWork === 'galpao' ? 'Galpão Industrial' : 'Casa Térrea');
    this.renderTree(this.loadedWork === 'galpao' ? 'Galpão Industrial' : 'Casa Térrea');
    await this.fit();
    this.showStatus(`${record.name} foi removido desta sessão. O IFC original nunca foi salvo; o cache otimizado local permanece para reabertura rápida.`);
  }

  buildCollisionProxy() {
    this.disposeColliderMesh(this.floorCollider);
    this.disposeColliderMesh(this.obstacleCollider);
    this.floorCollider = null;
    this.obstacleCollider = null;
    const records = [...this.modelRecords.values()].filter((record) => record.visible && record.colliderData);
    this.floorCollider = this.createColliderMesh(records, 'floors');
    this.obstacleCollider = this.createColliderMesh(records, 'obstacles');
    const bounds = new THREE.Box3();
    [this.floorCollider, this.obstacleCollider].forEach((mesh) => {
      if (mesh?.geometry.boundingBox) bounds.union(mesh.geometry.boundingBox);
    });
    this.collisionProxy = !!(this.floorCollider || this.obstacleCollider);
    this.collisionBounds.copy(bounds);
    this.walk.worldMinY = bounds.isEmpty() ? -Infinity : bounds.min.y - 8;
  }

  async loadCollider(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`colisor de caminhada não encontrado (${response.status})`);
    const buffer = await response.arrayBuffer();
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x49464343 || view.getUint32(4, true) !== 1) {
      throw new Error('formato de colisor incompatível');
    }
    const floorPositions = view.getUint32(8, true);
    const floorIndices = view.getUint32(12, true);
    const obstaclePositions = view.getUint32(16, true);
    const obstacleIndices = view.getUint32(20, true);
    let offset = 24;
    const floors = {
      positions: new Float32Array(buffer, offset, floorPositions),
      indices: new Uint32Array(buffer, offset += floorPositions * 4, floorIndices)
    };
    offset += floorIndices * 4;
    const obstacles = {
      positions: new Float32Array(buffer, offset, obstaclePositions),
      indices: new Uint32Array(buffer, offset += obstaclePositions * 4, obstacleIndices)
    };
    return { floors, obstacles };
  }

  createColliderMesh(records, role) {
    // Some IFCs contain only slabs/floors or only vertical elements. A missing
    // optional source must mean "no collider of this role", never abort the
    // import with `positions is undefined`.
    const sources = records
      .map((record) => record.colliderData?.[role])
      .filter((source) => source?.positions?.length && source?.indices?.length);
    if (!sources.length) return null;
    const positionCount = sources.reduce((sum, source) => sum + source.positions.length, 0);
    const indexCount = sources.reduce((sum, source) => sum + source.indices.length, 0);
    const positions = new Float32Array(positionCount);
    const indices = new Uint32Array(indexCount);
    let positionOffset = 0;
    let indexOffset = 0;
    let vertexOffset = 0;
    for (const source of sources) {
      positions.set(source.positions, positionOffset);
      for (let index = 0; index < source.indices.length; index += 1) indices[indexOffset + index] = source.indices[index] + vertexOffset;
      positionOffset += source.positions.length;
      indexOffset += source.indices.length;
      vertexOffset += source.positions.length / 3;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingBox();
    geometry.boundsTree = new MeshBVH(geometry, { maxLeafTris: 24, setBoundingBox: false });
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.raycast = acceleratedRaycast;
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  disposeColliderMesh(mesh) {
    if (!mesh) return;
    mesh.geometry?.disposeBoundsTree?.();
    mesh.geometry?.dispose();
    mesh.material?.dispose();
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
    this.world.renderer.three.domElement.classList.add('ifc-place-cursor');
    this.walkHelp?.classList.remove('hidden');
    this.walkCrosshair?.classList.add('hidden');
    this.showStatus('Clique em qualquer elemento visível para posicionar-se. Depois use WASD, Espaço para pular e Shift para correr.');
  }

  async exitWalk({ fit = true } = {}) {
    const wasWalking = this.walk.mode !== 'orbit';
    this.walk.mode = 'orbit';
    this.walk.keys.clear();
    this.walk.jumpRequested = false;
    this.walk.velocityY = 0;
    this.walk.accumulator = 0;
    this.walk.grounded = false;
    if (this.walkControls?.isLocked) this.walkControls.unlock();
    if (this.highlighter) this.highlighter.enabled = true;
    this.world?.camera && (this.world.camera.controls.enabled = true);
    this.world?.renderer?.three.domElement.classList.remove('ifc-place-cursor');
    this.walkHelp?.classList.add('hidden');
    this.walkCrosshair?.classList.add('hidden');
    // In orbit Fragments can return to its normal, efficient camera culling.
    // The no-cull policy is only needed while the user's eye is inside a
    // model, where an incomplete LOD tile at the frame edge is very visible.
    if (wasWalking) await this.setWalkLodPolicy(false);
    if (wasWalking && fit) await this.fit();
    if (wasWalking) this.showStatus('Caminhada encerrada. Órbita e zoom restaurados.');
  }

  async onWalkCanvasClick(event) {
    if (this.walk.mode === 'placement') {
      try {
        // Both pickers are read-only and do not touch the Highlighter. The
        // placement click must never select an item or populate its properties.
        const visualHit = await this.pickWalkSurface(event);
        const obstacleHit = this.pickObstacleCollision(event);
        const colliderHit = this.pickCollision(event);
        const hit = visualHit
          || obstacleHit
          || colliderHit
          || this.pickModelBounds(event);
        if (!hit?.point) return this.showStatus('Não foi possível localizar este ponto no modelo. Clique diretamente em uma geometria visível.');

        // Any element can start a walk. Prefer a horizontal surface below the
        // click, but keep the clicked elevation when the point is over void so
        // gravity can take over naturally.
        const camera = this.world.camera.three;
        this.world.scene.three.updateMatrixWorld(true);
        const spawnFeet = this.walkVectors.next.copy(hit.point);
        // A wall click is accepted as a spawn request, but its point lies on
        // the solid surface. Move the player-radius toward the visible side
        // before looking for the floor; otherwise the eye begins inside the
        // wall and near-plane clipping looks like passing through it.
        if (obstacleHit?.face && obstacleHit.point.distanceTo(hit.point) < 0.75) {
          const normal = this.walkVectors.normal.copy(obstacleHit.face.normal).transformDirection(obstacleHit.object.matrixWorld);
          if (Math.abs(normal.y) < 0.55) {
            normal.y = 0;
            spawnFeet.addScaledVector(normal.normalize(), this.walk.radius + 0.06);
          }
        }
        const floor = this.findFloorAt(spawnFeet.x, spawnFeet.z, spawnFeet.y + 0.12, 80);
        spawnFeet.y = floor?.point.y ?? spawnFeet.y;

        // Suspend orbit ownership before writing the camera position. Calling
        // CameraControls.setLookAt here was the source of the stale-orbit spawn.
        this.world.camera.controls.enabled = false;
        camera.zoom = 1;
        camera.updateProjectionMatrix();
        this.walk.zoom = 1;
        this.walk.feet.copy(spawnFeet);
        this.resolvePlayerCapsule(this.walk.feet);
        this.walk.spawnFeet.copy(spawnFeet);
        this.walk.lastSafeFeet.copy(this.walk.feet);
        this.walk.hasSafeFeet = !!floor;
        this.walk.lastFloorY = floor?.point.y ?? null;
        this.walk.velocityY = 0;
        this.walk.grounded = !!floor;
        this.walk.airborneSince = floor ? 0 : performance.now();
        this.syncCameraToPlayer();
        if (this.highlighter) {
          await this.highlighter.clear('select');
          this.highlighter.enabled = false;
        }
        // Do not rebuild the collision BVH here. Constructing it while the
        // pointer is being locked can stall the main thread on complex models;
        // the proxy prepared at load/visibility time remains in use.
        this.walk.accumulator = 0;
        this.walk.mode = 'walk';
        this.walk.lastFragmentsUpdate = 0;
        // First-person view must never replace a wall/beam at the edge of the
        // canvas with a coarser or missing fragment. Keep all *visible model*
        // geometry resident during walking; visibility toggles still apply and
        // the regular LOD/culling policy returns as soon as walking ends.
        void this.setWalkLodPolicy(true);
        this.updateFragmentsForWalk();
        this.walkHelp?.classList.add('hidden');
        this.walkCrosshair?.classList.remove('hidden');
        this.world.renderer.three.domElement.classList.remove('ifc-place-cursor');
        this.walkControls.lock(true);
      } catch (error) {
        console.error('Falha ao posicionar caminhada:', error);
        this.showStatus(`Não foi possível iniciar a caminhada: ${error.message || 'erro no raycast'}.`);
      }
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
    const raycaster = this.createPointerRaycaster(event);
    return raycaster.intersectObjects([this.floorCollider, this.obstacleCollider].filter(Boolean), false)[0] || null;
  }

  pickObstacleCollision(event) {
    if (!this.obstacleCollider) return null;
    return this.createPointerRaycaster(event).intersectObject(this.obstacleCollider, false)[0] || null;
  }

  createPointerRaycaster(event) {
    const rect = this.world.renderer.three.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.firstHitOnly = true;
    raycaster.setFromCamera(mouse, this.world.camera.three);
    return raycaster;
  }

  pickModelBounds(event) {
    if (this.collisionBounds.isEmpty()) return null;
    const raycaster = this.createPointerRaycaster(event);
    const point = raycaster.ray.intersectBox(this.collisionBounds, new THREE.Vector3());
    return point ? { point, distance: point.distanceTo(raycaster.ray.origin) } : null;
  }

  async pickWalkSurface(event) {
    const rect = this.world.renderer.three.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    // Passing an empty item list asks SimpleRaycaster to use only the fast
    // Fragments picker. It avoids a slow worker request for every federation
    // member and, importantly, cannot hang the placement click.
    return Promise.race([
      this.sceneRaycaster.castRay({ items: [], position: mouse }),
      new Promise((resolve) => setTimeout(() => resolve(null), 800))
    ]);
  }

  collisionRay(origin, direction, far, role = 'all') {
    const targets = role === 'floor'
      ? [this.floorCollider]
      : role === 'obstacle'
        ? [this.obstacleCollider]
        : [this.floorCollider, this.obstacleCollider];
    const colliders = targets.filter(Boolean);
    if (!colliders.length) return null;
    const raycaster = new THREE.Raycaster(origin, direction, 0, far);
    raycaster.firstHitOnly = true;
    return raycaster.intersectObjects(colliders, false)[0] || null;
  }

  findFloorAt(x, z, startY, maxDrop = 6) {
    const origin = this.walkVectors.origin.set(x, startY, z);
    const hit = this.collisionRay(origin, this.walkVectors.down, maxDrop, 'floor');
    if (!hit?.face) return null;
    const normal = this.walkVectors.normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    return normal.y > 0.55 ? hit : null;
  }

  floorBelow(feet, lift = 0.35, maxDrop = 6) {
    return this.findFloorAt(feet.x, feet.z, feet.y + lift, lift + maxDrop);
  }

  hitsWall(feet, direction, distance) {
    if (!distance) return false;
    // The final probe sits at eye level. The old upper probe stopped below
    // the camera, allowing it to clip a low wall even when the feet were
    // stopped correctly.
    return [0.2, this.walk.height * 0.55, this.walk.height - 0.04].some((height) => {
      const origin = this.walkVectors.origin.copy(feet).addScaledVector(direction, 0.01);
      origin.y += height;
      const hit = this.collisionRay(origin, direction, distance + this.walk.radius, 'obstacle');
      if (!hit?.face || hit.distance >= distance + this.walk.radius) return false;
      return Math.abs(this.walkVectors.normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).y) < 0.55;
    });
  }

  resolvePlayerCapsule(feet) {
    const boundsTree = this.obstacleCollider?.geometry?.boundsTree;
    if (!boundsTree) return null;
    const radius = this.walk.radius;
    const {
      capsuleSegment, capsuleBox, capsuleStart, capsuleCorrection,
      trianglePoint, capsulePoint, capsuleDirection
    } = this.walkVectors;

    capsuleSegment.start.copy(feet).addScaledVector(this.walkVectors.up, radius);
    // The physical body extends above the 1.70 m eye position. If the capsule
    // ended at eye height its rounded cap would have zero horizontal radius
    // exactly where the camera sits, allowing the view to enter a wall while
    // the lower body remained outside.
    capsuleSegment.end.copy(feet).addScaledVector(this.walkVectors.up, this.walk.bodyHeight - radius);
    capsuleStart.copy(capsuleSegment.start);
    capsuleBox.makeEmpty();
    capsuleBox.expandByPoint(capsuleSegment.start);
    capsuleBox.expandByPoint(capsuleSegment.end);
    capsuleBox.min.addScalar(-radius);
    capsuleBox.max.addScalar(radius);

    boundsTree.shapecast({
      intersectsBounds: (box) => box.intersectsBox(capsuleBox),
      intersectsTriangle: (triangle) => {
        const distance = triangle.closestPointToSegment(capsuleSegment, trianglePoint, capsulePoint);
        if (distance >= radius) return false;
        const depth = radius - distance;
        capsuleDirection.subVectors(capsulePoint, trianglePoint);
        if (capsuleDirection.lengthSq() < 1e-10) {
          triangle.getNormal(capsuleDirection);
          capsuleSegment.getCenter(capsulePoint).sub(trianglePoint);
          if (capsuleDirection.dot(capsulePoint) < 0) capsuleDirection.negate();
        } else {
          capsuleDirection.normalize();
        }
        capsuleSegment.start.addScaledVector(capsuleDirection, depth);
        capsuleSegment.end.addScaledVector(capsuleDirection, depth);
        return false;
      }
    });

    capsuleCorrection.subVectors(capsuleSegment.start, capsuleStart);
    feet.add(capsuleCorrection);
    return capsuleCorrection;
  }

  syncCameraToPlayer() {
    const camera = this.world.camera.three;
    camera.position.copy(this.walk.feet).addScaledVector(this.walkVectors.up, this.walk.height);
    camera.updateMatrixWorld(true);
    this.updateFragmentsForWalk();
    this.world.renderer.needsUpdate = true;
  }

  updateFragmentsForWalk() {
    if (!this.fragments || this.walk.mode !== 'walk') return;
    const now = performance.now();
    // Avoid starting overlapping async refreshes from the 60 Hz physics loop.
    // The manager itself enforces the same 40 ms cap, but this guard avoids
    // allocating promises that cannot produce a new view request.
    if (now - this.walk.lastFragmentsUpdate < 40) return;
    this.walk.lastFragmentsUpdate = now;
    this.fragments.core.update().catch((error) => console.warn('Atualização de visibilidade da caminhada falhou:', error));
  }

  async setWalkLodPolicy(walking) {
    if (!this.fragments) return;
    const mode = walking ? LodMode.ALL_VISIBLE : LodMode.DEFAULT;
    const updates = [];
    this.modelRecords.forEach((record, id) => {
      if (!record.visible) return;
      const model = this.fragments.list.get(id);
      if (model) updates.push(model.setLodMode(mode));
    });
    await Promise.allSettled(updates);
    this.fragments.core.update(true);
    this.world.renderer.needsUpdate = true;
  }

  recoverWalk(reason) {
    const feet = this.walk.hasSafeFeet ? this.walk.lastSafeFeet : this.walk.spawnFeet;
    this.walk.feet.copy(feet);
    this.walk.velocityY = 0;
    this.walk.grounded = this.walk.hasSafeFeet;
    this.walk.airborneSince = 0;
    this.walk.lastFloorY = feet.y;
    this.syncCameraToPlayer();
    this.showStatus(`Posição recuperada (${reason}).`);
  }

  reportWalkDebug(rayStartedAt) {
    if (!this.onWalkDebug || !new URLSearchParams(window.location.search).has('ifcDebug')) return;
    const now = performance.now();
    if (now - this.walk.lastDebugAt < 350) return;
    this.walk.lastDebugAt = now;
    const { feet, grounded, velocityY, lastFloorY } = this.walk;
    this.onWalkDebug(`Caminhada: pés ${feet.x.toFixed(2)}, ${feet.y.toFixed(2)}, ${feet.z.toFixed(2)} · ${grounded ? 'no chão' : 'no ar'} · vY ${velocityY.toFixed(2)} · piso ${lastFloorY?.toFixed(2) ?? '—'} · raycast ${(performance.now() - rayStartedAt).toFixed(2)} ms`);
  }

  stepWalk(delta) {
    if (this.walk.jumpRequested && this.walk.grounded) {
      this.walk.velocityY = 8.5;
      this.walk.grounded = false;
      this.walk.airborneSince = performance.now();
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
      next.copy(this.walk.feet).add(move);
      const step = this.floorBelow(next, this.walk.stepHeight + 0.08, this.walk.stepHeight + 0.14);
      const stepY = step?.point.y;
      // A floor detected at the same height is normal while facing a wall;
      // it must not turn that wall into an allowed "step". Only a real rise
      // up to 20 cm qualifies for automatic stair/threshold climbing.
      const canStep = this.walk.grounded && stepY !== undefined
        && stepY > this.walk.feet.y + 0.04
        && stepY <= this.walk.feet.y + this.walk.stepHeight;
      if (!this.hitsWall(this.walk.feet, move.clone().normalize(), move.length()) || canStep) {
        this.walk.feet.x = next.x;
        this.walk.feet.z = next.z;
        if (canStep) {
          this.walk.feet.y = stepY;
          this.walk.velocityY = 0;
          this.walk.grounded = true;
          this.walk.lastSafeFeet.copy(this.walk.feet);
          this.walk.hasSafeFeet = true;
          this.walk.lastFloorY = stepY;
        }
      }
    }
    this.walk.velocityY = Math.max(this.walk.velocityY - this.walk.gravity * delta, -this.walk.terminalVelocity);
    const floor = this.floorBelow(this.walk.feet, 0.35, 6);
    const floorY = floor?.point.y;
    const nextY = this.walk.feet.y + this.walk.velocityY * delta;
    if (floorY !== undefined && this.walk.velocityY <= 0 && floorY <= this.walk.feet.y + 0.08 && nextY <= floorY) {
      this.walk.feet.y = floorY;
      this.walk.velocityY = 0;
      this.walk.grounded = true;
      this.walk.airborneSince = 0;
      this.walk.lastSafeFeet.copy(this.walk.feet);
      this.walk.hasSafeFeet = true;
      this.walk.lastFloorY = floorY;
    } else {
      this.walk.feet.y = nextY;
      this.walk.grounded = false;
      if (!this.walk.airborneSince) this.walk.airborneSince = performance.now();
    }
    // Rays remain useful for floor snapping and automatic 20 cm steps, but
    // the capsule is authoritative for solid collision. It resolves corners,
    // oblique movement and any residual intersection across the full body.
    const capsuleCorrection = this.resolvePlayerCapsule(this.walk.feet);
    if (capsuleCorrection?.y > 0.001 && this.walk.velocityY <= 0) {
      this.walk.velocityY = 0;
      this.walk.grounded = true;
      this.walk.airborneSince = 0;
      this.walk.lastFloorY = this.walk.feet.y;
    }
    if (this.walk.grounded) {
      this.walk.lastSafeFeet.copy(this.walk.feet);
      this.walk.hasSafeFeet = true;
    }
    this.syncCameraToPlayer();
    if (this.walk.feet.y < this.walk.worldMinY) this.recoverWalk('queda fora do modelo');
    else if (this.walk.airborneSince && performance.now() - this.walk.airborneSince > 10000) this.recoverWalk('queda sem apoio');
  }

  updateWalk(delta) {
    if (this.walk.mode !== 'walk' || !this.walkControls?.isLocked) return;
    const rayStartedAt = performance.now();
    this.walk.accumulator = Math.min(this.walk.accumulator + Math.min(delta, 0.1), this.walk.fixedStep * 5);
    while (this.walk.accumulator >= this.walk.fixedStep) {
      this.stepWalk(this.walk.fixedStep);
      this.walk.accumulator -= this.walk.fixedStep;
    }
    this.reportWalkDebug(rayStartedAt);
  }

  animateWalk() {
    requestAnimationFrame(() => this.animateWalk());
    const now = performance.now();
    const delta = Math.min(0.1, (now - this.walk.lastFrame) / 1000);
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
