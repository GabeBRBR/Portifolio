import { BimIndex } from '../bim/BimIndex.js';
import { DISCIPLINE_COLORS, escapeHtml, formatCount, formatNumber } from '../bim/labels.js';

const TABS = [
  { id: 'storey', label: 'Pavimentos', levels: ['storey', 'classLabel'] },
  { id: 'discipline', label: 'Disciplinas', levels: ['discipline', 'classLabel'] },
  { id: 'category', label: 'Categorias', levels: ['classLabel', 'type'] },
  { id: 'system', label: 'Sistemas', levels: ['system', 'systemName'] }
];
const ELEMENT_PAGE = 200;
const SEARCH_LIMIT = 150;

const levelValue = (row, dimension) => {
  if (dimension === 'type') return row.typeName;
  if (dimension === 'system') return row.systemType;
  if (dimension === 'systemName') return row.system;
  return row[dimension];
};

/**
 * Left-hand panel: the project as a navigable tree by storey, discipline,
 * category/type and system, with search, visibility and isolation.
 */
export class ProjectNavigator {
  constructor(root, { engine, actions }) {
    this.root = root;
    this.engine = engine;
    this.actions = actions;
    this.tab = 'storey';
    this.query = '';
    this.expanded = new Set();
    this.hidden = new Set();
    this.nodes = new Map();
    this.pages = new Map();
    this.models = [];
    this.selectedKeys = new Set();
    this.root.innerHTML = `
      <div class="bim-nav__search">
        <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
        <input type="search" data-role="search" placeholder="Buscar por nome, tipo, material ou GlobalId" aria-label="Buscar elementos">
      </div>
      <div class="bim-nav__tabs" role="tablist" aria-label="Organizar navegador por">
        ${TABS.map((tab) => `<button type="button" role="tab" data-nav-tab="${tab.id}" aria-selected="${tab.id === this.tab}">${tab.label}</button>`).join('')}
      </div>
      <div class="bim-nav__toolbar">
        <span data-role="summary"></span>
        <button type="button" class="bim-link-button" data-act="show-all">Mostrar tudo</button>
      </div>
      <div class="bim-nav__tree" data-role="tree"></div>`;
    this.tree = this.root.querySelector('[data-role="tree"]');
    this.summary = this.root.querySelector('[data-role="summary"]');
    this.root.addEventListener('click', (event) => this.onClick(event));
    this.root.addEventListener('change', (event) => this.onChange(event));
    let searchTimer = 0;
    this.root.querySelector('[data-role="search"]').addEventListener('input', (event) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { this.query = event.target.value; this.render(); }, 140);
    });
  }

  setModels(models) {
    this.models = models;
    this.render();
  }

  setSelection(rows) {
    this.selectedKeys = new Set(rows.map((row) => row.key));
    this.tree.querySelectorAll('.bim-node--element').forEach((node) => {
      node.classList.toggle('is-selected', this.selectedKeys.has(node.dataset.key));
    });
  }

  resetVisibility() {
    this.hidden.clear();
    this.render();
  }

  render() {
    const index = this.engine.bimIndex;
    this.nodes.clear();
    this.root.querySelectorAll('[data-nav-tab]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.navTab === this.tab)));
    const storeys = index.storeys().filter((storey) => storey.name !== 'Sem pavimento').length;
    this.summary.textContent = index.size ? `${formatCount(index.size)} elementos, ${storeys} pavimento${storeys === 1 ? '' : 's'}` : '';
    if (!index.size) {
      this.tree.innerHTML = this.models.length
        ? '<p class="bim-empty">Os dados BIM deste projeto ainda estão sendo preparados.</p>'
        : '<p class="bim-empty">Nenhum modelo aberto. Escolha um exemplo acima ou use <b>Abrir IFC</b>.</p>';
      return;
    }
    if (this.query.trim()) return this.renderSearch();
    const tab = TABS.find((entry) => entry.id === this.tab);
    let rows = index.rows;
    if (tab.id === 'system') rows = rows.filter((row) => row.systems.length);
    const disciplineHeader = tab.id === 'discipline' ? this.renderModels() : '';
    if (!rows.length) {
      this.tree.innerHTML = `${disciplineHeader}<p class="bim-empty">Nenhum elemento deste projeto está associado a um sistema (IfcSystem). Use <b>Categorias</b> para navegar pelas instalações.</p>`;
      return;
    }
    const groups = BimIndex.group(rows, tab.levels[0] === 'type' ? 'type' : tab.levels[0] === 'system' ? 'system' : tab.levels[0]);
    this.tree.innerHTML = disciplineHeader + `<ul class="bim-tree" role="tree">${groups.map((group) => this.renderGroup(tab, [group.key], group.rows, 0)).join('')}</ul>`;
  }

  renderModels() {
    if (!this.models.length) return '';
    return `<ul class="bim-models">${this.models.map((model) => `
      <li class="bim-model">
        <label><input type="checkbox" data-model="${escapeHtml(model.id)}" ${model.visible ? 'checked' : ''}><span class="bim-dot" style="--dot:${DISCIPLINE_COLORS[model.discipline] || '#8d8a82'}"></span><strong>${escapeHtml(model.discipline)}</strong></label>
        <small>${model.source === 'local' ? `IFC local, ${formatNumber(model.size / 1024 ** 2, 1)} MB${model.cacheState === 'cache' ? ', reaberto do cache' : ''}` : 'Exemplo publicado'}, ${formatCount(model.elements)} elementos</small>
        <span class="bim-model__actions">
          <button type="button" class="bim-link-button" data-isolate-model="${escapeHtml(model.id)}">Só esta</button>
          ${model.source === 'local' ? `<button type="button" class="bim-link-button bim-link-button--danger" data-remove-model="${escapeHtml(model.id)}">Remover</button>` : ''}
        </span>
      </li>`).join('')}</ul>`;
  }

  nodeKey(path) {
    return `${this.tab}|${path.join('|')}`;
  }

  renderGroup(tab, path, rows, depth) {
    const key = this.nodeKey(path);
    this.nodes.set(key, rows);
    const label = path[path.length - 1];
    const expanded = this.expanded.has(key);
    const hidden = this.hidden.has(key);
    const isStorey = tab.levels[depth] === 'storey';
    const storeyMeta = isStorey && rows[0]?.storeyElevation !== null && rows[0]?.storeyElevation !== undefined ? `<small>${formatNumber(rows[0].storeyElevation, 2)} m</small>` : '';
    const dot = tab.levels[depth] === 'discipline' ? `<span class="bim-dot" style="--dot:${DISCIPLINE_COLORS[label] || '#8d8a82'}"></span>` : '';
    let children = '';
    if (expanded) {
      if (depth + 1 < tab.levels.length) {
        const dimension = tab.levels[depth + 1];
        const groups = new Map();
        rows.forEach((row) => {
          const value = levelValue(row, dimension) ?? '—';
          if (!groups.has(value)) groups.set(value, []);
          groups.get(value).push(row);
        });
        const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0]), 'pt-BR'));
        children = `<ul role="group">${ordered.map(([value, groupRows]) => this.renderGroup(tab, [...path, value], groupRows, depth + 1)).join('')}</ul>`;
      } else {
        children = `<ul role="group">${this.renderElements(key, rows)}</ul>`;
      }
    }
    return `<li class="bim-node${hidden ? ' is-hidden' : ''}" role="treeitem" aria-expanded="${expanded}" data-node="${escapeHtml(key)}">
      <div class="bim-node__row" style="--depth:${depth}">
        <button type="button" class="bim-node__toggle" data-toggle aria-label="${expanded ? 'Recolher' : 'Expandir'} ${escapeHtml(label)}"><i class="ph ph-caret-right"></i></button>
        <button type="button" class="bim-node__label" data-select title="Selecionar ${escapeHtml(label)}">${dot}<span>${escapeHtml(label)}</span>${storeyMeta}</button>
        <span class="bim-node__count">${formatCount(rows.length)}</span>
        <span class="bim-node__actions">
          ${isStorey && depth === 0 && label !== 'Sem pavimento' ? '<button type="button" data-plan title="Ver planta deste pavimento"><i class="ph ph-map-trifold"></i></button>' : ''}
          <button type="button" data-isolate title="Isolar"><i class="ph ph-selection"></i></button>
          <button type="button" data-visibility title="${hidden ? 'Mostrar' : 'Ocultar'}" aria-pressed="${hidden}"><i class="ph ${hidden ? 'ph-eye-slash' : 'ph-eye'}"></i></button>
        </span>
      </div>
      ${children}
    </li>`;
  }

  renderElements(key, rows) {
    const limit = this.pages.get(key) || ELEMENT_PAGE;
    const sorted = [...rows].sort((a, b) => String(a.name || a.typeName).localeCompare(String(b.name || b.typeName), 'pt-BR', { numeric: true }));
    const items = sorted.slice(0, limit).map((row) => this.renderElement(row)).join('');
    const more = rows.length > limit ? `<li class="bim-node bim-node--more"><button type="button" class="bim-link-button" data-more="${escapeHtml(key)}">Mostrar mais ${formatCount(Math.min(ELEMENT_PAGE, rows.length - limit))} de ${formatCount(rows.length - limit)}</button></li>` : '';
    return items + more;
  }

  renderElement(row) {
    return `<li class="bim-node bim-node--element${this.selectedKeys.has(row.key) ? ' is-selected' : ''}" role="treeitem" data-key="${escapeHtml(row.key)}">
      <button type="button" class="bim-node__element" data-element>${escapeHtml(row.name || row.typeName)}<small>${escapeHtml(row.tag && row.tag.length < 14 ? row.tag : row.classLabel)}</small></button>
    </li>`;
  }

  renderSearch() {
    const matches = this.engine.bimIndex.filter({ query: this.query });
    this.nodes.set('search', matches);
    this.tree.innerHTML = matches.length
      ? `<div class="bim-search-head"><span>${formatCount(matches.length)} resultado${matches.length === 1 ? '' : 's'}</span><button type="button" class="bim-link-button" data-select-search>Selecionar todos</button></div>
         <ul class="bim-tree bim-tree--flat">${matches.slice(0, SEARCH_LIMIT).map((row) => this.renderElement(row)).join('')}</ul>
         ${matches.length > SEARCH_LIMIT ? `<p class="bim-empty">Mostrando ${SEARCH_LIMIT}. Refine a busca para ver os demais.</p>` : ''}`
      : '<p class="bim-empty">Nenhum elemento encontrado. Tente o nome do tipo, o material, o pavimento ou parte do GlobalId.</p>';
  }

  async onClick(event) {
    const tabButton = event.target.closest('[data-nav-tab]');
    if (tabButton) {
      this.tab = tabButton.dataset.navTab;
      this.render();
      return;
    }
    if (event.target.closest('[data-act="show-all"]')) {
      await this.actions.showAll();
      return;
    }
    if (event.target.closest('[data-select-search]')) {
      await this.actions.select(this.nodes.get('search') || [], { zoom: true });
      return;
    }
    const more = event.target.closest('[data-more]');
    if (more) {
      const key = more.dataset.more;
      this.pages.set(key, (this.pages.get(key) || ELEMENT_PAGE) + ELEMENT_PAGE);
      this.render();
      return;
    }
    const isolateModel = event.target.closest('[data-isolate-model]');
    if (isolateModel) return this.actions.isolateModel(isolateModel.dataset.isolateModel);
    const removeModel = event.target.closest('[data-remove-model]');
    if (removeModel) return this.actions.removeModel(removeModel.dataset.removeModel);
    const elementButton = event.target.closest('[data-element]');
    if (elementButton) {
      const row = this.engine.bimIndex.byKey.get(elementButton.closest('[data-key]').dataset.key);
      if (row) await this.actions.select([row], { zoom: true, additive: event.ctrlKey || event.metaKey });
      return;
    }
    const node = event.target.closest('[data-node]');
    if (!node) return;
    const key = node.dataset.node;
    const rows = this.nodes.get(key) || [];
    if (event.target.closest('[data-toggle]')) {
      if (this.expanded.has(key)) this.expanded.delete(key); else this.expanded.add(key);
      this.render();
    } else if (event.target.closest('[data-select]')) {
      await this.actions.select(rows, { zoom: true });
    } else if (event.target.closest('[data-isolate]')) {
      await this.actions.isolate(rows);
    } else if (event.target.closest('[data-plan]')) {
      await this.actions.plan(rows, key.split('|').pop());
    } else if (event.target.closest('[data-visibility]')) {
      const hide = !this.hidden.has(key);
      if (hide) this.hidden.add(key); else this.hidden.delete(key);
      await this.actions.setVisible(rows, !hide);
      this.render();
    }
  }

  onChange(event) {
    const modelToggle = event.target.closest('[data-model]');
    if (modelToggle) void this.actions.setModelVisible(modelToggle.dataset.model, modelToggle.checked);
  }
}
