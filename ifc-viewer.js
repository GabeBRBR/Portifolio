/**
 * GABRIEL BIAGINI ALMEIDA REIS — VISUALIZADOR BIM IFC 3D OFICIAL (WEB-IFC WASM + THREE.JS)
 * - Carrega os arquivos .ifc REAIS no GitHub Pages (assets/ifc/casa-terrea/ e assets/ifc/galpao/)
 * - Permite Upload e Drag & Drop de arquivos IFC próprios a qualquer momento
 * - Modelos federados sincronizados com controle de camadas (Arquitetura, Estrutural, Elétrica)
 * - Modo Caminhada em 1ª Pessoa com Colisão Realista e Portas Vazadas
 */

(function() {
  'use strict';

  class IFCViewerApp {
    constructor() {
      this.modal = null;
      this.container = null;
      this.loadingOverlay = null;
      this.loadingText = null;
      this.progressBar = null;

      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.orbitControls = null;

      // Web-IFC WASM Engine
      this.ifcApi = null;
      this.isWasmReady = false;

      // Loaded models & layers
      this.modelsRoot = null;
      this.loadedLayers = {}; // { [layerKey]: { name, group, meshes, visible, color } }
      this.collisionMeshes = [];
      this.doorMeshes = [];
      this.allMeshes = [];

      // Active Work / Obra
      this.currentWorkKey = 'casa-terrea'; // 'casa-terrea' | 'galpao' | 'custom'
      this.workDefinitions = {
        'casa-terrea': {
          name: 'Casa Térrea — Jardim Sul',
          disciplines: [
            { key: 'arq', name: 'Arquitetura', file: 'assets/ifc/casa-terrea/arq.ifc', color: 0xF3EFE7 },
            { key: 'est', name: 'Estrutural', file: 'assets/ifc/casa-terrea/est.ifc', color: 0x94A3B8 },
            { key: 'ele', name: 'Elétrica / MEP', file: 'assets/ifc/casa-terrea/ele.ifc', color: 0xF59E0B }
          ]
        },
        'galpao': {
          name: 'Galpão Industrial',
          disciplines: [
            { key: 'arq', name: 'Arquitetura', file: 'assets/ifc/galpao/arq.ifc', color: 0xF3EFE7 },
            { key: 'est', name: 'Estrutural', file: 'assets/ifc/galpao/est.ifc', color: 0x3B82F6 }
          ]
        }
      };

      // View Modes: 'orbit' | 'walk' | 'top' | 'section'
      this.currentMode = 'orbit';

      // First-Person Walk State
      this.walkState = {
        position: new THREE.Vector3(0, 1.65, 10),
        yaw: 0,
        pitch: 0,
        eyeHeight: 1.65,
        moveSpeed: 4.5,
        runSpeed: 8.5,
        velocity: new THREE.Vector3(),
        isGrounded: true,
        keys: { forward: false, backward: false, left: false, right: false, shift: false, jump: false }
      };

      // Section / Clipping Plane
      this.clippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000);
      this.clippingActive = false;

      // Raycasting & Inspector
      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();
      this.selectedMesh = null;
      this.originalSelectedMat = null;
      this.highlightMat = new THREE.MeshStandardMaterial({
        color: 0xB8860B,
        emissive: 0x553C04,
        roughness: 0.2,
        metalness: 0.5
      });

      this.clock = new THREE.Clock();
      this.isInitialized = false;
    }

    initDOM() {
      this.modal = document.getElementById('ifc-viewer-modal');
      this.container = document.getElementById('ifc-canvas-container');
      this.loadingOverlay = document.getElementById('ifc-loading-overlay');
      this.loadingText = document.getElementById('ifc-loading-text');
      this.progressBar = document.getElementById('ifc-progress-bar');
    }

    initThree() {
      if (this.isInitialized) return;
      this.initDOM();
      if (!this.container) return;

      const width = this.container.clientWidth || window.innerWidth;
      const height = this.container.clientHeight || (window.innerHeight - 60);

      // 1. Scene
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x0A101D);

      // 2. Camera
      this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
      this.camera.position.set(20, 15, 25);

      // 3. Renderer
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.localClippingEnabled = true;
      this.container.appendChild(this.renderer.domElement);

      // 4. OrbitControls
      if (typeof THREE.OrbitControls === 'function') {
        this.orbitControls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.orbitControls.enableDamping = true;
        this.orbitControls.dampingFactor = 0.08;
        this.orbitControls.maxPolarAngle = Math.PI / 2 + 0.05;
        this.orbitControls.target.set(0, 1.5, 0);
      }

      // 5. Lighting Setup
      const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.85);
      this.scene.add(ambientLight);

      const hemiLight = new THREE.HemisphereLight(0xF8FAFC, 0x1E293B, 0.45);
      this.scene.add(hemiLight);

      const dirLight1 = new THREE.DirectionalLight(0xFFFAF0, 1.2);
      dirLight1.position.set(35, 55, 30);
      dirLight1.castShadow = true;
      dirLight1.shadow.mapSize.width = 2048;
      dirLight1.shadow.mapSize.height = 2048;
      dirLight1.shadow.camera.near = 1;
      dirLight1.shadow.camera.far = 150;
      const d = 35;
      dirLight1.shadow.camera.left = -d;
      dirLight1.shadow.camera.right = d;
      dirLight1.shadow.camera.top = d;
      dirLight1.shadow.camera.bottom = -d;
      this.scene.add(dirLight1);

      const dirLight2 = new THREE.DirectionalLight(0x93C5FD, 0.4);
      dirLight2.position.set(-25, 20, -25);
      this.scene.add(dirLight2);

      // 6. Ground Grid
      const gridHelper = new THREE.GridHelper(80, 80, 0xB8860B, 0x1E293B);
      gridHelper.position.y = -0.01;
      this.scene.add(gridHelper);

      // 7. Models Root Group
      this.modelsRoot = new THREE.Group();
      this.scene.add(this.modelsRoot);

      this.bindEvents();
      this.isInitialized = true;
      this.animate();
    }

    bindEvents() {
      window.addEventListener('resize', () => this.onWindowResize());

      // Mouse Drag & Pointer Lock Tracking
      let isMouseDown = false;
      let prevMouseX = 0;
      let prevMouseY = 0;
      let mouseDownPos = { x: 0, y: 0 };
      let hasDragged = false;

      // Pointer Lock Change
      document.addEventListener('pointerlockchange', () => {
        const isLocked = document.pointerLockElement === this.renderer.domElement;
        const hud = document.getElementById('ifc-walk-help');
        if (hud && this.currentMode === 'walk') {
          hud.classList.remove('hidden');
        }
      });

      this.renderer.domElement.addEventListener('mousedown', (e) => {
        mouseDownPos = { x: e.clientX, y: e.clientY };
        hasDragged = false;
        if (this.currentMode === 'walk') {
          isMouseDown = true;
          prevMouseX = e.clientX;
          prevMouseY = e.clientY;
        }
      });

      window.addEventListener('mouseup', () => {
        isMouseDown = false;
      });

      window.addEventListener('mousemove', (e) => {
        if (this.currentMode !== 'walk') return;

        // 1. Pointer Lock FPS Control (Smooth 360 Look)
        if (document.pointerLockElement === this.renderer.domElement) {
          const moveX = e.movementX || 0;
          const moveY = e.movementY || 0;
          this.walkState.yaw -= moveX * 0.0022;
          this.walkState.pitch -= moveY * 0.0022;
          this.walkState.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.walkState.pitch));
          return;
        }

        // 2. Drag to look fallback
        if (isMouseDown) {
          const deltaX = e.clientX - prevMouseX;
          const deltaY = e.clientY - prevMouseY;
          if (Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y) > 4) {
            hasDragged = true;
          }
          prevMouseX = e.clientX;
          prevMouseY = e.clientY;

          this.walkState.yaw -= deltaX * 0.003;
          this.walkState.pitch -= deltaY * 0.003;
          this.walkState.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.walkState.pitch));
        }
      });

      // Canvas click
      this.renderer.domElement.addEventListener('click', (e) => {
        if (hasDragged) return; // Prevent teleporting when releasing drag!

        if (this.currentMode === 'walk') {
          // Lock mouse for seamless FPS look
          if (document.pointerLockElement !== this.renderer.domElement) {
            this.renderer.domElement.requestPointerLock?.();
          }
          return; // Do NOT teleport on click in walk mode!
        }

        this.onCanvasClick(e);
      });

      // Drag & Drop IFC files onto canvas
      this.container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });

      this.container.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.loadUserIfcFiles(e.dataTransfer.files);
        }
      });
    }

    // Initialize Web-IFC WASM Engine
    async initWebIFC() {
      if (this.isWasmReady) return true;

      try {
        this.updateLoading('Inicializando motor Web-IFC (WebAssembly)...', 10);
        
        if (!window.WebIFC || !window.WebIFC.IfcAPI) {
          throw new Error('WebIFC API não encontrada.');
        }

        this.ifcApi = new window.WebIFC.IfcAPI();
        // Priority CDN wasm path
        this.ifcApi.SetWasmPath('https://cdn.jsdelivr.net/npm/web-ifc@0.0.57/');
        await this.ifcApi.Init();
        this.isWasmReady = true;
        return true;
      } catch (err) {
        console.warn('Tentando fallback para WASM local...', err);
        try {
          this.ifcApi.SetWasmPath('assets/wasm/');
          await this.ifcApi.Init();
          this.isWasmReady = true;
          return true;
        } catch (err2) {
          console.error('Falha ao inicializar Web-IFC WASM:', err2);
          this.updateLoading('Erro ao inicializar motor WASM. Verifique a conexão.', 0);
          return false;
        }
      }
    }

    // Load an entire Work (Federated models: ARQ + EST + ELE)
    async loadWork(workKey) {
      this.initThree();
      this.clearModels();
      this.showLoading(true);
      this.currentWorkKey = workKey;

      const wasmOk = await this.initWebIFC();
      if (!wasmOk) return;

      const workDef = this.workDefinitions[workKey];
      if (!workDef) return;

      const totalFiles = workDef.disciplines.length;
      let completed = 0;
      let loadedAny = false;

      for (const disc of workDef.disciplines) {
        this.updateLoading(`Processando ${disc.name} (${completed + 1}/${totalFiles})...`, Math.round((completed / totalFiles) * 80) + 10);
        
        try {
          const res = await fetch(disc.file);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = await res.arrayBuffer();
          await this.parseIfcBuffer(buffer, disc.key, disc.name, disc.color);
          loadedAny = true;
        } catch (e) {
          console.warn(`Aviso ao carregar ${disc.name}:`, e);
        }
        completed++;
      }

      if (loadedAny) {
        this.fitModelToView();
        this.updateLayerTogglesUI();
        this.showLoading(false);
      } else {
        this.updateLoading('Nenhum arquivo pôde ser lido via fetch. Use o botão de upload.', 0);
        setTimeout(() => this.showLoading(false), 2500);
      }
    }

    // User Upload / Drag & Drop of custom IFC files
    async loadUserIfcFiles(fileList) {
      if (!fileList || fileList.length === 0) return;

      this.initThree();
      this.clearModels();
      this.showLoading(true);
      this.currentWorkKey = 'custom';

      const wasmOk = await this.initWebIFC();
      if (!wasmOk) return;

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const fileName = file.name.toUpperCase();
        let discKey = `custom_${i}`;
        let discName = file.name;
        let color = 0xF3EFE7;

        if (fileName.includes('EST') || fileName.includes('ESTRUT')) {
          discKey = `est_${i}`;
          color = 0x94A3B8;
        } else if (fileName.includes('ELE') || fileName.includes('MEP') || fileName.includes('HID')) {
          discKey = `ele_${i}`;
          color = 0xF59E0B;
        }

        this.updateLoading(`Lendo ${file.name} (${i + 1}/${fileList.length})...`, Math.round(((i + 1) / fileList.length) * 100));
        
        const buffer = await file.arrayBuffer();
        await this.parseIfcBuffer(buffer, discKey, discName, color);
      }

      this.fitModelToView();
      this.updateLayerTogglesUI();
      this.showLoading(false);
    }

    // Parse IFC binary buffer and construct Three.js geometries
    async parseIfcBuffer(buffer, layerKey, layerName, defaultColor = 0xF3EFE7) {
      const data = new Uint8Array(buffer);
      const modelID = this.ifcApi.OpenModel(data);

      const layerGroup = new THREE.Group();
      layerGroup.name = `LAYER_${layerKey}`;
      this.modelsRoot.add(layerGroup);

      const meshes = [];
      const defaultMat = new THREE.MeshStandardMaterial({
        color: defaultColor,
        roughness: 0.65,
        metalness: 0.2,
        clippingPlanes: [this.clippingPlane]
      });

      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x93C5FD,
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        clippingPlanes: [this.clippingPlane]
      });

      // Stream meshes through Web-IFC
      this.ifcApi.StreamAllMeshes(modelID, (flatMesh) => {
        const expressID = flatMesh.expressID;
        const placedGeoms = flatMesh.geometries;

        for (let i = 0; i < placedGeoms.size(); i++) {
          const placed = placedGeoms.get(i);
          const geom = this.ifcApi.GetGeometry(modelID, placed.geometryExpressID);
          const vData = this.ifcApi.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
          const iData = this.ifcApi.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());

          if (vData.length === 0 || iData.length === 0) continue;

          const bufferGeom = new THREE.BufferGeometry();
          const positions = [];
          const normals = [];

          for (let k = 0; k < vData.length; k += 6) {
            positions.push(vData[k], vData[k + 1], vData[k + 2]);
            normals.push(vData[k + 3], vData[k + 4], vData[k + 5]);
          }

          bufferGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          bufferGeom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
          bufferGeom.setIndex(Array.from(iData));

          // Apply transformation matrix
          const matrix = new THREE.Matrix4().fromArray(placed.flatTransformation);
          bufferGeom.applyMatrix4(matrix);

          const c = placed.color;
          let isGlass = (c && c.w < 0.95);
          let isDoor = (c && c.x > 0.4 && c.y < 0.3); // Door heuristic

          let mat = isGlass ? glassMat : defaultMat;
          if (c && !isGlass) {
            mat = new THREE.MeshStandardMaterial({
              color: new THREE.Color(c.x, c.y, c.z),
              roughness: 0.65,
              metalness: 0.2,
              clippingPlanes: [this.clippingPlane]
            });
          }

          const mesh = new THREE.Mesh(bufferGeom, mat);
          mesh.castShadow = !isGlass;
          mesh.receiveShadow = true;
          mesh.userData = {
            expressID: expressID,
            modelID: modelID,
            discipline: layerName,
            isDoor: isDoor,
            isGlass: isGlass
          };

          layerGroup.add(mesh);
          meshes.push(mesh);
          this.allMeshes.push(mesh);

          if (isDoor) {
            this.doorMeshes.push(mesh);
          } else if (!isGlass) {
            this.collisionMeshes.push(mesh);
          }
        }
      });

      this.loadedLayers[layerKey] = {
        name: layerName,
        group: layerGroup,
        meshes: meshes,
        visible: true,
        modelID: modelID
      };
    }

    // Rotate Model Orientation by 90 degrees if needed
    rotateAxis90() {
      if (!this.modelsRoot) return;
      this.modelsRoot.rotation.x += Math.PI / 2;
      if (this.modelsRoot.rotation.x >= Math.PI * 2) {
        this.modelsRoot.rotation.x = 0;
      }
      this.fitModelToView();
    }

    // Clear all models from scene
    clearModels() {
      this.collisionMeshes = [];
      this.doorMeshes = [];
      this.allMeshes = [];
      this.selectedMesh = null;
      this.loadedLayers = {};

      if (this.modelsRoot) {
        this.modelsRoot.rotation.set(0, 0, 0);
        this.modelsRoot.position.set(0, 0, 0);
        while (this.modelsRoot.children.length > 0) {
          const child = this.modelsRoot.children[0];
          this.modelsRoot.remove(child);
        }
      }
    }

    // Fit camera around current models and auto-center on floor (Y=0)
    fitModelToView() {
      if (!this.camera || !this.orbitControls) return;

      const box = new THREE.Box3();
      this.allMeshes.forEach(m => box.expandByObject(m));
      if (box.isEmpty()) return;

      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      this.orbitControls.target.set(center.x, center.y, center.z);

      const fov = this.camera.fov * (Math.PI / 180);
      let cameraDistance = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
      cameraDistance = Math.max(cameraDistance, 14);

      this.camera.position.set(center.x + cameraDistance * 0.7, center.y + cameraDistance * 0.5, center.z + cameraDistance * 0.7);
      this.camera.lookAt(center);
      this.orbitControls.update();

      // Spawn position for walkthrough mode
      this.walkState.position.set(center.x, Math.max(0.5, box.min.y) + this.walkState.eyeHeight, center.z + size.z * 0.4);
    }

    // Set View Mode: 'orbit', 'walk', 'top', 'section'
    setMode(mode) {
      this.currentMode = mode;
      if (mode !== 'walk' && document.pointerLockElement) {
        document.exitPointerLock?.();
      }

      if (mode === 'orbit') {
        if (this.orbitControls) {
          this.orbitControls.enabled = true;
          this.orbitControls.maxPolarAngle = Math.PI / 2 + 0.02;
        }
        this.hideWalkHelp();
        this.setClipping(false);
      } else if (mode === 'top') {
        if (this.orbitControls) {
          this.orbitControls.enabled = true;
          const target = this.orbitControls.target.clone();
          this.camera.position.set(target.x, target.y + 40, target.z + 0.01);
          this.camera.lookAt(target);
          this.orbitControls.update();
        }
        this.hideWalkHelp();
        this.setClipping(false);
      } else if (mode === 'walk') {
        if (this.orbitControls) this.orbitControls.enabled = false;
        this.camera.position.copy(this.walkState.position);
        this.walkState.yaw = 0;
        this.walkState.pitch = 0;
        this.showWalkHelp();
        this.setClipping(false);
      } else if (mode === 'section') {
        if (this.orbitControls) this.orbitControls.enabled = true;
        this.setClipping(true, 2.5);
        this.hideWalkHelp();
      }

      document.querySelectorAll('.ifc-tool-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
      });
    }

    // Toggle Section / Clipping Plane
    setClipping(active, heightValue = 2.5) {
      this.clippingActive = active;
      if (active) {
        this.clippingPlane.constant = heightValue;
        document.getElementById('ifc-clipping-control')?.classList.remove('hidden');
      } else {
        this.clippingPlane.constant = 1000;
        document.getElementById('ifc-clipping-control')?.classList.add('hidden');
      }
    }

    // Toggle Layer Visibility
    toggleLayer(key, isVisible) {
      if (this.loadedLayers[key] && this.loadedLayers[key].group) {
        this.loadedLayers[key].visible = isVisible;
        this.loadedLayers[key].group.visible = isVisible;
      }
    }

    // Walkthrough Keyboard
    onKeyDown(e) {
      if (this.currentMode !== 'walk') return;
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.walkState.keys.forward = true; break;
        case 'KeyS': case 'ArrowDown': this.walkState.keys.backward = true; break;
        case 'KeyA': case 'ArrowLeft': this.walkState.keys.left = true; break;
        case 'KeyD': case 'ArrowRight': this.walkState.keys.right = true; break;
        case 'ShiftLeft': case 'ShiftRight': this.walkState.keys.shift = true; break;
        case 'Space':
          if (this.walkState.isGrounded) {
            this.walkState.velocity.y = 4.5;
            this.walkState.isGrounded = false;
          }
          break;
        case 'Escape':
          this.setMode('orbit');
          break;
      }
    }

    onKeyUp(e) {
      if (this.currentMode !== 'walk') return;
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.walkState.keys.forward = false; break;
        case 'KeyS': case 'ArrowDown': this.walkState.keys.backward = false; break;
        case 'KeyA': case 'ArrowLeft': this.walkState.keys.left = false; break;
        case 'KeyD': case 'ArrowRight': this.walkState.keys.right = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.walkState.keys.shift = false; break;
      }
    }

    // Update Walk Character Physics with Collision & Door Pass-through
    updateWalkPhysics(delta) {
      if (this.currentMode !== 'walk') return;

      const speed = this.walkState.keys.shift ? this.walkState.runSpeed : this.walkState.moveSpeed;

      const forward = new THREE.Vector3(-Math.sin(this.walkState.yaw), 0, -Math.cos(this.walkState.yaw)).normalize();
      const right = new THREE.Vector3(Math.cos(this.walkState.yaw), 0, -Math.sin(this.walkState.yaw)).normalize();

      const moveDir = new THREE.Vector3();
      if (this.walkState.keys.forward) moveDir.add(forward);
      if (this.walkState.keys.backward) moveDir.sub(forward);
      if (this.walkState.keys.right) moveDir.add(right);
      if (this.walkState.keys.left) moveDir.sub(right);

      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();

        const stepDist = speed * delta;
        const proposedPos = this.walkState.position.clone().addScaledVector(moveDir, stepDist);

        // --- 1. HORIZONTAL COLLISION (Raycast at waist level) ---
        const rayOrigin = this.walkState.position.clone();
        rayOrigin.y -= (this.walkState.eyeHeight - 0.9);

        let canMove = true;
        const colRay = new THREE.Raycaster(rayOrigin, moveDir, 0, 0.45);
        // Exclude doors from collision so user can walk through freely!
        const visibleColliders = this.collisionMeshes.filter(m => m.parent && m.parent.visible && !m.userData.isDoor);
        const hits = colRay.intersectObjects(visibleColliders, false);

        if (hits.length > 0 && hits[0].distance < 0.42) {
          canMove = false; // Blocked by solid wall / column / beam
        }

        if (canMove) {
          this.walkState.position.x = proposedPos.x;
          this.walkState.position.z = proposedPos.z;
        }
      }

      // --- 2. GRAVITY & REAL FREE-FALL PHYSICS ---
      const downOrigin = this.walkState.position.clone();
      downOrigin.y += 0.5;

      const downRay = new THREE.Raycaster(downOrigin, new THREE.Vector3(0, -1, 0), 0, 300.0);
      const floorColliders = this.collisionMeshes.filter(m => m.parent && m.parent.visible);
      const floorHits = downRay.intersectObjects(floorColliders, false);

      let groundY = 0; // Default terrain level (grid)
      if (floorHits.length > 0) {
        groundY = floorHits[0].point.y;
      }

      const targetEyeY = groundY + this.walkState.eyeHeight;

      // In air (jumping or stepped off roof/ledge) -> free fall!
      if (this.walkState.position.y > targetEyeY + 0.08) {
        this.walkState.velocity.y -= 20.0 * delta; // Realistic gravity
        this.walkState.position.y += this.walkState.velocity.y * delta;
        this.walkState.isGrounded = false;

        if (this.walkState.position.y <= targetEyeY) {
          this.walkState.position.y = targetEyeY;
          this.walkState.velocity.y = 0;
          this.walkState.isGrounded = true;
        }
      } else if (this.walkState.position.y < targetEyeY - 0.05) {
        // Step up (slabs, thresholds, stairs)
        this.walkState.position.y = THREE.MathUtils.lerp(this.walkState.position.y, targetEyeY, 0.35);
        this.walkState.velocity.y = 0;
        this.walkState.isGrounded = true;
      } else {
        this.walkState.position.y = targetEyeY;
        this.walkState.velocity.y = 0;
        this.walkState.isGrounded = true;
      }

      this.camera.position.copy(this.walkState.position);
      const euler = new THREE.Euler(this.walkState.pitch, this.walkState.yaw, 0, 'YXZ');
      this.camera.quaternion.setFromEuler(euler);
    }

    // 3D Canvas Click Handler
    onCanvasClick(e) {
      if (!this.container || !this.camera) return;

      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const visibleMeshes = this.allMeshes.filter(m => m.parent && m.parent.visible);
      const intersects = this.raycaster.intersectObjects(visibleMeshes, false);

      if (intersects.length > 0) {
        const hit = intersects[0];

        // Teleport if in walk mode and clicked on floor
        if (this.currentMode === 'walk' && hit.point) {
          this.walkState.position.set(hit.point.x, hit.point.y + this.walkState.eyeHeight, hit.point.z);
          return;
        }

        // Element Inspection
        this.inspectElement(hit.object, hit.point);
      } else {
        this.clearSelection();
      }
    }

    // Inspect Element
    inspectElement(mesh, hitPoint) {
      this.clearSelection();

      this.selectedMesh = mesh;
      this.originalSelectedMat = mesh.material;
      mesh.material = this.highlightMat;

      const data = mesh.userData || {};
      const inspectorPanel = document.getElementById('ifc-inspector-panel');
      const elType = document.getElementById('ifc-prop-type');
      const elDisc = document.getElementById('ifc-prop-discipline');
      const elId = document.getElementById('ifc-prop-id');
      const elCoords = document.getElementById('ifc-prop-coords');

      if (inspectorPanel) {
        if (elType) elType.textContent = data.isDoor ? 'IfcDoor (Porta de Passagem)' : (data.isGlass ? 'IfcWindow (Esquadria Vidro)' : 'IfcBuildingElement');
        if (elDisc) elDisc.textContent = data.discipline || 'Arquitetura';
        if (elId) elId.textContent = `ExpressID: #${data.expressID || '—'}`;
        if (elCoords && hitPoint) elCoords.textContent = `X: ${hitPoint.x.toFixed(2)}m, Y: ${hitPoint.y.toFixed(2)}m, Z: ${hitPoint.z.toFixed(2)}m`;
        inspectorPanel.classList.remove('hidden');
      }
    }

    clearSelection() {
      if (this.selectedMesh && this.originalSelectedMat) {
        this.selectedMesh.material = this.originalSelectedMat;
      }
      this.selectedMesh = null;
      this.originalSelectedMat = null;
      document.getElementById('ifc-inspector-panel')?.classList.add('hidden');
    }

    animate() {
      requestAnimationFrame(() => this.animate());

      const delta = this.clock.getDelta();

      if (this.currentMode === 'walk') {
        this.updateWalkPhysics(delta);
      } else if (this.orbitControls && this.orbitControls.enabled) {
        this.orbitControls.update();
      }

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    }

    onWindowResize() {
      if (!this.container || !this.camera || !this.renderer) return;
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    }

    showLoading(show) {
      if (this.loadingOverlay) this.loadingOverlay.classList.toggle('hidden', !show);
    }

    updateLoading(text, percent) {
      if (this.loadingText) this.loadingText.textContent = text;
      if (this.progressBar) this.progressBar.style.transform = `scaleX(${percent / 100})`;
    }

    showWalkHelp() {
      document.getElementById('ifc-walk-help')?.classList.remove('hidden');
    }

    hideWalkHelp() {
      document.getElementById('ifc-walk-help')?.classList.add('hidden');
    }

    updateLayerTogglesUI() {
      const container = document.getElementById('ifc-layers-container');
      if (!container) return;

      container.innerHTML = '';
      const layerKeys = Object.keys(this.loadedLayers);

      layerKeys.forEach(key => {
        const layer = this.loadedLayers[key];
        const div = document.createElement('label');
        div.className = 'ifc-layer-toggle';
        div.innerHTML = `
          <input type="checkbox" data-discipline="${key}" checked>
          <span class="ifc-layer-badge ifc-badge-${key.split('_')[0]}">${layer.name}</span>
        `;
        div.querySelector('input').addEventListener('change', (e) => {
          this.toggleLayer(key, e.target.checked);
        });
        container.appendChild(div);
      });
    }

    // Open Modal
    openViewer(workKey = 'casa-terrea') {
      this.initDOM();
      if (this.modal) {
        this.modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        
        setTimeout(() => {
          this.initThree();
          this.loadWork(workKey);
          const workSelect = document.getElementById('ifc-work-select');
          if (workSelect) workSelect.value = workKey;
        }, 50);
      }
    }

    // Close Modal
    closeViewer() {
      if (this.modal) {
        this.modal.classList.add('hidden');
        document.body.style.overflow = '';
        this.setMode('orbit');
        this.clearSelection();
      }
    }
  }

  // Global Instance
  window.ifcViewer = new IFCViewerApp();

  // Setup DOM Event Listeners
  function setupEvents() {
    // 1. Selector de Obra
    const workSelect = document.getElementById('ifc-work-select');
    if (workSelect) {
      workSelect.addEventListener('change', (e) => {
        window.ifcViewer.loadWork(e.target.value);
      });
    }

    // 2. Upload Button & File Input in Header and Local Notice
    const uploadBtn = document.getElementById('ifc-upload-btn');
    const fileInput = document.getElementById('ifc-file-input-header');
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          window.ifcViewer.loadUserIfcFiles(e.target.files);
        }
      });
    }

    const localFileInput = document.getElementById('ifc-local-file-input');
    if (localFileInput) {
      localFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          window.ifcViewer.loadUserIfcFiles(e.target.files);
        }
      });
    }

    // 3. Toolbar buttons
    document.querySelectorAll('.ifc-tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        if (mode === 'fullscreen') {
          const modal = document.getElementById('ifc-viewer-modal');
          if (!document.fullscreenElement) {
            modal?.requestFullscreen().catch(err => console.log(err));
          } else {
            document.exitFullscreen();
          }
        } else if (mode === 'reset') {
          window.ifcViewer.fitModelToView();
        } else if (mode === 'rotate-axis') {
          window.ifcViewer.rotateAxis90();
        } else if (mode) {
          window.ifcViewer.setMode(mode);
        }
      });
    });

    // 4. Slider de Corte
    const clippingSlider = document.getElementById('ifc-clipping-slider');
    if (clippingSlider) {
      clippingSlider.addEventListener('input', (e) => {
        window.ifcViewer.setClipping(true, parseFloat(e.target.value));
      });
    }

    // 5. Close buttons
    const closeBtn = document.getElementById('ifc-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => window.ifcViewer.closeViewer());
    }

    const closeInspector = document.getElementById('ifc-inspector-close');
    if (closeInspector) {
      closeInspector.addEventListener('click', () => window.ifcViewer.clearSelection());
    }

    // 6. Open IFC Triggers
    document.querySelectorAll('[data-open-ifc]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const workKey = el.getAttribute('data-open-ifc') || el.getAttribute('data-ifc-work') || 'casa-terrea';
        window.ifcViewer.openViewer(workKey);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupEvents);
  } else {
    setupEvents();
  }

})();
