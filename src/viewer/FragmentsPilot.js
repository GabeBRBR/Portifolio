import * as OBC from '@thatopen/components';
import fragmentsWorkerUrl from '@thatopen/fragments/worker?url';

const CASA_TEREA = [
  ['Arquitetura', 'assets/IFC/Casa Térrea/CASA-AQR.ifc'],
  ['Estrutural', 'assets/IFC/Casa Térrea/CASA-EST.ifc'],
  ['Elétrica', 'assets/IFC/Casa Térrea/CASA-ELE.ifc'],
  ['Hidráulica', 'assets/IFC/Casa Térrea/CASA-HID.ifc'],
  ['Sanitária', 'assets/IFC/Casa Térrea/CASA-ESG.ifc']
];

/**
 * Isolated Fragments proof of concept. The legacy viewer stays active by default
 * until selection, properties and walking are migrated in later phases.
 */
export class FragmentsPilot {
  constructor({ container, list, empty, setLoading, showStatus }) {
    this.container = container;
    this.list = list;
    this.empty = empty;
    this.setLoading = setLoading;
    this.showStatus = showStatus;
    this.loaded = false;
  }

  async open() {
    if (!this.components) await this.setup();
    this.setActive(true);
    if (!this.loaded) await this.loadCasaTerrea();
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

    this.fragments = this.components.get(OBC.FragmentsManager);
    // Vite emits this dependency as a local worker asset, keeping Pages/CDN-independent.
    this.fragments.init(fragmentsWorkerUrl);
    // Keep every discipline in its IFC's shared coordinates. The Fragments
    // core otherwise coordinates each imported file around its first origin.
    this.fragments.core.settings.autoCoordinate = false;
    this.ifcLoader = this.components.get(OBC.IfcLoader);
    await this.ifcLoader.setup({
      autoSetWasm: false,
      wasm: { path: new URL('./assets/wasm/', window.location.href).href, absolute: true },
      webIfc: { COORDINATE_TO_ORIGIN: false }
    });

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
  }

  async loadCasaTerrea() {
    this.setLoading(true, 'Iniciando piloto Fragments…', 0);
    this.list.innerHTML = '';
    this.empty.classList.add('hidden');
    for (let index = 0; index < CASA_TEREA.length; index += 1) {
      const [discipline, path] = CASA_TEREA[index];
      try {
        this.setLoading(true, `Convertendo ${discipline} para Fragments…`, Math.round((index / CASA_TEREA.length) * 100));
        const response = await fetch(path);
        if (!response.ok) throw new Error(`arquivo não encontrado (${response.status})`);
        const buffer = new Uint8Array(await response.arrayBuffer());
        await this.ifcLoader.load(buffer, false, `casa-terrea-${discipline.toLowerCase()}`, {
          processData: { progressCallback: (progress) => this.setLoading(true, `Convertendo ${discipline} para Fragments…`, Math.round((index + progress) / CASA_TEREA.length * 100)) }
        });
        const row = document.createElement('div');
        row.className = 'ifc-model-row';
        row.textContent = `${discipline} · Fragments`;
        this.list.append(row);
      } catch (error) {
        this.showStatus(`Piloto Fragments: não foi possível converter ${discipline}: ${error.message}`);
      }
    }
    this.loaded = true;
    this.setLoading(false);
    await this.fit();
    this.showStatus('Piloto Fragments ativo: órbita e zoom usam culling/LOD. Seleção, cortes e caminhada continuam no motor atual nesta fase.');
  }

  async fit() {
    if (!this.world?.meshes.size) return;
    await this.world.camera.fit(this.world.meshes, 1.25);
    this.fragments.core.update(true);
    this.world.renderer.needsUpdate = true;
  }

  setActive(active) {
    if (!this.components) return;
    this.components.enabled = active;
    this.world.enabled = active;
    if (active) this.world.renderer.needsUpdate = true;
  }
}
