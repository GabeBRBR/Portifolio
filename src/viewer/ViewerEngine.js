import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { LodMode, RenderedFaces } from '@thatopen/fragments';
import fragmentsWorkerUrl from '@thatopen/fragments/worker?url';
import { FragmentCache } from './storage/FragmentCache.js';
import { BimIndex } from '../bim/BimIndex.js';
import { BimIndexService } from '../bim/BimIndexService.js';
import { MeasureTool } from './MeasureTool.js';
import { mixin } from './mixin.js';
import { ClipBoxMethods } from './clipBox.js';
import { ExplodedViewMethods } from './explodedView.js';
import { CollisionMethods } from './collision.js';
import { WalkMethods } from './walk.js';
import { ViewCube } from './ViewCube.js';
import { HoverMethods } from './hover.js';

const FRAGMENTS_MANIFEST = 'assets/fragments/models.json';
const MAX_LOCAL_MODELS = 3;
const MAX_TOTAL_MODELS = 8;
const MAX_LOCAL_FILE_BYTES = 200 * 1024 ** 2;
const QUALITY_STORAGE_KEY = 'ifc-fragments-quality-profile';
const QUALITY_PROFILES = Object.freeze({
  high: { label: 'Alto', pixelRatio: 1.25, movingPixelRatio: 1, updateRate: 40, lod: LodMode.ALL_GEOMETRY },
  balanced: { label: 'Equilibrado', pixelRatio: 1, movingPixelRatio: 0.8, updateRate: 60, lod: LodMode.DEFAULT },
  performance: { label: 'Desempenho', pixelRatio: 0.75, movingPixelRatio: 0.65, updateRate: 90, lod: LodMode.DEFAULT }
});
// `IfcImporter` appends `web-ifc.wasm` to this directory. copy-assets.mjs
// deliberately publishes that filename under a stable Vite-base-aware path.
const WEB_IFC_WASM_DIRECTORY = `${import.meta.env.BASE_URL}assets/wasm/`;

// localStorage throws when site data is blocked (private mode, policies).
const safeStorage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* preference is not persisted */ }
  }
};

const XRAY_STYLE = 'xray';
const COLOR_STYLE_PREFIX = 'color:';
const PLAN_STYLE_PREFIX = 'plan:';
const PLAN_CUT_HEIGHT = 1.2;
// Direction from the models to the camera for each standard view.
const STANDARD_VIEW_OFFSETS = {
  plan: [0.001, 1, 0.001],
  front: [0, 0.15, 1],
  back: [0, 0.15, -1],
  right: [1, 0.15, 0],
  left: [-1, 0.15, 0],
  iso: [0.8, 0.7, 0.9]
};

/**
 * 3D engine of the BIM viewer (That Open Fragments). It owns the scene,
 * selection, visibility, sections, walking and measurement tools, and keeps
 * the federated BIM index in sync with the loaded models. The interface lives
 * in src/app and talks to the engine only through its public methods and the
 * callbacks given to the constructor.
 */
