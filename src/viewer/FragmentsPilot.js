import * as OBC from '@thatopen/components';
import fragmentsWorkerUrl from '@thatopen/fragments/worker?url';

const FRAGMENTS_MANIFEST = 'assets/fragments/models.json';

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
    this.loadedWork = null;
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

    this.fragments = this.components.get(OBC.FragmentsManager);
    // Vite emits this dependency as a local worker asset, keeping Pages/CDN-independent.
    this.fragments.init(fragmentsWorkerUrl);
    // Keep every discipline in its IFC's shared coordinates. The Fragments
    // core otherwise coordinates each imported file around its first origin.
    this.fragments.core.settings.autoCoordinate = false;
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
      for (const modelId of this.fragments.list.keys()) await this.fragments.core.disposeModel(modelId);
    }
    for (let index = 0; index < models.length; index += 1) {
      const model = models[index];
      try {
        this.setLoading(true, `Carregando ${model.discipline} otimizado…`, Math.round((index / models.length) * 100));
        const fragmentResponse = await fetch(model.fragment);
        if (!fragmentResponse.ok) throw new Error(`arquivo otimizado não encontrado (${fragmentResponse.status})`);
        await this.fragments.core.load(await fragmentResponse.arrayBuffer(), { modelId: model.id });
        const row = document.createElement('div');
        row.className = 'ifc-model-row';
        row.textContent = `${model.discipline} · Fragments`;
        this.list.append(row);
      } catch (error) {
        this.showStatus(`Piloto Fragments: não foi possível carregar ${model.discipline}: ${error.message}`);
      }
    }
    this.loadedWork = workKey;
    this.setLoading(false);
    await this.fit();
    this.showStatus(`${workName} otimizado ativo: órbita e zoom usam culling/LOD. Seleção, cortes e caminhada continuam no motor atual nesta fase.`);
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
