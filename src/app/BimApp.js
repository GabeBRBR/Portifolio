import '../styles/bim-app.css';
import { ViewerEngine } from '../viewer/ViewerEngine.js';
import { BimIndex } from '../bim/BimIndex.js';
import { CATEGORY_PALETTE, DISCIPLINE_COLORS, escapeHtml, formatCount, OTHER_COLOR } from '../bim/labels.js';
import { createCsv, createXlsx, downloadBlob } from '../bim/export.js';
import { ElementSheet } from './ElementSheet.js';
import { ProjectNavigator } from './ProjectNavigator.js';
import { TakeoffView, elementSheetRows } from './TakeoffView.js';
import { OverviewView } from './OverviewView.js';
import { ContextMenu } from './ContextMenu.js';
import { ClipHandles } from './ClipHandles.js';

const WORK_LABELS = { 'casa-terrea': 'Casa Térrea', galpao: 'Galpão Industrial', 'casa-popular': 'Casa Popular' };
const CLIP_LABELS = [['minX', 'X mín.'], ['maxX', 'X máx.'], ['minY', 'Altura mín.'], ['maxY', 'Altura máx.'], ['minZ', 'Z mín.'], ['maxZ', 'Z máx.']];
const FLOAT_PANELS = { color: 'bim-color-panel', explode: 'ifc-explode-panel', clip: 'ifc-clip-panel', measure: 'bim-measure-panel', coords: 'bim-coords-panel', views: 'bim-views-panel', settings: 'bim-settings-panel' };
const MOBILE = window.matchMedia('(max-width: 900px)');
const PANELS_KEY = 'bim-panels-v1';
const PANEL_ATTRIBUTES = { navigator: 'data-nav-collapsed', sheet: 'data-sheet-collapsed' };

const storage = {
  get(key, fallback = null) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode or quota */ }
  }
};

const byId = (id) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento da interface ausente: #${id}`);
  return element;
};

/**
 * Application shell of the BIM viewer: tabs, toolbar, floating panels and the
 * wiring between the 3D engine and the navigator, element sheet, takeoff and
 * overview views.
 */
export class BimApp {
  constructor() {
    this.root = byId('ifc-viewer-modal');
    this.workspace = byId('bim-workspace');
    this.ui = {
      projectSelect: byId('bim-project-select'), projectMeta: byId('bim-project-meta'),
      loading: byId('ifc-loading-overlay'), loadingText: byId('ifc-loading-text'), progress: byId('ifc-progress-bar'), status: byId('ifc-status'),
      files: byId('ifc-file-input'), importDialog: byId('ifc-import-scope-dialog'), importFileNames: byId('ifc-import-file-names'),
      explodeRange: byId('ifc-explode-range'), explodeValue: byId('ifc-explode-value'), clipRanges: byId('ifc-clip-ranges'),
      background: byId('ifc-background-input'), quality: byId('ifc-quality-select'), spaces: byId('bim-spaces-toggle'),
      colorSelect: byId('bim-color-select'), legend: byId('bim-legend'), planBanner: byId('bim-plan-banner'), planLabel: byId('bim-plan-label'),
      measureHelp: byId('bim-measure-help'), viewForm: byId('bim-view-form'), viewName: byId('bim-view-name'), viewList: byId('bim-view-list')
    };
    this.tab = 'model';
    this.dirty = { takeoff: true, overview: true };
    this.colorDimension = '';
    this.pendingImportFiles = [];
    this.selectionRows = [];

    this.engine = new ViewerEngine({
      container: byId('ifc-canvas-container'),
      viewCubeContainer: byId('bim-viewcube'),
      walkHelp: byId('ifc-walk-help'),
      walkCrosshair: byId('ifc-walk-crosshair'),
      setLoading: (...args) => this.setLoading(...args),
      showStatus: (message) => this.showStatus(message),
      onSelectionChange: (map) => this.onSelectionChange(map),
      onHoverChange: (info) => this.onHoverChange(info),
      onCameraUpdate: () => this.clipHandles?.refresh(),
      onModelsChange: (models) => this.onModelsChange(models),
      onModeChange: (mode) => this.onModeChange(mode)
    });

    const actions = this.createActions();
    this.actions = actions;
    this.contextMenu = new ContextMenu(byId('bim-context-menu'));
    this.clipHandles = new ClipHandles({
      container: byId('ifc-canvas-container'),
      engine: this.engine,
      isActive: () => !byId('ifc-clip-panel').classList.contains('hidden'),
      onChange: () => this.renderClipControls()
    });
    this.ui.hoverTip = byId('bim-hover-tip');
    this.ui.shortcuts = byId('bim-shortcuts');
    const viewport = byId('ifc-canvas-container');
    // A right-button drag orbits the camera; the menu opens only for a click that did not move.
    viewport.addEventListener('pointerdown', (event) => { this.rightDrag = event.button === 2 ? { x: event.clientX, y: event.clientY, moved: false } : null; });
    viewport.addEventListener('pointermove', (event) => {
      if (this.rightDrag && Math.hypot(event.clientX - this.rightDrag.x, event.clientY - this.rightDrag.y) > 4) this.rightDrag.moved = true;
    });
    viewport.addEventListener('contextmenu', (event) => {
      const dragged = this.rightDrag?.moved;
      this.rightDrag = null;
      if (dragged) event.preventDefault();
      else void this.openContextMenu(event);
    });
    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    this.root.addEventListener('keydown', (event) => this.trapFocus(event));
    this.root.querySelector('[role="tablist"]')?.addEventListener('keydown', (event) => this.moveTabFocus(event));
    byId('bim-shortcuts-btn').addEventListener('click', () => this.toggleShortcuts());
    this.root.querySelector('[data-shortcuts-close]')?.addEventListener('click', () => this.toggleShortcuts(false));
    this.navigator = new ProjectNavigator(byId('bim-navigator'), { engine: this.engine, actions });
    this.sheet = new ElementSheet(byId('bim-sheet'), { engine: this.engine, actions });
    this.takeoff = new TakeoffView(byId('bim-takeoff'), { engine: this.engine, actions });
    this.overview = new OverviewView(byId('bim-overview'), { engine: this.engine, actions });
    this.engine.bimIndex.onChange(() => this.onIndexChange());
    this.sheet.render([]);
    this.engine.onMeasureHint = (text) => {
      this.ui.measureHelp.textContent = text;
      this.ui.measureHelp.classList.toggle('hidden', !text);
    };
    this.bindUi();
  }

