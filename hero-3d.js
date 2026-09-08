(function() {
  window.addEventListener('error', function(e) {
    if(loadingEl) {
      loadingEl.style.opacity = '1';
      loadingEl.innerHTML = '<div style="color:red; max-width: 80%; word-break: break-all;">' + e.message + '<br>' + e.filename + ':' + e.lineno + '</div>';
    }
  });
  const canvas = document.getElementById('hero-3d-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const btnReplay = document.getElementById('replay-scan-btn');
  const loadingEl = document.getElementById('hero-3d-loading');
  
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#F7F5F0');
  scene.fog = new THREE.FogExp2('#F7F5F0', 0.015);
  
  const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
  camera.position.set(22, 18, 28);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(10, 25, 15);
  scene.add(dirLight);

  const mainGroup = new THREE.Group();
  scene.add(mainGroup);

  const uniforms = {
    uScanOrigin: { value: new THREE.Vector3(-15, -5, 15) },
    uScanRadius: { value: 0.0 },
    uScanEnabled: { value: 1.0 },
    uWireOpacity: { value: 1.0 },
    uTime: { value: 0.0 }
  };

  function injectSolidShader(shader) {
    shader.uniforms.uScanOrigin = uniforms.uScanOrigin;
    shader.uniforms.uScanRadius = uniforms.uScanRadius;
    shader.uniforms.uScanEnabled = uniforms.uScanEnabled;

    shader.vertexShader = `
      varying vec3 vMyWorldPos;
    ` + shader.vertexShader;
    
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `
      #include <worldpos_vertex>
      vMyWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      `
    );

    shader.fragmentShader = `
      uniform vec3 uScanOrigin;
      uniform float uScanRadius;
      uniform float uScanEnabled;
      varying vec3 vMyWorldPos;

      bool unscanned(vec3 worldPos, float lag) {
        if (uScanEnabled < 0.5) return false;
        float wobble =
            sin(worldPos.y * 1.5 + worldPos.x * 0.8) * 0.5
          + sin(worldPos.z * 2.5 + worldPos.y * 1.2) * 0.3;
        return distance(worldPos, uScanOrigin) > uScanRadius - lag + wobble;
      }
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      `void main() {
        if (unscanned(vMyWorldPos, 2.0)) discard;
      `
    );
  }

  // --- Materials ---
  const matConcrete = new THREE.MeshStandardMaterial({ color: '#E2E8F0', roughness: 0.7, metalness: 0.05 });
  matConcrete.onBeforeCompile = injectSolidShader;

  const matTranslucentConcrete = new THREE.MeshStandardMaterial({ color: '#E2E8F0', roughness: 0.5, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false });
  matTranslucentConcrete.onBeforeCompile = injectSolidShader;

  // Permanent Concrete Edges (Light Gray)
    const matPermEdges = new THREE.ShaderMaterial({
    uniforms: {
      uScanOrigin: uniforms.uScanOrigin,
      uScanRadius: uniforms.uScanRadius,
      uScanEnabled: uniforms.uScanEnabled,
      uColor: { value: new THREE.Color('#CBD5E1') }
    },
    vertexShader: `
      varying vec3 vMyWorldPos;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vMyWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uScanOrigin;
      uniform float uScanRadius;
      uniform float uScanEnabled;
      uniform vec3 uColor;
      varying vec3 vMyWorldPos;

      void main() {
        if (uScanEnabled > 0.5) {
          float wobble = sin(vMyWorldPos.y * 1.5 + vMyWorldPos.x * 0.8) * 0.5 + sin(vMyWorldPos.z * 2.5 + vMyWorldPos.y * 1.2) * 0.3;
          if (distance(vMyWorldPos, uScanOrigin) > uScanRadius - 2.0 + wobble) {
            discard;
          }
        }
        gl_FragColor = vec4(uColor, 0.4);
      }
    `,
    transparent: true,
    depthWrite: false
  });

  const matHVAC = new THREE.MeshStandardMaterial({ color: '#94A3B8', roughness: 0.35, metalness: 0.85 });
  matHVAC.onBeforeCompile = injectSolidShader;

  const matPlumbingWater = new THREE.MeshStandardMaterial({ color: '#0284C7', roughness: 0.5, metalness: 0.2 });
  matPlumbingWater.onBeforeCompile = injectSolidShader;

  const matPlumbingSewer = new THREE.MeshStandardMaterial({ color: '#C2410C', roughness: 0.6, metalness: 0.1 });
  matPlumbingSewer.onBeforeCompile = injectSolidShader;

  const matCable = new THREE.MeshStandardMaterial({ color: '#EAB308', roughness: 0.8, metalness: 0.3 });
  matCable.onBeforeCompile = injectSolidShader;

  const matWire = new THREE.ShaderMaterial({
    uniforms: {
      uScanOrigin: uniforms.uScanOrigin,
      uScanRadius: uniforms.uScanRadius,
      uScanEnabled: uniforms.uScanEnabled,
      uWireOpacity: uniforms.uWireOpacity,
      uColor: { value: new THREE.Color('#B8860B') }
    },
    vertexShader: `
      varying vec3 vMyWorldPos;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vMyWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uScanOrigin;
      uniform float uScanRadius;
      uniform float uScanEnabled;
      uniform float uWireOpacity;
      uniform vec3 uColor;
      varying vec3 vMyWorldPos;

      void main() {
        if (uScanEnabled < 0.5) discard;
        float dist = distance(vMyWorldPos, uScanOrigin);
        float rim = exp(-pow((dist - uScanRadius) / 1.2, 2.0));
        float trail = smoothstep(uScanRadius, uScanRadius - 6.0, dist);
        float alpha = (rim * 2.0 + trail * 0.5) * uWireOpacity;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: true
  });

  const matPts = new THREE.ShaderMaterial({
    uniforms: {
      uScanOrigin: uniforms.uScanOrigin,
      uScanRadius: uniforms.uScanRadius,
      uScanEnabled: uniforms.uScanEnabled,
      uTime: uniforms.uTime,
      uColorBase: { value: new THREE.Color('#38BDF8') }, 
      uColorRim: { value: new THREE.Color('#B8860B') }   
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vMyWorldPos;
      void main() {
        vec3 pos = position;
        // Fluid, organic vibration
        pos.x += sin(uTime * 1.5 + position.y * 0.4) * 0.3;
        pos.y += cos(uTime * 1.8 + position.x * 0.4) * 0.3;
        pos.z += sin(uTime * 1.2 + position.z * 0.4) * 0.3;
        
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vMyWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
        gl_PointSize = 3.0;
      }
    `,
    fragmentShader: `
      uniform vec3 uScanOrigin;
      uniform float uScanRadius;
      uniform float uScanEnabled;
      uniform vec3 uColorBase;
      uniform vec3 uColorRim;
      varying vec3 vMyWorldPos;

      void main() {
        if (uScanEnabled < 0.5) discard; // Disappear entirely when scan finishes
        
        float dist = distance(vMyWorldPos, uScanOrigin);
        if (dist < uScanRadius - 3.0) {
           discard;
        }

        float intensity = 0.8;
        vec3 finalColor = uColorBase;

        if (abs(dist - uScanRadius) < 2.0) {
          intensity = 1.0;
          finalColor = uColorRim;
        }
        
        gl_FragColor = vec4(finalColor, intensity);
      }
    `,
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: false
  });

  const grpConcrete = new THREE.Group();
  const grpHVAC = new THREE.Group();
  const grpPlumbing = new THREE.Group();
  const grpCable = new THREE.Group();
  const grpWire = new THREE.Group();
  
  mainGroup.add(grpConcrete, grpHVAC, grpPlumbing, grpCable, grpWire);

  function addMesh(geom, mat, group, isConcrete = false) {
    const mesh = new THREE.Mesh(geom, mat);
    group.add(mesh);
    
    const edges = new THREE.EdgesGeometry(geom);
    
    // Wireframe for the scan wavefront
    const scanLine = new THREE.LineSegments(edges, matWire);
    scanLine.position.copy(mesh.position);
    scanLine.rotation.copy(mesh.rotation);
    scanLine.scale.copy(mesh.scale);
    grpWire.add(scanLine);

    // Permanent structural edges if concrete
    if (isConcrete) {
      const permLine = new THREE.LineSegments(edges, matPermEdges);
      permLine.position.copy(mesh.position);
      permLine.rotation.copy(mesh.rotation);
      permLine.scale.copy(mesh.scale);
      group.add(permLine);
    }
  }

  // --- Concrete Structure ---
  const base = new THREE.BoxGeometry(18, 0.8, 14);
  base.translate(0, 0.4, 0);
  addMesh(base, matConcrete, grpConcrete, true);

  const col = new THREE.BoxGeometry(0.8, 7, 0.8);
  const posCols = [
    [-8, 3.5, -6], [8, 3.5, -6], [-8, 3.5, 6], [8, 3.5, 6],
    [0, 3.5, -6], [0, 3.5, 6]
  ];
  posCols.forEach(p => {
    const c = col.clone();
    c.translate(p[0], p[1], p[2]);
    addMesh(c, matConcrete, grpConcrete, true);
  });

  const roof = new THREE.BoxGeometry(18, 0.6, 14);
  roof.translate(0, 7.3, 0);
  addMesh(roof, matTranslucentConcrete, grpConcrete, true);

  // --- MEP ---
  const hvacMain = new THREE.BoxGeometry(1.2, 0.6, 12);
  hvacMain.translate(-2, 6.2, 0);
  addMesh(hvacMain, matHVAC, grpHVAC);

  const hvacBranch = new THREE.BoxGeometry(5, 0.5, 0.8);
  hvacBranch.translate(1.1, 6.25, -3);
  addMesh(hvacBranch, matHVAC, grpHVAC);
  
  const hvacBranch2 = new THREE.BoxGeometry(5, 0.5, 0.8);
  hvacBranch2.translate(1.1, 6.25, 3);
  addMesh(hvacBranch2, matHVAC, grpHVAC);

  const hvacVert = new THREE.BoxGeometry(0.6, 6, 0.6);
  hvacVert.translate(-7.4, 3.5, -5.2);
  addMesh(hvacVert, matHVAC, grpHVAC);

  const pipeMain = new THREE.CylinderGeometry(0.15, 0.15, 12, 12);
  pipeMain.rotateX(Math.PI / 2);
  pipeMain.translate(1, 5.8, 0);
  addMesh(pipeMain, matPlumbingWater, grpPlumbing);

  const pipeSewer = new THREE.CylinderGeometry(0.2, 0.2, 7, 12);
  pipeSewer.translate(-7.2, 3.5, 5.2);
  addMesh(pipeSewer, matPlumbingSewer, grpPlumbing);
  
  const pipeVertWater = new THREE.CylinderGeometry(0.1, 0.1, 6, 12);
  pipeVertWater.translate(0.6, 3.5, -5.8);
  addMesh(pipeVertWater, matPlumbingWater, grpPlumbing);

  const pipeVertSewer = new THREE.CylinderGeometry(0.2, 0.2, 6, 12);
  pipeVertSewer.translate(7.2, 3.5, 5.2);
  addMesh(pipeVertSewer, matPlumbingSewer, grpPlumbing);

  const trayMain = new THREE.BoxGeometry(0.6, 0.1, 12);
  trayMain.translate(3, 6.0, 0);
  addMesh(trayMain, matCable, grpCable);

  const trayVert = new THREE.BoxGeometry(0.6, 6, 0.1);
  trayVert.translate(-0.6, 3.5, 5.8);
  addMesh(trayVert, matCable, grpCable);

  // Center Everything
  const box = new THREE.Box3().setFromObject(mainGroup);
  const center = box.getCenter(new THREE.Vector3());
  mainGroup.position.sub(center);

  // --- Volumetric Point Cloud ---
  const ptsPositions = [];
  // Medium density, spread in the volume
  for (let i = 0; i < 16000; i++) {
    ptsPositions.push(
      (Math.random() - 0.5) * 22,
      (Math.random() * 9),
      (Math.random() - 0.5) * 16
    );
  }
  
  const ptsGeom = new THREE.BufferGeometry();
  ptsGeom.setAttribute('position', new THREE.Float32BufferAttribute(ptsPositions, 3));
  const ptsMesh = new THREE.Points(ptsGeom, matPts);
  ptsMesh.position.copy(mainGroup.position);
  scene.add(ptsMesh);

  // Scan Config
  uniforms.uScanOrigin.value.set(-15, -10, 15);
  const maxRadius = 55.0;

  let startTime = null;
  const DURATION = 3800;
  let rafId;

  let mouseX = 0;
  let mouseY = 0;
  let targetRotX = 0;
  let targetRotY = 0;

  window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
  });

  function easeOutPow(t) { return 1 - Math.pow(1 - t, 1.4); }
  function smoothstep(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0)/(e1 - e0))); return t*t*(3-2*t); }

  function animate(time) {
    if (!startTime) startTime = time;
    const elapsed = time - startTime;
    uniforms.uTime.value = time * 0.001;

    targetRotY = mouseX * 0.3;
    targetRotX = -mouseY * 0.15;
    
    scene.rotation.y += (targetRotY - scene.rotation.y) * 0.05;
    scene.rotation.x += (targetRotX - scene.rotation.x) * 0.05;

    if (uniforms.uScanEnabled.value > 0.5) {
      const e = Math.min(1, elapsed / DURATION);
      uniforms.uScanRadius.value = easeOutPow(e) * maxRadius;
      uniforms.uWireOpacity.value = Math.min(1, e / 0.06) * (1 - smoothstep(0.85, 1, e));

      if (e >= 1.0) {
        uniforms.uScanEnabled.value = 0.0;
        grpWire.visible = false;
        ptsMesh.visible = false; // Disappear totally when finished
        if (btnReplay) btnReplay.classList.remove('opacity-0', 'pointer-events-none');
      }
    }

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(animate);
  }

  window.addEventListener('resize', () => {
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  });

  if (btnReplay) {
    btnReplay.addEventListener('click', () => {
      startTime = null;
      uniforms.uScanEnabled.value = 1.0;
      uniforms.uScanRadius.value = 0.0;
      grpWire.visible = true;
      ptsMesh.visible = true;
      btnReplay.classList.add('opacity-0', 'pointer-events-none');
    });
  }

  if(loadingEl) {
    loadingEl.style.opacity = '0';
    setTimeout(() => loadingEl.remove(), 500);
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    uniforms.uScanEnabled.value = 1.0;
    uniforms.uScanRadius.value = maxRadius * 0.5;
    uniforms.uWireOpacity.value = 0.8;
    renderer.render(scene, camera);
  } else {
    rafId = requestAnimationFrame(animate);
  }

})();