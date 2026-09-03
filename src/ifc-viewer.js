import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { IfcAPI, IFCBUILDINGSTOREY, IFCRELCONTAINEDINSPATIALSTRUCTURE, IFCDOOR, IFCDOORSTANDARDCASE, IFCWINDOW, IFCWINDOWSTANDARDCASE, IFCOPENINGELEMENT } from 'web-ifc';
import wasmUrl from 'web-ifc/web-ifc.wasm?url';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

const DEMOS = {
  'casa-terrea': [
    ['Arquitetura', 'assets/IFC/Casa Térrea/RTA-ARQ-PRE-R07(Design).ifc'],
    ['Estrutural', 'assets/IFC/Casa Térrea/AION-GM_BIM-JD_SUL_60-EST-R06.IFC'],
    ['Elétrica', 'assets/IFC/Casa Térrea/AION-GM_BIM-JD_SUL_60-ELE-R04.ifc']
  ],
  galpao: [
    ['Arquitetura', 'assets/IFC/Galpão/ARQ.ifc'],
    ['Estrutural', 'assets/IFC/Galpão/EST.ifc']
  ]
};

const clipLabels = [['minX', 'X−'], ['maxX', 'X+'], ['minY', 'Y−'], ['maxY', 'Y+'], ['minZ', 'Z−'], ['maxZ', 'Z+']];
const PASSABLE_TYPES = new Set([IFCDOOR, IFCDOORSTANDARDCASE, IFCWINDOW, IFCWINDOWSTANDARDCASE, IFCOPENINGELEMENT]);
const fmtSize = (value) => value < 1024 ** 2 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 ** 2).toFixed(1)} MB`;
const primitive = (value) => value && typeof value === 'object' && 'value' in value ? primitive(value.value) : value;
const valueText = (value) => {
  const plain = primitive(value);
  if (plain === null || plain === undefined || plain === '') return '—';
  if (Array.isArray(plain)) return plain.map(valueText).join(', ');
  if (typeof plain === 'object') return plain.expressID ? `#${plain.expressID}` : JSON.stringify(plain);
  return String(plain);
};

class IFCViewer {
  constructor() {
    this.api = null;
    this.ready = false;
    this.models = new Map();
    this.meshes = [];
    this.mode = 'orbit';
    this.selection = null;
    this.clipBox = null;
    this.clipPlanes = [];
    this.explodeDistance = 0;
    this.background = localStorage.getItem('ifc-background') || '#f7f5f0';
    this.walk = { keys: new Set(), jumpRequested: false, velocityY: 0, grounded: true, height: 1.7, radius: .28, stepHeight: .2, gravity: 24, terminalVelocity: 28, speed: 3.8, run: 7.2, zoom: 1 };
    this.lastFrame = performance.now();
    this.lastRender = 0;
    this.needsRender = true;
    this.federationCenter = null;
    // deviceMemory is an optional browser hint. When it exists, use it only to
    // choose a safer profile; an unknown value never blocks a capable computer.
    this.deviceMemory = Number(navigator.deviceMemory) || null;
    this.safeProfile = this.deviceMemory !== null && this.deviceMemory <= 8;
    this.maxSafeInputBytes = 110 * 1024 ** 2;
    this.initDom();
    this.bindUi();
  }

  initDom() {
    this.modal = document.getElementById('ifc-viewer-modal');
    this.container = document.getElementById('ifc-canvas-container');
    this.list = document.getElementById('ifc-model-list');
    this.empty = document.getElementById('ifc-model-empty');
    this.loading = document.getElementById('ifc-loading-overlay');
    this.loadingText = document.getElementById('ifc-loading-text');
    this.progress = document.getElementById('ifc-progress-bar');
    this.status = document.getElementById('ifc-status');
    this.properties = document.getElementById('ifc-properties-content');
    this.search = document.getElementById('ifc-property-search');
    this.walkHelp = document.getElementById('ifc-walk-help');
    this.walkCrosshair = document.getElementById('ifc-walk-crosshair');
  }