  createActions() {
    return {
      select: (rows, options = {}) => this.selectRows(rows, options),
      isolate: async (rows) => {
        await this.engine.isolate(BimIndex.toMap(rows));
        this.showStatus(`${formatCount(rows.length)} elemento(s) isolado(s). Use “Mostrar tudo” no navegador para voltar.`);
      },
      hide: async (rows) => {
        await this.engine.setItemsVisible(BimIndex.toMap(rows), false);
        await this.engine.clearSelection();
        this.showStatus(`${formatCount(rows.length)} elemento(s) ocultado(s). Use “Mostrar tudo” no navegador para voltar.`);
      },
      setVisible: (rows, visible) => this.engine.setItemsVisible(BimIndex.toMap(rows), visible),
      showAll: async () => {
        if (this.engine.plan) await this.engine.exitPlan();
        await this.engine.showAll();
        this.navigator.resetVisibility();
      },
      plan: async (rows, label) => {
        // Terrain and rooms would cover the plan; keep the building elements.
        const building = rows.filter((row) => !['IFCGEOGRAPHICELEMENT', 'IFCSITE', 'IFCCIVILELEMENT'].includes(row.cls) && row.family !== 'space');
        const elevation = rows.find((row) => Number.isFinite(row.storeyElevation))?.storeyElevation ?? null;
        this.closePanels();
        const planRows = building.length ? building : rows;
        const convention = [
          { color: '#2f3a46', test: (row) => row.family === 'wall' || row.family === 'column' },
          { color: '#d8d3c6', test: (row) => ['slab', 'stair', 'footing'].includes(row.family) },
          { color: '#c9962e', test: (row) => row.family === 'opening' },
          { color: '#2a78d6', test: (row) => ['segment', 'fitting', 'terminal'].includes(row.family) },
          { color: '#7d858d', test: (row) => row.family === 'beam' }
        ];
        const styles = convention.map(({ color, test }) => ({ color, map: BimIndex.toMap(planRows.filter(test)) }));
        const ok = await this.engine.enterPlan(BimIndex.toMap(planRows), label, { baseY: elevation, styles, box: BimIndex.boxOf(planRows) });
        if (!ok) this.showStatus('Não foi possível montar a planta: este pavimento não tem geometria visível.');
      },
      isolateModel: (id) => this.engine.isolateModel(id),
      removeModel: (id) => this.engine.removeModel(id),
      setModelVisible: (id, visible) => this.engine.setModelVisibility(id, visible),
      exportRows: (rows, name) => this.exportSheets([{ name: 'Elementos', rows: elementSheetRows(rows) }], name, 'xlsx'),
      exportSheets: (sheets, name, format) => this.exportSheets(sheets, name, format),
      showInModel: (rows) => {
        this.switchTab('model');
        return this.selectRows(rows, { zoom: true });
      },
      status: (message) => this.showStatus(message),
      projectLabel: () => this.projectLabel()
    };
  }