export class ViewerEngine {
  constructor({ container, viewCubeContainer, walkHelp, walkCrosshair, setLoading, showStatus, onWalkDebug, onSelectionChange, onHoverChange, onCameraUpdate, onModelsChange, onModeChange }) {
    this.container = container;
    this.viewCubeContainer = viewCubeContainer;
    this.viewCube = null;
    this.onSelectionChange = onSelectionChange;
    this.onHoverChange = onHoverChange;
    this.onCameraUpdate = onCameraUpdate;
    this.onModelsChange = onModelsChange;
    this.onModeChange = onModeChange;
    this.bimIndex = new BimIndex();
    this.indexService = null;
    this.selection = {};
    this.xrayEnabled = false;
    this.colorGroups = [];
    this.plan = null;
    this.measureMode = null;
    this.walkHelp = walkHelp;
    this.walkCrosshair = walkCrosshair;
    this.setLoading = setLoading;
    this.showStatus = showStatus;
    this.onWalkDebug = onWalkDebug;
    this.loadedWork = null;
    this.modelRecords = new Map();
    this.fragmentCache = new FragmentCache();
    this.ifcLoader = null;
    this.background = safeStorage.get('ifc-background') || '#f7f5f0';
    this.explodeDistance = 0;
    this.explodeUniform = { value: 0 };
    if (import.meta.env.DEV) window.__bimEngine = this;
    this.clipBox = null;
    // Created once: exploded-view materials keep a reference to this array, so
    // it must never be replaced. A huge constant keeps every plane inert until
    // the section box is first used.
    this.clipPlanes = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e9), new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e9),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e9), new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e9),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), 1e9), new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e9)
    ];
    this.clipPlanesRegistered = false;
    this.explodedGroup = null;
    this.explodedElements = [];
    this.explodedLevels = 0;
    this.explosionBuildPromise = null;
    this.explosionBuildVersion = 0;
    this.collisionDebugEnabled = false;
    this.lastCollisionContact = null;
    this.collisionAlignmentDebug = '';
    this.collisionBounds = new THREE.Box3();
    const savedProfile = safeStorage.get(QUALITY_STORAGE_KEY);
    this.quality = {
      profile: QUALITY_PROFILES[savedProfile] ? savedProfile : 'balanced',
      adaptiveStep: 0, averageFrameMs: 16.7, lastFrameAt: performance.now(), frameTimes: [],
      lastCameraMotionAt: 0, lastAdjustmentAt: 0, appliedLod: null, appliedUpdateRate: null
    };
    this.benchmark = { startedAt: 0, firstUsableMs: null };
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
      forward: new THREE.Vector3(), right: new THREE.Vector3(), move: new THREE.Vector3(), heading: new THREE.Vector3(),
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
    this.world.scene.three.background = new THREE.Color(this.background);
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
    this.applyQuality(true);
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
    // While measuring in first person the right button gives the mouse back to the walk.
    this.world.renderer.three.domElement.addEventListener('contextmenu', (event) => {
      if (this.walk.mode !== 'walk' || !this.measureMode || this.walkControls.isLocked) return;
      event.preventDefault();
      this.walk.mouseReleased = false;
      this.walkControls.lock(true);
    });
    this.world.renderer.three.domElement.addEventListener('wheel', (event) => this.onWalkWheel(event), { passive: false });
    window.addEventListener('keydown', (event) => this.onWalkKey(event, true));
    window.addEventListener('keyup', (event) => this.onWalkKey(event, false));

    this.fragments = this.components.get(OBC.FragmentsManager);
    // Vite emits this dependency as a local worker asset, keeping Pages/CDN-independent.
    this.fragments.init(fragmentsWorkerUrl);
    // Keep autoCoordinate false so federated disciplines maintain their exact
    // shared BIM coordinate system without arbitrary offset shifts.
    this.fragments.core.settings.autoCoordinate = false;
    // Fragments refreshes camera-driven visibility at most every 100 ms by
    // default. That is acceptable for orbit, but creates noticeable pop-in
    // when a player turns quickly. 40 ms stays below 25 updates/s while
    // letting the worker prefetch the player's forward view.
    this.fragments.core.settings.maxUpdateRate = 40;
    this.applyQuality(true);
    this.highlighter = this.components.get(OBCF.Highlighter);
    this.highlighter.setup({
      world: this.world,
      selectMaterialDefinition: {
        color: new THREE.Color('#1f6fe0'),
        opacity: 1,
        transparent: false,
        renderedFaces: RenderedFaces.TWO,
        priority: 10,
        // Without this list the library keeps the element's own colour and the
        // selection never turns blue.
        preserveOriginalMaterial: true,
        _explicitProps: ['color', 'opacity', 'transparent']
      },
      zoomToSelection: false
    });
    // Ctrl+click adds to the selection; the element sheet then sums quantities.
    this.highlighter.multiple = 'ctrlKey';
    this.highlighter.events.select.onHighlight.add(() => this.emitSelection());
    this.highlighter.events.select.onClear.add(() => this.emitSelection());
    this.setupHover();
    this.hider = this.components.get(OBC.Hider);
    this.indexService = new BimIndexService({ cache: this.fragmentCache, wasmPath: new URL(WEB_IFC_WASM_DIRECTORY, window.location.href).href });
    new ResizeObserver(() => {
      this.world.renderer?.resize?.();
      this.world.camera?.updateAspect?.();
      this.viewCube?.resize();
      this.world.renderer.needsUpdate = true;
    }).observe(this.container);
    this.fragments.list.onItemSet.add(({ value: model }) => {
      model.useCamera(this.world.camera.three);
      this.world.scene.three.add(model.object);
      this.fragments.core.update(true);
      this.world.renderer.needsUpdate = true;
    });
    this.world.camera.projection.onChanged.add(() => {
      this.fragments.list.forEach((model) => model.useCamera(this.world.camera.three));
      this.fragments.core.update(true);
      this.world.renderer.needsUpdate = true;
    });
    this.world.camera.controls.addEventListener('update', () => {
      this.quality.lastCameraMotionAt = performance.now();
      this.applyQuality();
      this.fragments.core.update();
      this.world.renderer.needsUpdate = true;
      this.viewCube?.sync();
      this.onCameraUpdate?.();
    });
    if (this.viewCubeContainer) this.viewCube = new ViewCube({ container: this.viewCubeContainer, engine: this });
    await this.world.camera.controls.setLookAt(18, 14, 18, 0, 0, 0);
    this.animateWalk();
  }

  /** Loads are serialised: two overlapping loads would otherwise merge both works into one scene. */
  loadWork(workKey) {
    this.loadChain = (this.loadChain || Promise.resolve()).catch(() => {}).then(() => this.loadWorkNow(workKey));
    return this.loadChain;
  }

  async loadWorkNow(workKey) {
    this.benchmark.startedAt = performance.now();
    this.benchmark.firstUsableMs = null;
    const workName = { galpao: 'Galpão Industrial', 'casa-popular': 'Casa Popular' }[workKey] || 'Casa Térrea';
    this.setLoading(true, `Carregando ${workName}…`, 0);
    const response = await fetch(`${FRAGMENTS_MANIFEST}?t=${Date.now()}`);
    if (!response.ok) throw new Error(`manifesto Fragments não encontrado (${response.status})`);
    const manifest = await response.json();
    const models = manifest.models.filter((model) => model.work === workKey);
    if (!models.length) throw new Error(`nenhum modelo otimizado encontrado para ${workName}`);
    if (this.loadedWork) {
      await this.unloadAllModels();
    }
    for (let index = 0; index < models.length; index += 1) {
      const model = models[index];
      try {
        this.setLoading(true, `Carregando ${model.discipline}…`, Math.round((index / models.length) * 100));
        const fragmentUrl = model.fragmentHash ? `${model.fragment}?v=${model.fragmentHash}` : model.fragment;
        const fragmentResponse = await fetch(fragmentUrl);
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
        const colliderCoordinateSpace = model.colliderCoordinateSpace || 'model-local';
        const colliderUrl = model.collider
          ? (model.colliderHash ? `${model.collider}?v=${model.colliderHash}` : model.collider)
          : null;
        // A missing or corrupt collider only disables walking for this model;
        // it must not leave the loaded fragment without a record or index.
        let colliderData = null;
        if (colliderUrl) {
          try {
            colliderData = await this.loadCollider(colliderUrl, colliderCoordinateSpace);
          } catch (error) {
            console.warn(`Colisor de ${model.discipline} indisponível:`, error);
            this.showStatus(`${model.discipline}: colisor indisponível (${error.message}). A caminhada não considerará este modelo.`);
          }
        }
        this.modelRecords.set(model.id, { ...model, visible: true, colliderData });
        if (loadedModel) await this.attachIndex(model.id, () => this.indexService.loadHosted(model));
      } catch (error) {
        // Do not keep half-loaded geometry that has no record.
        if (!this.modelRecords.has(model.id)) await this.unloadModel(model.id);
        this.showStatus(`Não foi possível carregar ${model.discipline}: ${error.message}`);
      }
    }
    this.loadedWork = workKey;
    this.setLoading(false);
    this.notifyModels();
    this.buildCollisionProxy();
    await this.fit({ animate: false });
    this.fragments.core.update(true);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    this.benchmark.firstUsableMs = performance.now() - this.benchmark.startedAt;
    this.showStatus(`${workName}: ${this.bimIndex.size} elementos indexados. Clique em um elemento para ver seus dados.`);
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
    this.notifyModels();
    if (imported) {
      await this.refreshExplodedView();
      await this.fit();
    }
    if (failures.length) {
      const prefix = imported ? `${imported} IFC(s) aberto(s). ` : 'Nenhum IFC foi aberto. ';
      this.showStatus(`${prefix}${failures.join(' · ')}.`);
    }
  }

  getQualityProfile() {
    return this.quality.profile;
  }

  setBackground(color) {
    if (!color) return;
    this.background = color;
    safeStorage.set('ifc-background', color);
    if (this.world?.scene?.three) this.world.scene.three.background = new THREE.Color(color);
    if (this.world?.renderer) this.world.renderer.needsUpdate = true;
  }

  async setQualityProfile(profile) {
    if (!QUALITY_PROFILES[profile]) return;
    this.quality.profile = profile;
    this.quality.adaptiveStep = 0;
    this.quality.lastAdjustmentAt = performance.now();
    safeStorage.set(QUALITY_STORAGE_KEY, profile);
    this.applyQuality(true);
    this.showStatus(`Qualidade ${QUALITY_PROFILES[profile].label} selecionada. A proteção automática continua disponível durante movimentos pesados.`);
  }

  applyQuality(force = false) {
    if (!this.world?.renderer) return;
    const profile = QUALITY_PROFILES[this.quality.profile];
    const now = performance.now();
    const moving = this.walk.mode === 'walk' || now - this.quality.lastCameraMotionAt < 320;
    const safetyFactor = this.quality.adaptiveStep ? 0.8 : 1;
    const deviceRatio = window.devicePixelRatio || 1;
    const targetRatio = Math.min(deviceRatio, (moving ? profile.movingPixelRatio : profile.pixelRatio) * safetyFactor);
    const renderer = this.world.renderer.three;
    if (force || Math.abs(renderer.getPixelRatio() - targetRatio) > 0.01) {
      renderer.setPixelRatio(targetRatio);
      this.world.renderer.needsUpdate = true;
    }
    if (!this.fragments) return;
    const updateRate = Math.round(profile.updateRate + this.quality.adaptiveStep * 25);
    if (this.quality.appliedUpdateRate !== updateRate) {
      this.fragments.core.settings.maxUpdateRate = updateRate;
      this.quality.appliedUpdateRate = updateRate;
    }
    if (this.walk.mode === 'walk') return;
    const lod = this.quality.adaptiveStep ? LodMode.DEFAULT : profile.lod;
    if (!force && this.quality.appliedLod === lod) return;
    this.quality.appliedLod = lod;
    const updates = [];
    this.modelRecords.forEach((record, id) => {
      if (!record.visible) return;
      const model = this.fragments.list.get(id);
      if (model) updates.push(model.setLodMode(lod));
    });
    if (updates.length) void Promise.allSettled(updates);
  }

  updateAdaptiveQuality(now) {
    const frameMs = Math.min(120, Math.max(0, now - this.quality.lastFrameAt));
    this.quality.lastFrameAt = now;
    this.quality.frameTimes.push(frameMs);
    if (this.quality.frameTimes.length > 120) this.quality.frameTimes.shift();
    this.quality.averageFrameMs += (frameMs - this.quality.averageFrameMs) * 0.08;
    if (now - this.quality.lastAdjustmentAt < 1200) return;
    const moving = this.walk.mode === 'walk' || now - this.quality.lastCameraMotionAt < 320;
    if (moving && this.quality.averageFrameMs > 28 && this.quality.adaptiveStep === 0) {
      this.quality.adaptiveStep = 1;
    } else if (!moving && this.quality.averageFrameMs < 19 && this.quality.adaptiveStep === 1) {
      this.quality.adaptiveStep = 0;
    } else return;
    this.quality.lastAdjustmentAt = now;
    this.applyQuality(true);
  }

  getBenchmarkSnapshot() {
    const frameTimes = this.quality.frameTimes;
    const frameMs = frameTimes.length ? frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length : this.quality.averageFrameMs;
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const frameP95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : frameMs;
    const info = this.world?.renderer?.three?.info;
    if (!info) return null;
    return {
      capturedAt: new Date().toISOString(), engine: 'fragments', model: this.getProjectLabel(), quality: this.quality.profile,
      fps: Math.round(1000 / Math.max(frameMs, 0.001)), frameMs: Number(frameMs.toFixed(2)), frameP95: Number(frameP95.toFixed(2)),
      drawCalls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures,
      firstUsableMs: this.benchmark.firstUsableMs === null ? null : Math.round(this.benchmark.firstUsableMs)
    };
  }

  getProjectLabel() {
    if (this.loadedWork === 'galpao') return 'Galpão Industrial';
    if (this.loadedWork === 'casa-popular') return 'Casa Popular';
    if (this.loadedWork === 'casa-terrea') return 'Casa Térrea';
    return 'Projeto local';
  }

  /** Disposes one Fragments model and drops it from the manager's list (disposeModel alone leaves the entry). */
  async unloadModel(modelId) {
    if (!this.fragments?.list.has(modelId)) return;
    try {
      await this.fragments.core.disposeModel(modelId);
    } catch (error) {
      console.warn('Falha ao descarregar o modelo:', error);
    }
    this.fragments.core.models.list.delete(modelId);
    this.geometryIdCache?.delete(modelId);
  }

  /** Back to an empty scene: walk, presentation, models, colliders and index. */
  async unloadAllModels() {
    if (this.walk.mode !== 'orbit') await this.exitWalk({ fit: false });
    this.clearExplodedView();
    this.clearMeasurements();
    await this.resetPresentation();
    this.bimIndex.clear();
    for (const modelId of [...this.fragments.list.keys()]) await this.unloadModel(modelId);
    this.fragments.core.baseCoordinates = null;
    this.fragments.baseCoordinationModel = '';
    this.fragments.baseCoordinationMatrix = new THREE.Matrix4();
    this.modelRecords.clear();
    this.disposeColliderMesh(this.floorCollider);
    this.disposeColliderMesh(this.obstacleCollider);
    this.floorCollider = null;
    this.obstacleCollider = null;
    this.collisionProxy = false;
    this.collisionBounds.makeEmpty();
    this.walk.hasSafeFeet = false;
    this.walk.feet.set(0, 0, 0);
    this.walk.spawnFeet.set(0, 0, 0);
    this.walk.lastFloorY = null;
    this.lastCollisionContact = null;
    this.collisionAlignmentDebug = '';
  }

  async startNewProject() {
    await this.unloadAllModels();
    this.loadedWork = null;
    this.notifyModels();
    this.fragments.core.update(true);
    this.world.renderer.needsUpdate = true;
    this.showStatus('Modelos descarregados desta sessão. O cache local de Fragments foi preservado.');
  }

  async addLocalIfc(file, index, total) {
    if (file.size > MAX_LOCAL_FILE_BYTES) throw new Error('o arquivo excede 200 MB; escolha um IFC menor para evitar falta de memória');
    this.setLoading(true, `Lendo ${file.name}…`, Math.round((index / total) * 100));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const sourceBuffer = await file.arrayBuffer();
    const hash = await this.hashBuffer(sourceBuffer);
    const modelId = `local-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${index}`}`;
    const cached = hash ? await this.tryGetCachedFragment(hash) : null;
    // The BIM index is built from the IFC in a worker while the main thread
    // converts the geometry; a cached index skips the work entirely.
    const indexJob = (async () => {
      const cachedIndex = await this.indexService.getCached(hash);
      if (cachedIndex) return cachedIndex;
      const built = await this.indexService.buildFromIfc(sourceBuffer);
      void this.indexService.putCached(hash, built);
      return built;
    })();
    indexJob.catch(() => {});
    let model;
    let fragmentBytes = cached?.buffer?.byteLength || 0;

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
      // Cache only the compact Fragment, never the original IFC. Getting the
      // buffer here also lets the model panel report the real optimized size
      // before the best-effort IndexedDB write completes.
      if (hash) {
        const fragmentBuffer = await model.getBuffer(false);
        fragmentBytes = fragmentBuffer.byteLength;
        void this.cacheFragment(hash, file, fragmentBuffer);
      }
    }

    if (!model || !this.fragments.list.has(modelId)) throw new Error('o conversor não registrou um modelo visualizável');
    try {
      await this.registerLocalModel({ model, modelId, file, index, total, hash, cached, fragmentBytes, indexJob });
    } catch (error) {
      // Roll back: geometry in the scene without a record could not be removed by the user.
      this.modelRecords.delete(modelId);
      this.bimIndex.removeModel(modelId);
      await this.unloadModel(modelId);
      this.buildCollisionProxy();
      throw error;
    }
  }

  async registerLocalModel({ model, modelId, file, index, total, hash, cached, fragmentBytes, indexJob }) {
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
    this.setLoading(true, `Preparando colisões de ${file.name}…`, Math.round(((index + 0.92) / total) * 100));
    const colliderData = await this.createLocalCollisionData(model);
    this.modelRecords.set(modelId, {
      id: modelId,
      discipline: this.uniqueDiscipline(this.guessDiscipline(file.name)),
      name: file.name,
      source: 'local',
      size: file.size,
      fragmentBytes,
      cacheState: cached ? 'cache' : 'converted',
      visible: true,
      colliderData,
      cacheHash: hash
    });
    this.setLoading(true, `Indexando dados BIM de ${file.name}…`, Math.round(((index + 0.97) / total) * 100));
    await this.attachIndex(modelId, () => indexJob);
    this.buildCollisionProxy();
    this.world.renderer.needsUpdate = true;
    const collisionNote = colliderData.partial
      ? ' O colisor foi preparado parcialmente; faltaram superfícies IFC classificadas como piso.'
      : '';
    this.showStatus(`${file.name} foi convertido localmente${cached ? ' a partir do cache' : ''}. Nenhum arquivo foi enviado ao servidor.${collisionNote}`);
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

  async cacheFragment(hash, file, buffer) {
    try {
      await this.fragmentCache.put({ hash, buffer, name: file.name, sourceBytes: file.size, fragmentBytes: buffer.byteLength, createdAt: Date.now() });
      await this.fragmentCache.prune();
    } catch (error) {
      console.warn('Não foi possível salvar o Fragment no cache local:', error);
    }
  }

  async hashBuffer(buffer) {
    if (!globalThis.crypto?.subtle) return null;
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  }

  uniqueDiscipline(label) {
    const taken = new Set([...this.modelRecords.values()].map((record) => record.discipline));
    if (!taken.has(label)) return label;
    let index = 2;
    while (taken.has(`${label} ${index}`)) index += 1;
    return `${label} ${index}`;
  }

  /** Discipline from the usual file-name codes (ARQ, EST, ELE, HID, ESG…); otherwise the file name. */
  guessDiscipline(name) {
    const stem = String(name).replace(/\.ifc$/i, '');
    const upper = stem.toUpperCase();
    const rules = [
      [/(^|[^A-Z])(ARQ|AQR|ARC|ARCH)/, 'Arquitetura'],
      [/(^|[^A-Z])(EST|STR|ESTR)/, 'Estrutural'],
      [/(^|[^A-Z])(ELE|ELET|ELT)/, 'Elétrica'],
      [/(^|[^A-Z])(HID|HYD|AGUA|AF)([^A-Z]|$)/, 'Hidráulica'],
      [/(^|[^A-Z])(ESG|SAN|PLU)([^A-Z]|$)/, 'Sanitária']
    ];
    return rules.find(([pattern]) => pattern.test(upper))?.[1] || stem;
  }



  async setModelVisibility(modelId, visible) {
    const record = this.modelRecords.get(modelId);
    const model = this.fragments.list.get(modelId);
    if (!record || !model) return;
    record.visible = visible;
    model.object.visible = visible;
    this.buildCollisionProxy();
    if (!visible) await this.clearSelection();
    await this.refreshExplodedView();
    this.fragments.core.update(true);
    this.world.renderer.needsUpdate = true;
    this.notifyModels();
  }

  async isolateModel(modelId) {
    this.modelRecords.forEach((record, id) => {
      const visible = id === modelId;
      record.visible = visible;
      const model = this.fragments.list.get(id);
      if (model) model.object.visible = visible;
    });
    await this.clearSelection();
    this.buildCollisionProxy();
    await this.refreshExplodedView();
    this.fragments.core.update(true);
    this.world.renderer.needsUpdate = true;
    this.notifyModels();
  }

  async removeModel(modelId) {
    const record = this.modelRecords.get(modelId);
    if (!record || record.source !== 'local') return;
    if (this.walk.mode !== 'orbit') await this.exitWalk({ fit: false });
    if (this.explodedGroup) {
      this.explodeDistance = 0;
      this.clearExplodedView();
      this.modelRecords.forEach((entry, id) => {
        const model = this.fragments.list.get(id);
        if (model) model.object.visible = entry.visible;
      });
    }
    await this.clearSelection();
    await this.unloadModel(modelId);
    this.modelRecords.delete(modelId);
    this.bimIndex.removeModel(modelId);
    this.buildCollisionProxy();
    this.notifyModels();
    await this.fit();
    this.showStatus(`${record.name} foi removido desta sessão. O IFC original nunca foi salvo; o cache otimizado local permanece para reabertura rápida.`);
  }

  /**
   * PNG of the current view. The WebGL buffer is only readable in the same task
   * as the render call, so the frame is re-rendered and copied right away; the
   * measurement labels (HTML) are painted on top so the picture matches the screen.
   */
  async captureImage() {
    if (!this.world?.renderer) return null;
    const renderer = this.world.renderer.three;
    const source = renderer.domElement;
    renderer.render(this.world.scene.three, this.world.camera.three);
    const output = document.createElement('canvas');
    output.width = source.width;
    output.height = source.height;
    const context = output.getContext('2d');
    context.fillStyle = `#${new THREE.Color(this.background).getHexString()}`;
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(source, 0, 0);
    const frame = source.getBoundingClientRect();
    const scale = output.width / frame.width;
    this.container.querySelectorAll('.bim-measure-label').forEach((label) => {
      if (label.style.display === 'none' || label.style.visibility === 'hidden') return;
      const box = label.getBoundingClientRect();
      const lines = [...label.children].map((child) => child.textContent);
      const x = (box.left - frame.left) * scale;
      const y = (box.top - frame.top) * scale;
      context.fillStyle = 'rgba(20, 32, 46, 0.92)';
      context.beginPath();
      context.roundRect(x, y, box.width * scale, box.height * scale, 6 * scale);
      context.fill();
      context.textAlign = 'center';
      context.fillStyle = '#ffd36b';
      context.font = `700 ${14 * scale}px sans-serif`;
      context.fillText(lines[0] || '', x + (box.width * scale) / 2, y + 17 * scale);
      if (lines[1]) {
        context.fillStyle = '#ffffff';
        context.font = `${10.5 * scale}px sans-serif`;
        context.fillText(lines[1], x + (box.width * scale) / 2, y + 31 * scale);
      }
    });
    return new Promise((resolve) => output.toBlob(resolve, 'image/png'));
  }

  /** Ready-made camera positions around the visible models (BIM north is -Z in the scene). */
  async setStandardView(name) {
    const offset = STANDARD_VIEW_OFFSETS[name];
    if (offset) await this.setViewDirection(new THREE.Vector3(...offset));
  }

  /** Looks at the visible models from the given direction (the camera sits along it). */
  async setViewDirection(direction) {
    if (!this.world) return;
    if (this.walk.mode !== 'orbit') await this.exitWalk({ fit: false });
    const bounds = new THREE.Box3();
    this.fragments?.list.forEach((model, modelId) => {
      if (this.modelRecords.get(modelId)?.visible && model.box && !model.box.isEmpty()) bounds.union(model.box);
    });
    if (bounds.isEmpty() && this.collisionBounds && !this.collisionBounds.isEmpty()) bounds.copy(this.collisionBounds);
    if (bounds.isEmpty()) return;
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const c = sphere.center;
    const d = Math.max(sphere.radius, 1) * 2.4;
    const eye = direction.clone().normalize().multiplyScalar(d);
    await this.world.camera.controls.setLookAt(c.x + eye.x, c.y + eye.y, c.z + eye.z, c.x, c.y, c.z, true);
    this.fragments.core.update(true);
    this.world.renderer.needsUpdate = true;
  }

  async fit({ animate = false } = {}) {
    if (!this.world) return;
    const bounds = new THREE.Box3();

    // 1. Usar a caixa delimitadora precisa do proxy de colisão (gerada diretamente da geometria IFC)
    if (this.collisionBounds && !this.collisionBounds.isEmpty()) {
      bounds.copy(this.collisionBounds);
    }

    // 2. Unir com model.box dos metadados dos fragments carregados
    this.fragments?.list.forEach((model, modelId) => {
      if (!this.modelRecords.get(modelId)?.visible) return;
      if (model.box && !model.box.isEmpty()) {
        bounds.union(model.box);
      }
    });

    // 3. Fallback: caso bounds ainda esteja vazio, percorrer malhas visíveis
    if (bounds.isEmpty()) {
      this.fragments?.list.forEach((model, modelId) => {
        if (!this.modelRecords.get(modelId)?.visible) return;
        model.object?.traverse((object) => {
          if ((object.isMesh || object.isInstancedMesh || object.isBatchedMesh) && object.visible && object.geometry) {
            object.updateWorldMatrix(true, false);
            if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
            if (object.geometry.boundingBox) {
              bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
            }
          }
        });
      });
    }

    if (bounds.isEmpty()) return;

    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = Math.max(maxDim * 1.45, 14);

    const controls = this.world.camera.controls;
    if (controls) {
      const eye = new THREE.Vector3(
        center.x + distance * 0.72,
        center.y + distance * 0.55,
        center.z + distance * 0.72
      );
      await controls.setLookAt(
        eye.x, eye.y, eye.z,
        center.x, center.y, center.z,
        animate
      );
      // fitToSphere keeps the oblique viewing angle (fitToBox snaps to an axis).
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      sphere.radius = Math.max(sphere.radius * 0.82, 1);
      await controls.fitToSphere(sphere, animate);
    }

    this.fragments.core.update(true);
    this.world.renderer.needsUpdate = true;
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

  // ---------------------------------------------------------------------------
  // BIM index
  // ---------------------------------------------------------------------------

  /** Loads (or builds) a model's BIM index and maps it to Fragments local ids by GUID. */
  async attachIndex(modelId, loadIndex) {
    const model = this.fragments.list.get(modelId);
    const record = this.modelRecords.get(modelId);
    if (!model || !record) return;
    try {
      const index = await loadIndex();
      if (!index?.elements?.length) return;
      const guids = index.elements.map((element) => element.guid || '');
      const localIds = await model.getLocalIdsByGuids(guids);
      // Elements without a GlobalId keep their IFC express id, which the
      // Fragments importer also uses as local id.
      const resolved = localIds.map((localId, position) => (localId ?? (guids[position] ? null : index.elements[position].id)));
      this.bimIndex.addModel(modelId, record, index, resolved);
    } catch (error) {
      console.warn(`Índice BIM indisponível para ${record.discipline}:`, error);
      this.showStatus(`${record.discipline}: dados BIM indisponíveis (${error.message}). O modelo 3D continua navegável.`);
    }
  }

  getModelSummaries() {
    return [...this.modelRecords.values()].map((record) => ({
      id: record.id,
      discipline: record.discipline,
      name: record.name || record.discipline,
      source: record.source || 'hosted',
      visible: record.visible,
      size: record.size || record.sourceBytes || 0,
      fragmentBytes: record.fragmentBytes || 0,
      cacheState: record.cacheState || null,
      elements: this.bimIndex.models.get(record.id)?.rows.length || 0
    }));
  }

  notifyModels() {
    this.onModelsChange?.(this.getModelSummaries());
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  /** Normalises a ModelIdMap to loaded models and Set values. */
  cleanMap(map) {
    const clean = {};
    Object.entries(map || {}).forEach(([modelId, ids]) => {
      if (!this.fragments?.list.has(modelId)) return;
      const set = new Set(ids);
      if (set.size) clean[modelId] = set;
    });
    return clean;
  }

  emitSelection() {
    const current = this.cleanMap(this.highlighter?.selection?.select || {});
    this.selection = current;
    if (this.xrayEnabled) void this.applyXray();
    this.onSelectionChange?.(current);
  }

  async select(map, { zoom = false, box = null } = {}) {
    if (!this.highlighter) return;
    if (this.explodeDistance) return this.showStatus('Volte a explosão para 0,0 m para selecionar elementos.');
    const clean = this.cleanMap(map);
    if (!Object.keys(clean).length) return this.clearSelection();
    await this.highlighter.highlightByID('select', clean, true, false);
    this.emitSelection();
    this.requestFrames();
    if (zoom) await this.fitToMap(clean, box);
  }

  async clearSelection() {
    if (this.highlighter) await this.highlighter.clear('select');
    this.emitSelection();
  }

  /** Union of the bounding boxes of the given items (scene coordinates). */
  async getMapBox(map) {
    const box = new THREE.Box3();
    for (const [modelId, ids] of Object.entries(this.cleanMap(map))) {
      const model = this.fragments.list.get(modelId);
      if (!model) continue;
      try {
        const merged = await model.getMergedBox([...ids]);
        if (merged?.min && merged?.max && Number.isFinite(merged.min.x)) {
          box.union(new THREE.Box3(
            new THREE.Vector3(merged.min.x, merged.min.y, merged.min.z),
            new THREE.Vector3(merged.max.x, merged.max.y, merged.max.z)
          ));
        }
      } catch (error) {
        console.warn('Não foi possível medir os elementos:', error);
      }
    }
    return box;
  }

  /** Frames the given items; `hint` is an optional {min,max} box already known (e.g. from the BIM index). */
  async fitToMap(map, hint = null) {
    const box = hint ? new THREE.Box3(new THREE.Vector3(...hint.min), new THREE.Vector3(...hint.max)) : await this.getMapBox(map);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    sphere.radius = Math.max(sphere.radius * 1.35, 1.2);
    await this.world.camera.controls.fitToSphere(sphere, true);
    this.fragments.core.update(true);
    this.world.renderer.needsUpdate = true;
  }

  /** Reads the full IFC attributes and property sets of one item. */
  async getItemProperties(modelId, localId) {
    const value = (entry) => {
      let current = entry;
      for (let depth = 0; depth < 4 && current && typeof current === 'object' && 'value' in current; depth += 1) current = current.value;
      return current;
    };
    const data = await this.fragments.getData({ [modelId]: new Set([localId]) }, {
      attributesDefault: true,
      relations: { IsDefinedBy: { attributes: true, relations: true } }
    });
    const item = data[modelId]?.[0];
    if (!item) return null;
    const attributes = {};
    Object.entries(item).forEach(([key, entry]) => {
      if (key === 'IsDefinedBy' || key.startsWith('_')) return;
      const plain = value(entry);
      if (plain !== null && plain !== undefined && typeof plain !== 'object') attributes[key] = plain;
    });
    const sets = [];
    const definitions = Array.isArray(item.IsDefinedBy) ? item.IsDefinedBy : [];
    definitions.forEach((definition, index) => {
      const title = value(definition.Name) || value(definition._category) || `Conjunto ${index + 1}`;
      const entries = definition.HasProperties || definition.Quantities || [];
      const rows = {};
      (Array.isArray(entries) ? entries : []).forEach((property) => {
        const name = value(property.Name);
        const raw = value(property.NominalValue ?? property.LengthValue ?? property.AreaValue ?? property.VolumeValue ?? property.CountValue ?? property.WeightValue ?? property.TimeValue);
        if (name && raw !== undefined && raw !== null && typeof raw !== 'object') rows[name] = raw;
      });
      if (!Object.keys(rows).length) {
        const flat = [];
        this.flattenItem(definition, '', flat, new WeakSet(), 0, 3, 60);
        flat.forEach(({ key, value: entryValue }) => { if (!key.startsWith('_')) rows[key] = entryValue; });
      }
      if (Object.keys(rows).length) sets.push({ title, rows, quantities: Boolean(definition.Quantities) });
    });
    return { attributes, sets };
  }

  // ---------------------------------------------------------------------------
  // Visibility, X-ray and colours
  // ---------------------------------------------------------------------------

  async afterVisibilityChange() {
    await this.refreshExplodedView();
    await this.fragments.core.update(true);
    this.requestFrames();
  }

  /** Highlights and visibility are applied by the Fragments worker; draw again once they land. */
  requestFrames() {
    if (!this.world?.renderer) return;
    this.world.renderer.needsUpdate = true;
    clearTimeout(this.frameTimer);
    this.frameTimer = setTimeout(() => {
      this.fragments?.core.update(true);
      this.world.renderer.needsUpdate = true;
    }, 120);
  }

  async isolate(map) {
    const clean = this.cleanMap(map);
    if (!Object.keys(clean).length) return;
    await this.hider.isolate(clean);
    await this.afterVisibilityChange();
  }

  async setItemsVisible(map, visible) {
    const clean = this.cleanMap(map);
    if (!Object.keys(clean).length) return;
    await this.hider.set(visible, clean);
    await this.afterVisibilityChange();
  }

  async showAll() {
    await this.hider.set(true);
    if (!this.spacesVisible) {
      for (const model of this.fragments.list.values()) await this.hideSpaces(model);
    }
    await this.afterVisibilityChange();
  }

  async setSpacesVisible(visible) {
    this.spacesVisible = visible;
    for (const model of this.fragments.list.values()) {
      const byCategory = await model.getItemsOfCategories([/^IFCSPACE$/i]);
      const spaces = Object.values(byCategory).flat();
      if (spaces.length) await model.setVisible(spaces, visible);
    }
    await this.afterVisibilityChange();
  }

  ensureStyle(name, color, { opacity = 1, transparent = false, priority = 1 } = {}) {
    this.highlighter.styles.set(name, {
      color: new THREE.Color(color),
      opacity,
      transparent,
      renderedFaces: RenderedFaces.TWO,
      priority
    });
  }

  async setXray(enabled) {
    this.xrayEnabled = Boolean(enabled);
    await this.applyXray();
  }

  async applyXray() {
    if (!this.highlighter) return;
    if (!this.highlighter.styles.has(XRAY_STYLE)) {
      this.ensureStyle(XRAY_STYLE, '#a7b0ba', { opacity: 0.07, transparent: true, priority: 10 });
    }
    const version = (this.xrayVersion = (this.xrayVersion || 0) + 1);
    if (!this.xrayEnabled) {
      await this.highlighter.clear(XRAY_STYLE);
      this.requestFrames();
      return;
    }
    const map = {};
    for (const [modelId, model] of this.fragments.list) {
      if (!this.modelRecords.get(modelId)?.visible) continue;
      // The list of items with geometry never changes for a loaded model; asking
      // the worker again on every selection change is wasted work.
      this.geometryIdCache ??= new Map();
      let ids = this.geometryIdCache.get(modelId);
      if (!ids) {
        ids = await model.getItemsIdsWithGeometry();
        this.geometryIdCache.set(modelId, ids);
      }
      const selected = this.selection[modelId];
      const ghosted = selected ? ids.filter((id) => !selected.has(id)) : ids;
      if (ghosted.length) map[modelId] = new Set(ghosted);
    }
    if (version !== this.xrayVersion) return;
    await this.highlighter.clear(XRAY_STYLE);
    if (Object.keys(map).length) await this.highlighter.highlightByID(XRAY_STYLE, map, true, false);
    this.requestFrames();
  }

  /** @param {{color:string, map:object}[]} groups */
  async applyColorGroups(groups) {
    if (!this.highlighter) return;
    await this.clearColorGroups();
    this.colorGroups = [];
    for (let index = 0; index < groups.length; index += 1) {
      const name = `${COLOR_STYLE_PREFIX}${index}`;
      const clean = this.cleanMap(groups[index].map);
      if (!Object.keys(clean).length) continue;
      this.ensureStyle(name, groups[index].color, { priority: 1 });
      this.colorGroups.push(name);
      await this.highlighter.highlightByID(name, clean, true, false);
    }
    this.requestFrames();
  }

  async clearColorGroups() {
    if (!this.highlighter) return;
    const names = [...this.highlighter.styles.keys()].filter((name) => name.startsWith(COLOR_STYLE_PREFIX));
    for (const name of names) {
      await this.highlighter.clear(name);
      this.highlighter.styles.delete(name);
    }
    this.colorGroups = [];
    this.requestFrames();
  }

  /** Back to a neutral presentation: no selection, colours, X-ray, plan or hidden items. */
  async resetPresentation() {
    if (!this.highlighter) return;
    await this.exitPlan({ fit: false });
    this.setMeasureMode(null);
    this.clearMeasurements();
    await this.clearColorGroups();
    this.xrayEnabled = false;
    await this.highlighter.clear(XRAY_STYLE).catch(() => {});
    await this.highlighter.clear('select');
    this.selection = {};
    if (this.fragments?.list.size) await this.hider.set(true);
    this.onSelectionChange?.({});
  }

  // ---------------------------------------------------------------------------
  // Storey plan
  // ---------------------------------------------------------------------------

  /** Shows only the given storey's elements, cut 1.2 m above its lowest point, seen from above. */
  async enterPlan(map, label, { baseY = null, styles = [], box: hint = null } = {}) {
    if (this.walk.mode !== 'orbit') await this.exitWalk({ fit: false });
    if (this.explodeDistance) await this.setExplodeDistance(0);
    const clean = this.cleanMap(map);
    const box = hint ? new THREE.Box3(new THREE.Vector3(...hint.min), new THREE.Vector3(...hint.max)) : await this.getMapBox(clean);
    if (box.isEmpty()) return false;
    await this.isolate(clean);
    // Cut 1.2 m above the storey level, as in a floor plan. Without a known
    // level, fall back to the lowest point of the storey's elements.
    const base = Number.isFinite(baseY) && baseY > box.min.y - 2 && baseY < box.max.y + 0.5 ? baseY : box.min.y;
    const cut = Math.min(base + PLAN_CUT_HEIGHT, Math.max(box.max.y + 0.02, base + 0.05));
    this.resetClipBox();
    this.setClipBox({ minY: Math.max(box.min.y, base - 0.35) - 0.05, maxY: cut });
    const center = box.getCenter(new THREE.Vector3());
    await this.world.camera.projection.set('Orthographic');
    this.world.camera.set('Plan');
    await this.world.camera.controls.setLookAt(center.x, box.max.y + 60, center.z + 0.001, center.x, box.min.y, center.z, false);
    await this.world.camera.controls.fitToBox(box, true, { paddingTop: 1.5, paddingBottom: 3, paddingLeft: 1.5, paddingRight: 1.5 });
    this.plan = { label, map: clean };
    // Drawing convention for the plan: cut walls dark, floors light, etc.
    for (let index = 0; index < styles.length; index += 1) {
      const name = `${PLAN_STYLE_PREFIX}${index}`;
      const styleMap = this.cleanMap(styles[index].map);
      if (!Object.keys(styleMap).length) continue;
      this.ensureStyle(name, styles[index].color, { priority: 5 });
      await this.highlighter.highlightByID(name, styleMap, true, false);
    }
    this.requestFrames();
    this.fragments.core.update(true);
    this.world.renderer.needsUpdate = true;
    this.onModeChange?.({ plan: label });
    return true;
  }

  async exitPlan({ fit = true } = {}) {
    if (!this.plan) return;
    this.plan = null;
    for (const name of [...this.highlighter.styles.keys()].filter((key) => key.startsWith(PLAN_STYLE_PREFIX))) {
      await this.highlighter.clear(name);
      this.highlighter.styles.delete(name);
    }
    this.world.camera.set('Orbit');
    await this.world.camera.projection.set('Perspective');
    this.resetClipBox();
    await this.showAll();
    if (fit) await this.fit({ animate: true });
    this.onModeChange?.({ plan: null });
  }

  // ---------------------------------------------------------------------------
  // Measurements
  // ---------------------------------------------------------------------------

  ensureMeasurements() {
    if (this.measurements) return this.measurements;
    // One in-house tool for distance, angle and area: click-click with snap and live preview.
    this.measurements = new MeasureTool({
      world: this.world,
      raycaster: this.sceneRaycaster,
      container: this.container,
      onHint: (text) => this.onMeasureHint?.(text)
    });
    return this.measurements;
  }

  /** @param {'length'|'area'|null} mode */
  async setMeasureMode(mode) {
    if (!this.components) return;
    // Measuring works while walking once the mouse is released (Esc); only the
    // spawn-placement step still competes for the click and is left first.
    if (mode && this.walk.mode === 'placement') await this.exitWalk({ fit: false });
    if (mode && this.walk.mode === 'walk' && this.walkControls?.isLocked) this.walkControls.unlock();
    const tool = mode || this.measurements ? this.ensureMeasurements() : null;
    this.measureMode = mode || null;
    if (tool) {
      if (mode) tool.enable(mode); else tool.disable();
    }
    // The selection click would compete with picking measurement points.
    if (this.highlighter) this.highlighter.enabled = !mode;
    this.world.renderer.needsUpdate = true;
  }

  clearMeasurements() {
    if (!this.measurements) return;
    try { this.measurements.clear(); } catch (error) { console.warn('Falha ao limpar medições:', error); }
    this.world.renderer.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  // Saved views
  // ---------------------------------------------------------------------------

  getViewState() {
    const controls = this.world?.camera?.controls;
    if (!controls) return null;
    const position = controls.getPosition(new THREE.Vector3());
    const target = controls.getTarget(new THREE.Vector3());
    return {
      position: position.toArray().map((value) => Number(value.toFixed(3))),
      target: target.toArray().map((value) => Number(value.toFixed(3))),
      clip: this.getClipBox()
    };
  }

  async applyViewState(state) {
    if (!state?.position || !state?.target) return;
    if (this.walk.mode !== 'orbit') await this.exitWalk({ fit: false });
    if (this.plan) await this.exitPlan({ fit: false });
    const [px, py, pz] = state.position;
    const [tx, ty, tz] = state.target;
    await this.world.camera.controls.setLookAt(px, py, pz, tx, ty, tz, true);
    if (state.clip) this.setClipBox(state.clip);
    else this.resetClipBox();
    this.fragments.core.update(true);
    this.world.renderer.needsUpdate = true;
  }

  setActive(active) {
    if (!this.components) return;
    if (!active && this.walk.mode !== 'orbit') this.exitWalk({ fit: false });
    this.components.enabled = active;
    this.world.enabled = active;
    if (active) this.world.renderer.needsUpdate = true;
  }
}

mixin(ViewerEngine, ClipBoxMethods);
mixin(ViewerEngine, ExplodedViewMethods);
mixin(ViewerEngine, CollisionMethods);
mixin(ViewerEngine, WalkMethods);
mixin(ViewerEngine, HoverMethods);
