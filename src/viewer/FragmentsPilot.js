import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as THREE from 'three';
import fragmentsWorkerUrl from '@thatopen/fragments/worker?url';

const FRAGMENTS_MANIFEST = 'assets/fragments/models.json';

/**
 * Isolated Fragments proof of concept. The legacy viewer stays active by default
 * until selection, properties and walking are migrated in later phases.
 */
export class FragmentsPilot {
  constructor({ container, list, empty, properties, search, tree, setLoading, showStatus }) {
    this.container = container;
    this.list = list;
    this.empty = empty;
    this.properties = properties;
    this.search = search;
    this.tree = tree;
    this.setLoading = setLoading;
    this.showStatus = showStatus;
    this.loadedWork = null;
    this.modelRecords = new Map();
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
    this.highlighter = this.components.get(OBCF.Highlighter);
    this.highlighter.setup({
      world: this.world,
      selectMaterialDefinition: { color: new THREE.Color('#b8860b'), opacity: 0.8, transparent: false, preserveOriginalMaterial: true },
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
      this.modelRecords.clear();
    }
    for (let index = 0; index < models.length; index += 1) {
      const model = models[index];
      try {
        this.setLoading(true, `Carregando ${model.discipline} otimizado…`, Math.round((index / models.length) * 100));
        const fragmentResponse = await fetch(model.fragment);
        if (!fragmentResponse.ok) throw new Error(`arquivo otimizado não encontrado (${fragmentResponse.status})`);
        await this.fragments.core.load(await fragmentResponse.arrayBuffer(), { modelId: model.id });
        this.modelRecords.set(model.id, { ...model, visible: true });
      } catch (error) {
        this.showStatus(`Piloto Fragments: não foi possível carregar ${model.discipline}: ${error.message}`);
      }
    }
    this.loadedWork = workKey;
    this.setLoading(false);
    this.renderModels(workName);
    this.renderTree(workName);
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
    this.fragments.core.update(true);
    this.world.renderer.needsUpdate = true;
  }

  async fit() {
    if (!this.world?.meshes.size) return;
    await this.world.camera.fit(this.world.meshes, 1.25);
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
        relations: {
          IsDefinedBy: { attributes: true, relations: true },
          DefinesOccurrence: { attributes: true, relations: true },
          HasAssociations: { attributes: true, relations: true },
          ContainedInStructure: { attributes: true, relations: true },
          Decomposes: { attributes: true, relations: true }
        }
      });
      const item = dataByModel[modelId]?.[0];
      if (!item) throw new Error('dados do elemento não foram encontrados no Fragment');
      const record = this.modelRecords.get(modelId);
      const rows = [];
      this.flattenItem(item, '', rows);
      const identityKeys = new Set(['Entity', 'Name', 'ObjectType', 'Tag', 'GlobalId', 'expressID']);
      const identity = {
        'Model ID': modelId,
        'Local ID': localId,
        Disciplina: record?.discipline || '—'
      };
      const details = {};
      for (const { key, value } of rows) {
        const target = identityKeys.has(key) ? identity : details;
        target[key] = value;
      }
      if (!identity['Classe IFC'] && identity.Entity) identity['Classe IFC'] = identity.Entity;
      this.properties.innerHTML = this.renderPropertyGroups({ Identificação: identity, Propriedades: details });
      this.renderTree(this.loadedWork === 'galpao' ? 'Galpão Industrial' : 'Casa Térrea', { type: identity.Entity || identity['Classe IFC'], name: identity.Name });
      this.filterProperties();
    } catch (error) {
      this.properties.innerHTML = `<p class="ifc-empty-copy">Não foi possível obter as propriedades: ${this.escape(error.message)}</p>`;
    }
  }

  flattenItem(value, prefix, output, visited = new WeakSet()) {
    if (value === null || value === undefined) return;
    if (typeof value !== 'object') {
      output.push({ key: prefix || 'Valor', value: String(value) });
      return;
    }
    if (visited.has(value)) return;
    visited.add(value);
    if (Object.prototype.hasOwnProperty.call(value, 'value')) {
      const plain = value.value;
      if (plain === null || plain === undefined || typeof plain !== 'object') output.push({ key: prefix || 'Valor', value: plain ?? '—' });
      else this.flattenItem(plain, prefix, output, visited);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => this.flattenItem(entry, prefix ? `${prefix} ${index + 1}` : `Item ${index + 1}`, output, visited));
      return;
    }
    Object.entries(value).forEach(([key, nested]) => this.flattenItem(nested, prefix ? `${prefix} › ${key}` : key, output, visited));
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
    this.components.enabled = active;
    this.world.enabled = active;
    if (active) this.world.renderer.needsUpdate = true;
  }
}