  bindUi() {
    byId('ifc-close-btn').addEventListener('click', () => this.close());
    byId('ifc-fullscreen-btn').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else this.root.requestFullscreen?.();
    });
    byId('ifc-benchmark-copy-btn').addEventListener('click', () => this.copyBenchmark());
    this.root.querySelectorAll('[data-tab]').forEach((button) => {
      if (button.classList.contains('bim-tab')) button.addEventListener('click', () => this.switchTab(button.dataset.tab));
    });
    this.root.querySelectorAll('[data-drawer]').forEach((button) => button.addEventListener('click', () => this.toggleDrawer(button.dataset.drawer)));
    this.root.querySelectorAll('[data-panel-toggle]').forEach((button) => button.addEventListener('click', () => this.togglePanelCollapsed(button.dataset.panelToggle)));
    this.restorePanels();
    this.ui.projectSelect.addEventListener('change', (event) => {
      const value = event.target.value;
      if (value !== 'local') void this.open(value);
    });

    // IFC import
    this.ui.files.addEventListener('change', (event) => this.promptImport(event.target.files));
    byId('ifc-import-same-project').addEventListener('click', () => this.importPending('same'));
    byId('ifc-import-new-project').addEventListener('click', () => this.importPending('new'));
    this.ui.importDialog.addEventListener('close', () => { this.pendingImportFiles = []; });
    const viewport = byId('ifc-canvas-container');
    viewport.addEventListener('dragover', (event) => event.preventDefault());
    viewport.addEventListener('drop', (event) => {
      event.preventDefault();
      this.promptImport(event.dataTransfer?.files);
    });

    // Toolbar
    this.root.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => this.handleAction(button.dataset.action, button)));
    this.ui.explodeRange.addEventListener('input', (event) => {
      const distance = Number(event.target.value);
      this.ui.explodeValue.textContent = `${distance.toFixed(1).replace('.', ',')} m`;
      void this.engine.setExplodeDistance(distance);
    });
    byId('ifc-reset-clip').addEventListener('click', () => { this.engine.resetClipBox(); this.renderClipControls(); this.clipHandles.refresh(); });
    this.ui.background.value = storage.get('bim-background-v2', null) || localStorage.getItem('ifc-background') || '#f2f1ec';
    this.ui.background.addEventListener('input', (event) => this.setBackground(event.target.value));
    this.root.querySelectorAll('[data-color]').forEach((button) => button.addEventListener('click', () => this.setBackground(button.dataset.color)));
    this.ui.quality.value = this.engine.getQualityProfile();
    this.ui.quality.addEventListener('change', (event) => this.engine.setQualityProfile(event.target.value));
    this.ui.spaces.addEventListener('change', (event) => this.engine.setSpacesVisible(event.target.checked));
    this.ui.colorSelect.addEventListener('change', (event) => this.setColorDimension(event.target.value));
    this.ui.legend.addEventListener('click', (event) => {
      if (event.target.closest('[data-legend-close]')) {
        this.ui.colorSelect.value = '';
        void this.setColorDimension('');
        return;
      }
      const item = event.target.closest('[data-legend]');
      if (item) void this.selectRows(this.legendGroups?.[Number(item.dataset.legend)]?.rows || [], { zoom: true });
    });
    byId('bim-plan-exit').addEventListener('click', () => this.engine.exitPlan());

    // Measurement
    this.root.querySelectorAll('[data-measure]').forEach((button) => button.addEventListener('click', () => this.setMeasureMode(button.dataset.measure)));
    this.root.querySelectorAll('[data-std-view]').forEach((button) => button.addEventListener('click', () => void this.engine.setStandardView(button.dataset.stdView)));
    byId('bim-measure-clear').addEventListener('click', () => this.engine.clearMeasurements());
    byId('bim-measure-stop').addEventListener('click', () => { this.setMeasureMode(null); this.closePanels(); });
    byId('bim-coords-clear').addEventListener('click', () => this.engine.clearMeasurements());
    byId('bim-coords-stop').addEventListener('click', () => { this.setMeasureMode(null); this.closePanels(); });

    // Saved views
    this.ui.viewForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.saveView(this.ui.viewName.value);
    });
    this.ui.viewList.addEventListener('click', (event) => {
      const item = event.target.closest('[data-view]');
      if (!item) return;
      const views = this.loadViews();
      const view = views[Number(item.dataset.view)];
      if (!view) return;
      if (event.target.closest('[data-view-delete]')) {
        views.splice(Number(item.dataset.view), 1);
        storage.set(this.viewsKey(), views);
        this.renderViews();
      } else void this.engine.applyViewState(view.state).then(() => this.renderClipControls());
    });

    MOBILE.addEventListener?.('change', () => this.workspace.removeAttribute('data-drawer'));
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async open(workKey = 'casa-terrea') {
    this.root.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    this.workKey = workKey;
    if (WORK_LABELS[workKey]) this.ui.projectSelect.value = workKey;
    try {
      await this.engine.open(workKey);
      this.setBackground(this.ui.background.value, { persist: false });
    } catch (error) {
      this.setLoading(false);
      this.showStatus(`Não foi possível abrir o projeto: ${error.message}`);
    }
  }

  close() {
    this.setMeasureMode(null);
    this.engine.setActive(false);
    this.root.classList.add('hidden');
    document.body.style.overflow = '';
    if (document.fullscreenElement) document.exitFullscreen?.();
  }

  projectLabel() {
    if (this.engine.loadedWork) return WORK_LABELS[this.engine.loadedWork] || this.engine.getProjectLabel();
    const locals = this.engine.getModelSummaries().filter((model) => model.source === 'local');
    return locals.length === 1 ? locals[0].name.replace(/\.ifc$/i, '') : 'IFCs abertos';
  }

  // ---------------------------------------------------------------------------
  // Engine events
  // ---------------------------------------------------------------------------

  onSelectionChange(map) {
    const rows = this.engine.bimIndex.rowsFromMap(map);
    this.selectionRows = rows;
    this.sheet.render(rows);
    this.navigator.setSelection(rows);
    if (rows.length && MOBILE.matches && this.tab === 'model') this.workspace.dataset.drawer = 'sheet';
  }

  onModelsChange(models) {
    this.navigator.setModels(models);
    const hasLocal = models.some((model) => model.source === 'local');
    const localOption = this.ui.projectSelect.querySelector('option[value="local"]');
    localOption.hidden = !hasLocal || Boolean(this.engine.loadedWork);
    if (!this.engine.loadedWork && hasLocal) this.ui.projectSelect.value = 'local';
    this.updateMeta();
    this.root.querySelector('.bim-walk-only')?.toggleAttribute('disabled', !models.length);
  }

  onIndexChange() {
    this.navigator.render();
    this.dirty.takeoff = true;
    this.dirty.overview = true;
    if (this.tab === 'takeoff') this.renderTab('takeoff');
    if (this.tab === 'overview') this.renderTab('overview');
    this.updateMeta();
    if (this.colorDimension) void this.setColorDimension(this.colorDimension);
    if (!this.selectionRows.length) this.sheet.render([]);
  }

  onModeChange(info) {
    // Engine callbacks carry either the plan label or the walk mode; each one updates only its own control.
    if ('walk' in info) this.setToolActive(info.walk === 'orbit' ? 'orbit' : 'walk');
    if (!('plan' in info)) return;
    this.ui.planBanner.classList.toggle('hidden', !info.plan);
    this.ui.planLabel.textContent = info.plan || '';
    this.renderClipControls();
  }

  updateMeta() {
    const models = this.engine.getModelSummaries();
    const elements = this.engine.bimIndex.size;
    this.ui.projectMeta.textContent = models.length
      ? `${models.length} disciplina${models.length === 1 ? '' : 's'}${elements ? `, ${formatCount(elements)} elementos` : ''}`
      : 'Nenhum modelo aberto';
  }

  // ---------------------------------------------------------------------------
  // Hover, context menu and keyboard
  // ---------------------------------------------------------------------------

  onHoverChange(info) {
    const tip = this.ui.hoverTip;
    if (!info || this.contextMenu.isOpen) {
      tip.classList.add('hidden');
      return;
    }
    const { row } = info;
    // The card is a child of the stage; offsetParent is null while the card is hidden.
    const stage = tip.parentElement.getBoundingClientRect();
    const details = [row.classLabel, row.typeName, row.storey].filter(Boolean).join(' · ');
    tip.innerHTML = `<strong>${escapeHtml(row.name || row.classLabel)}</strong><span>${escapeHtml(details)}</span>`;
    tip.style.left = `${info.clientX - (stage?.left || 0) + 14}px`;
    tip.style.top = `${info.clientY - (stage?.top || 0) + 14}px`;
    tip.classList.remove('hidden');
  }

  async openContextMenu(event) {
    event.preventDefault();
    if (this.engine.walk.mode !== 'orbit' || this.engine.explodeDistance || this.engine.measureMode) return;
    this.engine.clearHover();
    const row = await this.engine.pickAt(event.clientX, event.clientY);
    this.contextMenu.open(event.clientX, event.clientY, this.contextMenuItems(row), { title: row ? (row.name || row.classLabel) : '' });
  }

  contextMenuItems(row) {
    const items = [];
    if (row) {
      const rows = [row];
      items.push(
        { label: 'Propriedades', icon: 'ph-identification-card', action: () => { this.setPanelCollapsed('sheet', false); void this.selectRows(rows); } },
        { label: 'Isolar', icon: 'ph-selection', action: () => this.actions.isolate(rows) },
        { label: 'Ocultar', icon: 'ph-eye-slash', action: () => this.actions.hide(rows) },
        { label: 'Enquadrar', icon: 'ph-frame-corners', action: () => this.engine.fitToMap(BimIndex.toMap(rows)) },
        { label: 'Copiar GlobalId', icon: 'ph-copy', disabled: !row.guid, action: () => this.copyGuid(row.guid) },
        { divider: true }
      );
    }
    items.push(
      { label: 'Enquadrar tudo', icon: 'ph-corners-out', action: () => this.engine.fit({ animate: true }) },
      { label: 'Mostrar tudo', icon: 'ph-eye', action: () => this.actions.showAll() }
    );
    return items;
  }

  async copyGuid(guid) {
    try {
      await navigator.clipboard.writeText(guid);
      this.showStatus('GlobalId copiado.');
    } catch {
      this.showStatus(`GlobalId: ${guid}`);
    }
  }

  toggleShortcuts(open = this.ui.shortcuts.classList.contains('hidden')) {
    this.ui.shortcuts.classList.toggle('hidden', !open);
  }

  /** Tab stays inside the viewer while it is open, as a modal dialog should. */
  trapFocus(event) {
    if (event.key !== 'Tab') return;
    const focusable = [...this.root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.disabled && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const outside = !this.root.contains(document.activeElement);
    if (event.shiftKey && (document.activeElement === first || outside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || outside)) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Arrow keys move between the Modelo, Quantitativos and Visão geral tabs. */
  moveTabFocus(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const tabs = [...this.root.querySelectorAll('.bim-tab')];
    const index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    const step = event.key === 'ArrowRight' ? 1 : tabs.length - 1;
    const next = tabs[(index + step) % tabs.length];
    event.preventDefault();
    next.focus();
    next.click();
  }

  /** Keys act only on the open viewer, never while walking (WASD) or typing in a field. */
  onKeyDown(event) {
    if (this.root.classList.contains('hidden') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest?.('input, select, textarea, [contenteditable="true"]') || this.engine.walk.mode !== 'orbit') return;
    const key = event.key.toLowerCase();
    const selected = this.selectionRows;
    let handled = true;
    if (event.key === '?') this.toggleShortcuts();
    else if (key === 'f') void this.engine.fit({ animate: true });
    else if (key === 'i' && selected.length) void this.actions.isolate(selected);
    else if (key === 'h' && selected.length) void this.actions.hide(selected);
    else if (key === 'u') void this.actions.showAll();
    else if (key === 'escape' && !this.ui.shortcuts.classList.contains('hidden')) this.toggleShortcuts(false);
    else if (key === 'escape' && selected.length) void this.engine.clearSelection();
    else handled = false;
    if (handled) event.preventDefault();
  }

  // ---------------------------------------------------------------------------
  // Tabs and drawers
  // ---------------------------------------------------------------------------

  switchTab(tab) {
    if (this.tab === tab) return;
    if (tab !== 'model') this.setMeasureMode(null);
    this.tab = tab;
    this.workspace.dataset.tab = tab;
    this.workspace.removeAttribute('data-drawer');
    this.root.querySelectorAll('.bim-tab').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.tab === tab)));
    this.closePanels();
    this.renderTab(tab);
    this.engine.world && (this.engine.world.renderer.needsUpdate = true);
  }

  renderTab(tab) {
    if (tab === 'takeoff' && this.dirty.takeoff) { this.takeoff.render(); this.dirty.takeoff = false; }
    if (tab === 'overview' && this.dirty.overview) { this.overview.render(); this.dirty.overview = false; }
  }

  toggleDrawer(name) {
    if (this.workspace.dataset.drawer === name) this.workspace.removeAttribute('data-drawer');
    else this.workspace.dataset.drawer = name;
  }

  // Desktop panels can be collapsed to give the model the full width. It is a
  // visitor preference, so it is kept in this browser only.
  restorePanels() {
    const saved = storage.get(PANELS_KEY, {});
    Object.keys(PANEL_ATTRIBUTES).forEach((name) => this.setPanelCollapsed(name, Boolean(saved[name])));
  }

  togglePanelCollapsed(name) {
    this.setPanelCollapsed(name, !this.workspace.hasAttribute(PANEL_ATTRIBUTES[name]));
  }

  setPanelCollapsed(name, collapsed) {
    if (collapsed) this.workspace.setAttribute(PANEL_ATTRIBUTES[name], '');
    else this.workspace.removeAttribute(PANEL_ATTRIBUTES[name]);
    this.root.querySelector(`[data-panel-toggle="${name}"]`)?.setAttribute('aria-pressed', String(!collapsed));
    storage.set(PANELS_KEY, Object.fromEntries(Object.entries(PANEL_ATTRIBUTES).map(([key, attribute]) => [key, this.workspace.hasAttribute(attribute)])));
    if (this.engine.world) this.engine.world.renderer.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------

  async selectRows(rows, { zoom = false, additive = false } = {}) {
    if (!rows.length) return this.engine.clearSelection();
    let target = rows;
    if (additive) {
      const keys = new Set(this.selectionRows.map((row) => row.key));
      target = keys.has(rows[0].key) && rows.length === 1
        ? this.selectionRows.filter((row) => row.key !== rows[0].key)
        : [...this.selectionRows, ...rows.filter((row) => !keys.has(row.key))];
    }
    await this.engine.select(BimIndex.toMap(target), { zoom, box: zoom ? BimIndex.boxOf(target) : null });
  }

  // ---------------------------------------------------------------------------
  // Toolbar
  // ---------------------------------------------------------------------------

  async handleAction(action, button) {
    if (action === 'orbit') {
      this.setMeasureMode(null);
      await this.engine.exitWalk();
      this.setToolActive('orbit');
      return;
    }
    if (action === 'walk') {
      this.closePanels();
      await this.engine.startWalkPlacement();
      this.setToolActive('walk');
      return;
    }
    if (action === 'fit') {
      if (this.engine.plan) await this.engine.exitPlan();
      else await this.engine.fit({ animate: true });
      return;
    }
    if (action === 'xray') {
      const next = !this.engine.xrayEnabled;
      await this.engine.setXray(next);
      button.classList.toggle('active', next);
      button.setAttribute('aria-pressed', String(next));
      if (next && !this.selectionRows.length) this.showStatus('Raio-X ativo: selecione elementos para destacá-los no modelo translúcido.');
      return;
    }
    if (action === 'clip') {
      if (!this.engine.getClipBox()) this.engine.resetClipBox();
      this.renderClipControls();
    }
    if (action === 'capture') return this.captureImage();
    if (action === 'views') this.renderViews();
    if (action === 'measure') {
      const opening = document.getElementById(FLOAT_PANELS.measure).classList.contains('hidden');
      this.togglePanel('measure');
      if (opening && (!this.engine.measureMode || this.engine.measureMode === 'point')) this.setMeasureMode('length');
      return;
    }
    if (action === 'coords') {
      const opening = document.getElementById(FLOAT_PANELS.coords).classList.contains('hidden');
      this.togglePanel('coords');
      if (opening) this.setMeasureMode('point');
      else this.setMeasureMode(null);
      return;
    }
    this.togglePanel(action);
  }

  setToolActive(name) {
    this.root.querySelectorAll('[data-action="orbit"],[data-action="walk"]').forEach((button) => button.classList.toggle('active', button.dataset.action === name));
  }

  togglePanel(name) {
    const id = FLOAT_PANELS[name];
    if (!id) return;
    const panel = document.getElementById(id);
    const opening = panel.classList.contains('hidden');
    this.closePanels();
    if (opening) panel.classList.remove('hidden');
    this.root.querySelectorAll('[data-action]').forEach((button) => {
      if (FLOAT_PANELS[button.dataset.action]) button.classList.toggle('active', opening && button.dataset.action === name || this.measureToolActive(button.dataset.action));
    });
    this.clipHandles?.refresh();
  }

  closePanels() {
    Object.values(FLOAT_PANELS).forEach((id) => document.getElementById(id)?.classList.add('hidden'));
    this.root.querySelectorAll('[data-action]').forEach((button) => {
      if (FLOAT_PANELS[button.dataset.action]) button.classList.toggle('active', this.measureToolActive(button.dataset.action));
    });
    this.clipHandles?.refresh();
  }

  /** The measure button owns length/angle/area; the coordinates button owns the point mode. */
  measureToolActive(action) {
    const mode = this.engine.measureMode;
    if (action === 'measure') return Boolean(mode) && mode !== 'point';
    if (action === 'coords') return mode === 'point';
    return false;
  }

  renderClipControls() {
    const root = this.ui.clipRanges;
    root.innerHTML = '';
    const box = this.engine.getClipBox();
    if (!box) return;
    const bounds = this.engine.getVisibleModelBounds();
    const limits = bounds.isEmpty() ? null : bounds;
    CLIP_LABELS.forEach(([key, label]) => {
      const axis = key.slice(-1).toLowerCase();
      const min = limits ? limits.min[axis] - 0.5 : Math.min(box.minX, box.minY, box.minZ);
      const max = limits ? limits.max[axis] + 0.5 : Math.max(box.maxX, box.maxY, box.maxZ);
      const row = document.createElement('div');
      row.className = 'bim-clip-row';
      row.innerHTML = `<label>${label}<output>${box[key].toFixed(2).replace('.', ',')} m</output></label><input type="range" min="${min}" max="${max}" step="0.05" value="${box[key]}" aria-label="${label}">`;
      row.querySelector('input').addEventListener('input', (event) => {
        const updated = this.engine.setClipBox({ [key]: Number(event.target.value) });
        if (updated) row.querySelector('output').textContent = `${updated[key].toFixed(2).replace('.', ',')} m`;
      });
      root.append(row);
    });
  }

  setBackground(color, { persist = true } = {}) {
    this.engine.setBackground(color);
    this.ui.background.value = color;
    if (persist) storage.set('bim-background-v2', color);
  }

  setMeasureMode(mode) {
    void this.engine.setMeasureMode(mode);
    this.root.querySelectorAll('[data-measure]').forEach((button) => button.setAttribute('aria-checked', String(button.dataset.measure === mode)));
    this.root.querySelector('[data-action="measure"]')?.classList.toggle('active', Boolean(mode) && mode !== 'point');
    this.root.querySelector('[data-action="coords"]')?.classList.toggle('active', mode === 'point');
    const help = mode === 'length'
      ? 'Clique no ponto A. Encaixes: ponto final, ponto médio, perpendicular, aresta e face.'
      : mode === 'point'
        ? 'Clique em um ponto para ler suas coordenadas.'
        : mode === 'angle'
        ? 'Clique no primeiro ponto do ângulo.'
        : mode === 'area' ? 'Clique em cada vértice do polígono.' : '';
    this.ui.measureHelp.textContent = help;
    this.ui.measureHelp.classList.toggle('hidden', !help);
  }

  // ---------------------------------------------------------------------------
  // Colour by parameter
  // ---------------------------------------------------------------------------

  async setColorDimension(dimension) {
    this.colorDimension = dimension;
    if (!dimension || !this.engine.bimIndex.size) {
      this.legendGroups = [];
      this.ui.legend.classList.add('hidden');
      await this.engine.clearColorGroups();
      return;
    }
    let groups = BimIndex.group(this.engine.bimIndex.rows.filter((row) => row.family !== 'space'), dimension);
    if (groups.length > CATEGORY_PALETTE.length) {
      const rest = groups.slice(CATEGORY_PALETTE.length - 1);
      groups = [...groups.slice(0, CATEGORY_PALETTE.length - 1), { key: `Outros (${rest.length})`, rows: rest.flatMap((group) => group.rows), other: true }];
    }
    this.legendGroups = groups.map((group, index) => ({
      ...group,
      color: group.other ? OTHER_COLOR : dimension === 'discipline' && DISCIPLINE_COLORS[group.key] ? DISCIPLINE_COLORS[group.key] : CATEGORY_PALETTE[index]
    }));
    await this.engine.applyColorGroups(this.legendGroups.map((group) => ({ color: group.color, map: BimIndex.toMap(group.rows) })));
    const label = this.ui.colorSelect.selectedOptions[0]?.textContent || '';
    this.ui.legend.innerHTML = `<div class="bim-legend__head"><span>${escapeHtml(label)}</span><button type="button" data-legend-close aria-label="Remover cores">×</button></div>
      <ul>${this.legendGroups.map((group, index) => `<li><button type="button" data-legend="${index}"><span class="bim-swatch" style="--swatch:${group.color}"></span><span class="bim-legend__label">${escapeHtml(group.key)}</span><b>${formatCount(group.rows.length)}</b></button></li>`).join('')}</ul>`;
    this.ui.legend.classList.remove('hidden');
  }

  // ---------------------------------------------------------------------------
  // Saved views
  // ---------------------------------------------------------------------------

  viewsKey() {
    return `bim-views:${this.engine.loadedWork || 'local'}`;
  }

  loadViews() {
    const views = storage.get(this.viewsKey(), []);
    return Array.isArray(views) ? views : [];
  }

  saveView(name) {
    const state = this.engine.getViewState();
    if (!state) return;
    const views = this.loadViews();
    views.unshift({ name: name.trim() || `Vista ${views.length + 1}`, state, savedAt: Date.now() });
    storage.set(this.viewsKey(), views.slice(0, 30));
    this.ui.viewName.value = '';
    this.renderViews();
    this.showStatus('Vista salva neste navegador.');
  }

  renderViews() {
    const views = this.loadViews();
    this.ui.viewList.innerHTML = views.length
      ? views.map((view, index) => `<li data-view="${index}"><button type="button" class="bim-view-list__open"><i class="ph ph-camera"></i><span>${escapeHtml(view.name)}</span></button><button type="button" data-view-delete aria-label="Excluir ${escapeHtml(view.name)}"><i class="ph ph-trash"></i></button></li>`).join('')
      : '<li class="bim-muted">Nenhuma vista salva. Posicione a câmera e os cortes e salve para voltar depois.</li>';
  }

  // ---------------------------------------------------------------------------
  // Import and export
  // ---------------------------------------------------------------------------

  promptImport(fileList) {
    const files = [...(fileList || [])];
    this.ui.files.value = '';
    if (!files.length) return;
    this.pendingImportFiles = files;
    const names = files.slice(0, 2).map((file) => file.name).join(', ');
    this.ui.importFileNames.textContent = files.length > 2 ? `${names} e mais ${files.length - 2}` : names;
    if (this.ui.importDialog.open) this.ui.importDialog.close();
    this.ui.importDialog.showModal();
  }

  async importPending(scope) {
    const files = this.pendingImportFiles;
    if (!files.length) return;
    this.ui.importDialog.close();
    try {
      if (!this.engine.components) await this.engine.open(this.workKey || 'casa-terrea');
      if (scope === 'new') await this.engine.startNewProject();
      await this.engine.addFiles(files);
    } catch (error) {
      this.setLoading(false);
      this.showStatus(`Não foi possível abrir o IFC: ${error.message}`);
    }
  }

  async captureImage() {
    const blob = await this.engine.captureImage();
    if (!blob) return this.showStatus('Não foi possível capturar a imagem agora.');
    const project = this.projectLabel().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    downloadBlob(blob, `${project || 'projeto'}-vista-${new Date().toISOString().slice(0, 10)}.png`);
    this.showStatus('Imagem PNG salva.');
  }

  exportSheets(sheets, name, format = 'xlsx') {
    const project = this.projectLabel().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `${project || 'projeto'}-${name}-${stamp}`;
    if (format === 'csv') downloadBlob(createCsv(sheets[0].rows), `${base}.csv`);
    else downloadBlob(createXlsx(sheets), `${base}.xlsx`);
    this.showStatus(`Planilha ${format === 'csv' ? 'CSV' : 'Excel'} gerada.`);
  }

  async copyBenchmark() {
    const snapshot = this.engine.getBenchmarkSnapshot();
    if (!snapshot) return this.showStatus('Aguarde alguns segundos após carregar o modelo para copiar a medição.');
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      this.showStatus('Medição de desempenho copiada.');
    } catch {
      this.showStatus('Não foi possível copiar a medição neste navegador.');
    }
  }

  // ---------------------------------------------------------------------------
  // Feedback
  // ---------------------------------------------------------------------------

  setLoading(show, text = '', percent = 0) {
    this.ui.loading.classList.toggle('hidden', !show);
    this.ui.loadingText.textContent = text;
    this.ui.progress.style.width = `${percent}%`;
  }

  showStatus(message) {
    this.ui.status.textContent = message;
    this.ui.status.classList.remove('hidden');
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => this.ui.status.classList.add('hidden'), 6500);
  }
}