  bindUi() {
    document.getElementById('ifc-close-btn').addEventListener('click', () => this.closeViewer());
    document.getElementById('ifc-fullscreen-btn').addEventListener('click', () => this.toggleFullscreen());
    document.getElementById('ifc-file-input').addEventListener('change', (event) => this.addFiles(event.target.files));
    document.getElementById('ifc-load-demo-btn').addEventListener('click', () => this.loadDemo(this.demoKey === 'galpao' ? 'casa-terrea' : 'galpao'));
    document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => this.handleAction(button.dataset.action)));
    document.getElementById('ifc-explode-range').addEventListener('input', (event) => this.setExplodeDistance(Number(event.target.value)));
    document.getElementById('ifc-background-input').addEventListener('input', (event) => this.setBackground(event.target.value));
    document.querySelectorAll('[data-color]').forEach((button) => button.addEventListener('click', () => this.setBackground(button.dataset.color)));
    document.getElementById('ifc-reset-clip').addEventListener('click', () => this.resetClipBox());
    this.search.addEventListener('input', () => this.filterProperties());
    window.addEventListener('keydown', (event) => this.onKey(event, true));
    window.addEventListener('keyup', (event) => this.onKey(event, false));
  }

  async ensureScene() {
    if (this.scene) return;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.background);
    this.camera = new THREE.PerspectiveCamera(50, 1, .1, 2000);
    this.camera.position.set(18, 14, 18);
    // IFCs often contain thousands of draw calls. Avoid forcing the discrete GPU and
    // cap the internal canvas resolution before it becomes needlessly expensive.
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
    } catch {
      throw new Error('WebGL não está disponível. Ative a aceleração de hardware do navegador ou use um dispositivo com gráficos compatíveis.');
    }
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.safeProfile ? 1 : 1.25));
    this.renderer.localClippingEnabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.prepend(this.renderer.domElement);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = .08;
    this.orbit.maxPolarAngle = Math.PI / 2 + .03;
    this.orbit.addEventListener('change', () => this.requestRender());
    this.pointer = new PointerLockControls(this.camera, this.renderer.domElement);
    this.pointer.pointerSpeed = .85;
    this.pointer.addEventListener('unlock', () => {
      if (this.mode !== 'walk') return;
      this.walk.keys.clear();
      this.walk.jumpRequested = false;
      this.walk.mouseReleased = true;
      this.walk.ignoreEscapeUntil = performance.now() + 150;
      this.showStatus('Mouse liberado. Clique no modelo para continuar caminhando ou pressione Esc novamente para sair.');
    });
    this.renderer.domElement.addEventListener('click', (event) => this.onCanvasClick(event));
    this.renderer.domElement.addEventListener('wheel', (event) => this.onWalkWheel(event), { passive: false });
    this.renderer.domElement.addEventListener('dragover', (event) => event.preventDefault());
    this.renderer.domElement.addEventListener('drop', (event) => { event.preventDefault(); this.addFiles(event.dataTransfer.files); });
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x657169, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(15, 30, 20); this.scene.add(key);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.raycaster = new THREE.Raycaster(); this.raycaster.firstHitOnly = true; this.mouse = new THREE.Vector2();
    this.walkRaycaster = new THREE.Raycaster(); this.walkRaycaster.firstHitOnly = true;
    this.wallRaycaster = new THREE.Raycaster(); this.wallRaycaster.firstHitOnly = true;
    new ResizeObserver(() => this.resize()).observe(this.container);
    this.resize(); this.animate();
  }

  async ensureIfc() {
    if (this.ready) return;
    this.setLoading(true, 'Inicializando motor IFC…', 5);
    this.api = new IfcAPI();
    // Vite hashes the WASM asset; locateFile must return the exact emitted URL.
    await this.api.Init(() => wasmUrl);
    this.ready = true;
  }

  async openViewer(workKey = 'casa-terrea') {
    this.modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    try {
      await this.ensureScene();
      if (this.safeProfile) this.showStatus('Modo econômico ativo: renderização reduzida para este dispositivo com até 8 GB de RAM.');
      if (!this.models.size) await this.loadDemo(workKey);
      else this.resize();
      requestAnimationFrame(() => this.resize());
    } catch (error) { this.showStatus(`Não foi possível iniciar o visualizador: ${error.message}`); }
  }

  closeViewer() {
    this.pointer?.unlock();
    this.setMode('orbit');
    this.modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  async loadDemo(key) {
    this.demoKey = key;
    const definitions = DEMOS[key] || DEMOS['casa-terrea'];
    await this.removeAllModels();
    this.setLoading(true, `Carregando ${key === 'galpao' ? 'Galpão Industrial' : 'Casa Térrea'}…`, 0);
    for (let index = 0; index < definitions.length; index += 1) {
      const [discipline, path] = definitions[index];
      try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`arquivo não encontrado (${response.status})`);
        const buffer = await response.arrayBuffer();
        await this.loadBuffer(buffer, path.split('/').pop(), discipline, 'demo', index, definitions.length);
      } catch (error) { this.showStatus(`Não foi possível carregar ${discipline}: ${error.message}`); }
    }
    this.setLoading(false); this.fitModelToView();
  }

  async addFiles(fileList) {
    const files = [...(fileList || [])].filter((file) => /\.ifc$/i.test(file.name));
    if (!files.length) return this.showStatus('Selecione arquivos no formato IFC.');
    if (this.models.size + files.length > 3) return this.showStatus('O visualizador aceita no máximo três modelos de cada vez. Remova um modelo antes de adicionar outro.');
    const incomingBytes = files.reduce((total, file) => total + file.size, 0);
    const loadedBytes = [...this.models.values()].reduce((total, model) => total + model.size, 0);
    if (this.safeProfile && loadedBytes + incomingBytes > this.maxSafeInputBytes) return this.showStatus('Modo econômico: com até 8 GB de RAM, carregue um IFC por vez e mantenha o total abaixo de 110 MB para evitar travamento.');
    if (files.some((file) => file.size > 200 * 1024 ** 2)) this.showStatus('Arquivo acima de 200 MB: o carregamento pode exigir mais memória deste dispositivo.');
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try { await this.loadBuffer(await file.arrayBuffer(), file.name, this.guessDiscipline(file.name), 'local', index, files.length); }
      catch (error) { this.showStatus(`Não foi possível ler ${file.name}: ${error.message}`); }
    }
    this.setLoading(false); this.fitModelToView();
  }

  guessDiscipline(name) { const upper = name.toUpperCase(); return /EST|STR/.test(upper) ? 'Estrutural' : /ELE|HID|MEP/.test(upper) ? 'MEP' : 'Arquitetura'; }

  async loadBuffer(buffer, name, discipline, source, index, total) {
    await this.ensureScene(); await this.ensureIfc();
    this.setLoading(true, `Processando ${name}…`, Math.round((index / total) * 90));
    const modelID = this.api.OpenModel(new Uint8Array(buffer));
    const id = `${source}-${Date.now()}-${modelID}`;
    const group = new THREE.Group(); group.name = name; this.root.add(group);
    const record = { id, name, source, size: buffer.byteLength, status: 'Carregado', visible: true, opacity: 1, modelID, group, meshes: [], floors: new Map(), error: null };
    const materialCache = new Map();
    this.api.StreamAllMeshes(modelID, (flatMesh) => {
      const expressID = flatMesh.expressID;
      for (let i = 0; i < flatMesh.geometries.size(); i += 1) {
        const placed = flatMesh.geometries.get(i); const geometry = this.api.GetGeometry(modelID, placed.geometryExpressID);
        const verts = this.api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
        const indices = this.api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());
        if (!verts.length || !indices.length) continue;
        const bufferGeometry = new THREE.BufferGeometry(); const positions = []; const normals = [];
        for (let p = 0; p < verts.length; p += 6) { positions.push(verts[p], verts[p + 1], verts[p + 2]); normals.push(verts[p + 3], verts[p + 4], verts[p + 5]); }
        bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        bufferGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); bufferGeometry.setIndex([...indices]);
        bufferGeometry.applyMatrix4(new THREE.Matrix4().fromArray(placed.flatTransformation)); bufferGeometry.computeBoundsTree();
        const color = placed.color || { x: .72, y: .72, z: .72, w: 1 }; const key = `${color.x}-${color.y}-${color.z}-${color.w}`;
        if (!materialCache.has(key)) {
          const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(color.x, color.y, color.z), transparent: color.w < .99, opacity: color.w, roughness: .72, metalness: .08, side: THREE.DoubleSide, clippingPlanes: this.clipPlanes });
          material.userData.ifcBaseOpacity = color.w;
          materialCache.set(key, material);
        }
        const elementType = this.api.GetLineType(modelID, expressID);
        const mesh = new THREE.Mesh(bufferGeometry, materialCache.get(key)); mesh.userData = { modelId: id, modelID, expressID, discipline, collidable: !PASSABLE_TYPES.has(elementType), originalPosition: mesh.position.clone() };
        group.add(mesh); record.meshes.push(mesh); this.meshes.push(mesh);
      }
    });
    this.models.set(id, record);
    await this.mapFloors(record);
    this.refreshExplosionCache();
    if (this.explodeDistance) this.setExplodeDistance(this.explodeDistance);
    this.renderModels();
    this.resetClipBox();
    this.requestRender();
  }

  async mapFloors(record) {
    try {
      const storeys = this.api.GetLineIDsWithType(record.modelID, IFCBUILDINGSTOREY);
      const contained = this.api.GetLineIDsWithType(record.modelID, IFCRELCONTAINEDINSPATIALSTRUCTURE);
      const membership = new Map();
      for (let i = 0; i < contained.size(); i += 1) { const rel = this.api.GetLine(record.modelID, contained.get(i)); const structure = primitive(rel.RelatingStructure); for (const item of rel.RelatedElements || []) membership.set(primitive(item), structure); }
      for (let i = 0; i < storeys.size(); i += 1) { const storeyId = storeys.get(i); const line = this.api.GetLine(record.modelID, storeyId); record.floors.set(storeyId, { name: valueText(line.Name) || `Pavimento ${i + 1}`, order: i, meshes: record.meshes.filter((mesh) => membership.get(mesh.userData.expressID) === storeyId) }); }
    } catch { /* IFC files without spatial structure simply do not explode by floor. */ }
  }

  renderModels() {
    this.list.innerHTML = ''; this.empty.classList.toggle('hidden', this.models.size > 0);
    this.models.forEach((model) => {
      const row = document.createElement('div'); row.className = 'ifc-model-row';
      const transparency = Math.round((1 - model.opacity) * 100);
      row.innerHTML = `<input type="checkbox" ${model.visible ? 'checked' : ''} aria-label="Mostrar ${model.name}"><details class="ifc-model-menu"><summary><strong>${model.name}</strong><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary><small>${model.source === 'demo' ? 'Demonstração · ' : ''}${fmtSize(model.size)} · ${model.status}</small><label class="ifc-model-opacity">Transparência <output>${transparency}%</output><input type="range" min="0" max="100" step="1" value="${transparency}" aria-label="Transparência de ${model.name}"></label></details><button class="ifc-model-remove" title="Remover modelo"><i class="fa-solid fa-trash"></i></button>`;
      row.querySelector('input[type="checkbox"]').addEventListener('change', (event) => this.setModelVisibility(model.id, event.target.checked));
      row.querySelector('input[type="range"]').addEventListener('input', (event) => this.setModelOpacity(model.id, Number(event.target.value) / 100, row.querySelector('output')));
      row.querySelector('button').addEventListener('click', () => this.removeModel(model.id)); this.list.append(row);
    });
  }

  setModelVisibility(id, visible) { const model = this.models.get(id); if (!model) return; model.visible = visible; model.group.visible = visible; this.clearSelection(); this.requestRender(); }
  setModelOpacity(id, transparency, output) {
    const model = this.models.get(id); if (!model) return;
    model.opacity = 1 - transparency;
    const materials = new Set(model.meshes.map((mesh) => mesh.material));
    materials.forEach((material) => {
      const effectiveOpacity = (material.userData.ifcBaseOpacity ?? 1) * model.opacity;
      material.opacity = effectiveOpacity; material.transparent = effectiveOpacity < .999; material.depthWrite = effectiveOpacity >= .999; material.needsUpdate = true;
    });
    if (output) output.textContent = `${Math.round(transparency * 100)}%`;
    this.requestRender();
  }
  async removeModel(id) { const model = this.models.get(id); if (!model) return; this.clearSelection(); model.meshes.forEach((mesh) => { this.meshes = this.meshes.filter((entry) => entry !== mesh); mesh.geometry.disposeBoundsTree?.(); mesh.geometry.dispose(); mesh.material.dispose(); }); this.root.remove(model.group); this.api.CloseModel(model.modelID); this.models.delete(id); this.refreshExplosionCache(); if (this.explodeDistance) this.setExplodeDistance(this.explodeDistance); this.renderModels(); this.resetClipBox(); this.requestRender(); }
  async removeAllModels() { await Promise.all([...this.models.keys()].map((id) => this.removeModel(id))); }

  fitModelToView() { if (!this.meshes.length) return; const box = new THREE.Box3(); this.meshes.filter((mesh) => mesh.parent?.visible).forEach((mesh) => box.expandByObject(mesh)); if (box.isEmpty()) return; const center = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3()); const distance = Math.max(12, Math.max(size.x, size.y, size.z) * 1.35); this.orbit.target.copy(center); this.camera.position.set(center.x + distance, center.y + distance * .62, center.z + distance); this.orbit.update(); this.requestRender(); }

  handleAction(action) { if (action === 'orbit') return this.setMode('orbit'); if (action === 'walk') return this.setMode('walk-placement'); if (action === 'fit') return this.fitModelToView(); if (action === 'explode') return this.togglePanel('ifc-explode-panel'); if (action === 'clip') return this.togglePanel('ifc-clip-panel'); if (action === 'background') return this.togglePanel('ifc-background-panel'); }
  togglePanel(id) {
    const panel = document.getElementById(id);
    const shouldOpen = panel.classList.contains('hidden');
    document.querySelectorAll('.ifc-float-panel').forEach((entry) => entry.classList.add('hidden'));
    if (shouldOpen) panel.classList.remove('hidden');
  }
  setMode(mode, { unlock = true } = {}) {
    this.mode = mode;
    this.orbit && (this.orbit.enabled = mode === 'orbit');
    if (mode !== 'walk') {
      this.walk.keys.clear();
      this.walk.jumpRequested = false;
      this.walk.velocityY = 0;
      if (unlock) this.pointer?.unlock();
      if (this.camera && this.walk.zoom !== 1) { this.walk.zoom = 1; this.camera.zoom = 1; this.camera.updateProjectionMatrix(); }
    }
    this.walkHelp.classList.toggle('hidden', mode !== 'walk-placement');
    this.walkCrosshair?.classList.toggle('hidden', mode !== 'walk');
    if (mode === 'walk') { this.walk.mouseReleased = false; this.walk.ignoreEscapeUntil = 0; }
    this.renderer?.domElement.classList.toggle('ifc-place-cursor', mode === 'walk-placement');
    document.querySelectorAll('[data-action="orbit"],[data-action="walk"]').forEach((button) => button.classList.toggle('active', button.dataset.action === (mode === 'orbit' ? 'orbit' : 'walk')));
    requestAnimationFrame(() => this.resize());
    this.requestRender();
  }
  exitWalk({ unlock = true } = {}) {
    this.setMode('orbit', { unlock });
    this.fitModelToView();
  }
  onWalkWheel(event) {
    if (this.mode !== 'walk' || !this.pointer?.isLocked) return;
    event.preventDefault();
    this.walk.zoom = THREE.MathUtils.clamp(this.walk.zoom - event.deltaY * .0015, .65, 2.5);
    this.camera.zoom = this.walk.zoom;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  onCanvasClick(event) {
    if (!this.meshes.length) return;
    if (this.pointer?.isLocked) {
      if (this.mode === 'walk') {
        this.mouse.set(0, 0); this.raycaster.setFromCamera(this.mouse, this.camera);
        const hit = this.raycaster.intersectObjects(this.visibleMeshes(), false)[0];
        if (hit) this.inspect(hit.object, hit.point); else this.clearSelection();
      }
      return;
    }
    if (this.mode === 'walk') {
      this.walk.mouseReleased = false;
      this.pointer.lock(true);
      return;
    }
    const rect = this.renderer.domElement.getBoundingClientRect(); this.mouse.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); this.raycaster.setFromCamera(this.mouse, this.camera);
    const hit = this.raycaster.intersectObjects(this.meshes.filter((mesh) => mesh.parent?.visible), false)[0];
    if (!hit) return this.clearSelection();
    if (this.mode === 'walk-placement') {
      const normal = hit.face?.normal.clone().transformDirection(hit.object.matrixWorld) || new THREE.Vector3();
      if (normal.y < .55) return this.showStatus('Escolha uma superfície de piso para iniciar a caminhada.');
      this.camera.position.copy(hit.point).add(new THREE.Vector3(0, this.walk.height, 0));
      this.walk.velocityY = 0;
      this.walk.grounded = true;
      this.setMode('walk');
      this.pointer.lock(true);
      return;
    }
    this.inspect(hit.object, hit.point);
  }

  async inspect(mesh, point) {
    this.clearSelection(); this.selection = mesh; mesh.material.emissive = new THREE.Color(0x6a4c08); mesh.material.emissiveIntensity = .35;
    this.requestRender();
    const { modelID, expressID, discipline } = mesh.userData; this.properties.innerHTML = '<p class="ifc-empty-copy">Consultando propriedades IFC…</p>';
    try {
      const line = this.api.GetLine(modelID, expressID, false, true); const type = this.api.GetNameFromTypeCode(this.api.GetLineType(modelID, expressID));
      const groups = { Identificação: { 'Classe IFC': type, ExpressID: `#${expressID}`, Disciplina: discipline, GUID: line.GlobalId, Nome: line.Name, Descrição: line.Description }, Localização: { X: `${point.x.toFixed(2)} m`, Y: `${point.y.toFixed(2)} m`, Z: `${point.z.toFixed(2)} m` }, Atributos: {} };
      Object.entries(line).forEach(([key, value]) => { if (!['expressID', 'GlobalId', 'Name', 'Description'].includes(key)) groups.Atributos[key] = valueText(value); });
      if (this.api.properties) {
        const psets = await this.api.properties.getPropertySets(modelID, expressID, true, true);
        const materials = await this.api.properties.getMaterialsProperties(modelID, expressID, true, true);
        psets.forEach((set, index) => {
          const title = valueText(set.Name) || `Conjunto de propriedades ${index + 1}`;
          const values = {};
          (set.HasProperties || set.Quantities || []).forEach((property) => {
            const key = valueText(property.Name) || `Propriedade #${property.expressID}`;
            values[key] = valueText(property.NominalValue || property.LengthValue || property.AreaValue || property.VolumeValue || property.CountValue || property);
          });
          if (Object.keys(values).length) groups[title] = values;
        });
        if (materials.length) groups.Materiais = Object.fromEntries(materials.map((material, index) => [`Material ${index + 1}`, valueText(material.Name) || valueText(material.Category) || `#${material.expressID}`]));
      }
      this.properties.innerHTML = Object.entries(groups).map(([title, values]) => `<section class="ifc-property-group"><h3>${title}</h3>${Object.entries(values).map(([key, value]) => `<dl class="ifc-property-row"><dt>${key}</dt><dd>${valueText(value)}</dd></dl>`).join('')}</section>`).join(''); this.filterProperties();
    } catch (error) { this.properties.innerHTML = `<p class="ifc-empty-copy">Não foi possível obter as propriedades: ${error.message}</p>`; }
  }

  clearSelection() { if (this.selection) { this.selection.material.emissive = new THREE.Color(0x000000); this.selection.material.emissiveIntensity = 0; } this.selection = null; this.properties.innerHTML = '<p class="ifc-empty-copy">Selecione um elemento no modelo para consultar seus dados IFC.</p>'; this.search.value = ''; this.requestRender(); }
  filterProperties() { const query = this.search.value.trim().toLocaleLowerCase('pt-BR'); this.properties.querySelectorAll('.ifc-property-row').forEach((row) => row.classList.toggle('is-hidden', !!query && !row.textContent.toLocaleLowerCase('pt-BR').includes(query))); }

  setExplodeDistance(distance) {
    document.getElementById('ifc-explode-value').textContent = `${distance.toFixed(1).replace('.', ',')} m`;
    if (!this.meshes.length) return;
    if (!this.federationCenter) this.refreshExplosionCache();
    this.meshes.forEach((mesh) => {
      const direction = mesh.userData.explosionCenter.clone().sub(this.federationCenter);
      if (direction.lengthSq() > .000001) direction.normalize();
      mesh.position.copy(mesh.userData.originalPosition).addScaledVector(direction, distance);
    });
    this.explodeDistance = distance;
    this.applyClipBox();
    this.requestRender();
  }
  refreshExplosionCache() {
    const bounds = new THREE.Box3();
    this.meshes.forEach((mesh) => {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      mesh.userData.explosionCenter = mesh.geometry.boundingBox.getCenter(new THREE.Vector3()).add(mesh.userData.originalPosition);
      bounds.expandByPoint(mesh.userData.explosionCenter);
    });
    this.federationCenter = bounds.isEmpty() ? null : bounds.getCenter(new THREE.Vector3());
  }
  resetClipBox() {
    if (!this.meshes.length) return this.renderClipControls(); const box = new THREE.Box3(); this.meshes.forEach((mesh) => box.expandByObject(mesh)); const padding = .01; this.clipBox = { minX: box.min.x - padding, maxX: box.max.x + padding, minY: box.min.y - padding, maxY: box.max.y + padding, minZ: box.min.z - padding, maxZ: box.max.z + padding }; this.applyClipBox(); this.renderClipControls();
  }
  applyClipBox() {
    if (!this.clipBox) return;
    const padding = this.explodeDistance || 0;
    const b = { minX: this.clipBox.minX - padding, maxX: this.clipBox.maxX + padding, minY: this.clipBox.minY - padding, maxY: this.clipBox.maxY + padding, minZ: this.clipBox.minZ - padding, maxZ: this.clipBox.maxZ + padding };
    if (this.clipPlanes.length !== 6) {
      this.clipPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0)), new THREE.Plane(new THREE.Vector3(-1, 0, 0)), new THREE.Plane(new THREE.Vector3(0, 1, 0)), new THREE.Plane(new THREE.Vector3(0, -1, 0)), new THREE.Plane(new THREE.Vector3(0, 0, 1)), new THREE.Plane(new THREE.Vector3(0, 0, -1))];
      new Set(this.meshes.map((mesh) => mesh.material)).forEach((material) => { material.clippingPlanes = this.clipPlanes; material.needsUpdate = true; });
    }
    [-b.minX, b.maxX, -b.minY, b.maxY, -b.minZ, b.maxZ].forEach((constant, index) => { this.clipPlanes[index].constant = constant; });
    this.requestRender();
  }
  renderClipControls() { const root = document.getElementById('ifc-clip-ranges'); root.innerHTML = ''; if (!this.clipBox) return; const min = Math.min(this.clipBox.minX, this.clipBox.minY, this.clipBox.minZ); const max = Math.max(this.clipBox.maxX, this.clipBox.maxY, this.clipBox.maxZ); clipLabels.forEach(([key, label]) => { const row = document.createElement('div'); row.className = 'ifc-clip-row'; row.innerHTML = `<label>${label}<output>${this.clipBox[key].toFixed(2)} m</output></label><input type="range" min="${min}" max="${max}" step="0.05" value="${this.clipBox[key]}">`; row.querySelector('input').addEventListener('input', (event) => { this.clipBox[key] = Number(event.target.value); row.querySelector('output').textContent = `${this.clipBox[key].toFixed(2)} m`; this.applyClipBox(); }); root.append(row); }); }
  setClipBox(bounds) { this.clipBox = { ...this.clipBox, ...bounds }; this.applyClipBox(); this.renderClipControls(); }
  setBackground(color) { this.background = color; localStorage.setItem('ifc-background', color); this.scene?.background.set(color); document.getElementById('ifc-background-input').value = color; this.requestRender(); }

  onKey(event, down) {
    if (this.mode !== 'walk') return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (down && !event.repeat) this.walk.jumpRequested = true;
      return;
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      event.preventDefault();
      if (down) this.walk.keys.add(event.code); else this.walk.keys.delete(event.code);
    }
    if (event.code === 'Escape' && down) {
      if (this.pointer?.isLocked) this.pointer.unlock();
      else if (performance.now() < (this.walk.ignoreEscapeUntil || 0)) return;
      else this.exitWalk({ unlock: false });
    }
  }
  visibleMeshes() { return this.meshes.filter((mesh) => mesh.parent?.visible); }
  collisionMeshes() { return this.meshes.filter((mesh) => mesh.parent?.visible && mesh.userData.collidable); }
  floorBelow(position, lift = 0, maxDrop = 6) {
    const origin = position.clone(); origin.y -= this.walk.height - lift;
    this.walkRaycaster.set(origin, new THREE.Vector3(0, -1, 0));
    this.walkRaycaster.near = 0; this.walkRaycaster.far = lift + maxDrop;
    return this.walkRaycaster.intersectObjects(this.collisionMeshes(), false).find((hit) => (hit.face?.normal.clone().transformDirection(hit.object.matrixWorld).y || 0) > .55);
  }
  hitsWall(origin, direction, distance) {
    if (!distance) return false;
    const bodyHeights = [.2, this.walk.height * .55, this.walk.height - .12];
    return bodyHeights.some((height) => {
      const start = origin.clone(); start.y -= this.walk.height - height;
      this.wallRaycaster.set(start, direction); this.wallRaycaster.near = 0; this.wallRaycaster.far = distance + this.walk.radius;
      const hit = this.wallRaycaster.intersectObjects(this.collisionMeshes(), false)[0];
      if (!hit) return false;
      const normalY = Math.abs(hit.face?.normal.clone().transformDirection(hit.object.matrixWorld).y || 0);
      return normalY < .55 && hit.distance < distance + this.walk.radius;
    });
  }
  updateWalk(delta) {
    if (this.mode !== 'walk' || !this.pointer?.isLocked) return;
    if (this.walk.jumpRequested && this.walk.grounded) {
      this.walk.velocityY = 8.5;
      this.walk.grounded = false;
    }
    this.walk.jumpRequested = false;
    const speed = (this.walk.keys.has('ShiftLeft') || this.walk.keys.has('ShiftRight')) ? this.walk.run : this.walk.speed;
    const forwardInput = Number(this.walk.keys.has('KeyW')) - Number(this.walk.keys.has('KeyS'));
    const sideInput = Number(this.walk.keys.has('KeyD')) - Number(this.walk.keys.has('KeyA'));
    const move = new THREE.Vector3();
    const forward = this.pointer.getDirection(new THREE.Vector3()); forward.y = 0;
    if (forward.lengthSq() > .0001) forward.normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    move.addScaledVector(forward, forwardInput).addScaledVector(right, sideInput);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * delta);
      const next = this.camera.position.clone().add(move);
      const currentFeet = this.camera.position.y - this.walk.height;
      const step = this.floorBelow(next, this.walk.stepHeight + .05);
      const stepY = step?.point.y;
      const canStep = this.walk.grounded && stepY !== undefined && stepY >= currentFeet - .05 && stepY <= currentFeet + this.walk.stepHeight;
      if (!this.hitsWall(this.camera.position, move.clone().normalize(), move.length()) || canStep) {
        this.camera.position.x = next.x; this.camera.position.z = next.z;
        if (canStep) { this.camera.position.y = stepY + this.walk.height; this.walk.velocityY = 0; this.walk.grounded = true; }
      }
    }
    this.walk.velocityY = Math.max(this.walk.velocityY - this.walk.gravity * delta, -this.walk.terminalVelocity);
    const currentFeet = this.camera.position.y - this.walk.height;
    const floor = this.floorBelow(this.camera.position, this.walk.stepHeight + .05);
    const floorY = floor?.point.y;
    const nextY = this.camera.position.y + this.walk.velocityY * delta;
    if (floorY !== undefined && this.walk.velocityY <= 0 && floorY <= currentFeet + .05 && nextY - this.walk.height <= floorY) {
      this.camera.position.y = floorY + this.walk.height;
      this.walk.velocityY = 0; this.walk.grounded = true;
    } else {
      this.camera.position.y = nextY; this.walk.grounded = false;
    }
  }
  requestRender() { this.needsRender = true; }
  animate() {
    requestAnimationFrame(() => this.animate());
    if (!this.scene || this.modal.classList.contains('hidden')) return;
    const now = performance.now();
    const delta = Math.min(.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.orbit?.enabled && this.orbit.update()) this.requestRender();
    const walking = this.mode === 'walk' && this.pointer?.isLocked;
    this.updateWalk(delta);
    if (walking) this.requestRender();
    const interval = walking ? 1000 / (this.safeProfile ? 30 : 45) : 1000 / (this.safeProfile ? 20 : 30);
    if (this.needsRender && now - this.lastRender >= interval) {
      this.renderer.render(this.scene, this.camera);
      this.lastRender = now;
      this.needsRender = false;
    }
  }
  resize() { if (!this.renderer) return; const rect = this.container.getBoundingClientRect(); const width = Math.round(rect.width), height = Math.round(rect.height); if (!width || !height) return; this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false); this.requestRender(); }
  setLoading(show, text = '', percent = 0) { this.loading.classList.toggle('hidden', !show); this.loadingText.textContent = text; this.progress.style.width = `${percent}%`; }
  showStatus(message) { this.status.textContent = message; this.status.classList.remove('hidden'); clearTimeout(this.statusTimer); this.statusTimer = setTimeout(() => this.status.classList.add('hidden'), 7000); }
  toggleFullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else this.modal.requestFullscreen?.(); }
}

window.ifcViewer = new IFCViewer();
