import { BimIndex } from '../bim/BimIndex.js';
import { DISCIPLINE_COLORS, escapeHtml, fold, formatCount, formatNumber, formatQuantity, QUANTITY_BY_KEY } from '../bim/labels.js';

/** Quantities shown first for each kind of element, in reading order. */
const HEADLINE = {
  wall: ['area', 'volume', 'length', 'height', 'thickness'],
  slab: ['area', 'volume', 'thickness', 'length', 'width'],
  column: ['volume', 'height', 'width', 'depth'],
  beam: ['volume', 'length', 'width', 'height'],
  footing: ['volume', 'length', 'width', 'height'],
  stair: ['volume', 'area', 'length', 'height'],
  opening: ['width', 'height', 'area'],
  segment: ['length', 'diameter', 'volume'],
  fitting: ['volume', 'height'],
  terminal: ['height', 'width', 'volume'],
  space: ['area', 'height', 'volume'],
  furniture: ['length', 'width', 'height'],
  other: ['volume', 'area', 'length', 'width', 'height']
};

const MULTI_LIST_LIMIT = 60;

/**
 * Right-hand panel: data of the selected element(s). One element shows its
 * identity, headline quantities, relations and full IFC property sets; several
 * elements show their summed quantities and composition.
 */
export class ElementSheet {
  constructor(root, { engine, actions }) {
    this.root = root;
    this.engine = engine;
    this.actions = actions;
    this.rows = [];
    this.propertyQuery = '';
    this.renderToken = 0;
    root.addEventListener('click', (event) => this.onClick(event));
    root.addEventListener('input', (event) => {
      if (event.target.matches('[data-role="prop-search"]')) {
        this.propertyQuery = event.target.value;
        this.filterProperties();
      }
    });
  }

  render(rows) {
    this.rows = rows;
    this.renderToken += 1;
    if (!rows.length) return this.renderEmpty();
    if (rows.length === 1) return this.renderSingle(rows[0]);
    return this.renderMany(rows);
  }

  renderEmpty() {
    const index = this.engine.bimIndex;
    this.root.innerHTML = `
      <div class="bim-sheet__empty">
        <i class="ph ph-cursor-click" aria-hidden="true"></i>
        <h2>Nenhum elemento selecionado</h2>
        <p>Clique em um elemento no modelo ou escolha um item no navegador. Use <kbd>Ctrl</kbd> + clique para somar vários elementos.</p>
        ${index.size ? `<p class="bim-sheet__hint">${formatCount(index.size)} elementos com dados disponíveis neste projeto.</p>` : ''}
      </div>`;
  }

  quantityCells(row) {
    const order = HEADLINE[row.family] || HEADLINE.other;
    const keys = [...order.filter((key) => row.q[key] !== undefined), ...Object.keys(row.q).filter((key) => !order.includes(key) && key !== 'surface' && QUANTITY_BY_KEY[key])];
    return keys.map((key, position) => {
      const meta = QUANTITY_BY_KEY[key];
      const fromIfc = row.ifcq.has(key);
      return `<div class="bim-qty${position < 2 ? ' bim-qty--lead' : ''}">
        <dt>${escapeHtml(meta.label)}</dt>
        <dd><span class="bim-qty__value">${formatQuantity(key, row.q[key], { withUnit: false })}</span><span class="bim-qty__unit">${meta.unit}</span></dd>
        <span class="bim-qty__source" title="${fromIfc ? 'Valor exportado no IFC' : 'Medido na geometria 3D do elemento'}">${fromIfc ? 'IFC' : 'medido'}</span>
      </div>`;
    }).join('');
  }

  renderSingle(row) {
    const color = DISCIPLINE_COLORS[row.discipline] || '#8d8a82';
    const storeyText = row.storeyElevation !== null && row.storeyElevation !== undefined
      ? `${escapeHtml(row.storey)} <small>(${formatNumber(row.storeyElevation, 2)} m)</small>`
      : escapeHtml(row.storey);
    const props = row.props || {};
    const flags = [];
    if (props.LoadBearing === true) flags.push('Estrutural');
    if (props.IsExternal === true) flags.push('Externo');
    if (props.IsExternal === false) flags.push('Interno');
    const facts = [
      ['Pavimento', storeyText],
      ['Tipo', escapeHtml(row.typeName) + (row.typeFamily ? `<small>${escapeHtml(row.typeFamily)}</small>` : '')],
      ['Materiais', row.materials.length ? row.materials.map((material) => `<span class="bim-tag">${escapeHtml(material)}</span>`).join('') : '<span class="bim-muted">Não informado no IFC</span>'],
      row.systems.length ? ['Sistema', row.systems.map((system) => escapeHtml(system)).join('<br>')] : null,
      props.Reference && props.Reference !== row.typeName ? ['Referência', escapeHtml(props.Reference)] : null,
      flags.length ? ['Função', flags.join(', ')] : null,
      ['Classe IFC', `${escapeHtml(row.cls)}${row.ptype ? ` <small>${escapeHtml(row.ptype)}</small>` : ''}`],
      row.tag ? ['Marca (Tag)', escapeHtml(row.tag)] : null,
      ['GlobalId', `<code>${escapeHtml(row.guid || '—')}</code>`]
    ].filter(Boolean);
    const anyGeometric = [...Object.keys(row.q)].some((key) => !row.ifcq.has(key));
    this.root.innerHTML = `
      <header class="bim-sheet__head">
        <p class="bim-sheet__kind"><span class="bim-dot" style="--dot:${color}"></span>${escapeHtml(row.classLabel)} <span>${escapeHtml(row.discipline)}</span></p>
        <h2 class="bim-sheet__title">${escapeHtml(row.name || row.typeName)}</h2>
      </header>
      <div class="bim-sheet__actions">
        <button type="button" class="bim-chip-button" data-act="fit"><i class="ph ph-crosshair"></i>Enquadrar</button>
        <button type="button" class="bim-chip-button" data-act="isolate"><i class="ph ph-selection"></i>Isolar</button>
        <button type="button" class="bim-chip-button" data-act="hide"><i class="ph ph-eye-slash"></i>Ocultar</button>
        <button type="button" class="bim-chip-button" data-act="same-type"><i class="ph ph-copy-simple"></i>Mesmo tipo</button>
      </div>
      ${Object.keys(row.q).length ? `<dl class="bim-qty-grid">${this.quantityCells(row)}</dl>` : '<p class="bim-muted bim-sheet__noq">Este elemento não tem geometria mensurável.</p>'}
      ${anyGeometric ? '<p class="bim-sheet__source-note">“medido” = calculado a partir da geometria 3D. Exporte o IFC com quantidades base para usar os valores do Revit.</p>' : ''}
      <dl class="bim-facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
      <button type="button" class="bim-link-button bim-sheet__copy" data-act="copy-guid"><i class="ph ph-copy"></i> Copiar GlobalId</button>
      <section class="bim-props" aria-label="Propriedades IFC">
        <div class="bim-props__head">
          <h3>Propriedades IFC</h3>
          <input type="search" data-role="prop-search" placeholder="Filtrar propriedades" aria-label="Filtrar propriedades" value="${escapeHtml(this.propertyQuery)}">
        </div>
        <div class="bim-props__body" data-role="props"><p class="bim-muted">Carregando propriedades…</p></div>
      </section>`;
    void this.loadProperties(row, this.renderToken);
  }

  async loadProperties(row, token) {
    const target = () => this.root.querySelector('[data-role="props"]');
    try {
      const data = await this.engine.getItemProperties(row.modelId, row.localId);
      if (token !== this.renderToken || !target()) return;
      if (!data) {
        target().innerHTML = '<p class="bim-muted">Sem propriedades adicionais.</p>';
        return;
      }
      const groups = [{ title: 'Atributos', rows: data.attributes }, ...data.sets];
      target().innerHTML = groups.filter((group) => Object.keys(group.rows).length).map((group, index) => `
        <details class="bim-props__group" ${index < 2 ? 'open' : ''}>
          <summary>${escapeHtml(group.title)} <span>${Object.keys(group.rows).length}</span></summary>
          <dl>${Object.entries(group.rows).map(([key, value]) => `<div class="bim-props__row"><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(this.formatValue(value))}</dd></div>`).join('')}</dl>
        </details>`).join('') || '<p class="bim-muted">Sem propriedades adicionais.</p>';
      this.filterProperties();
    } catch (error) {
      if (token === this.renderToken && target()) target().innerHTML = `<p class="bim-muted">Não foi possível ler as propriedades: ${escapeHtml(error.message)}</p>`;
    }
  }

  formatValue(value) {
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : formatNumber(value, Math.abs(value) < 1 ? 4 : 3);
    return String(value);
  }

  filterProperties() {
    const query = fold(this.propertyQuery.trim());
    this.root.querySelectorAll('.bim-props__row').forEach((row) => {
      row.hidden = Boolean(query) && !fold(row.textContent).includes(query);
    });
    this.root.querySelectorAll('.bim-props__group').forEach((group) => {
      const visible = group.querySelectorAll('.bim-props__row:not([hidden])').length;
      group.hidden = Boolean(query) && !visible;
      if (query && visible) group.open = true;
    });
  }

  renderMany(rows) {
    const totals = BimIndex.totals(rows);
    const byCategory = BimIndex.group(rows, 'classLabel');
    const sums = ['volume', 'area', 'length'].filter((key) => totals[key]);
    this.root.innerHTML = `
      <header class="bim-sheet__head">
        <p class="bim-sheet__kind">Seleção múltipla</p>
        <h2 class="bim-sheet__title">${formatCount(rows.length)} elementos</h2>
      </header>
      <div class="bim-sheet__actions">
        <button type="button" class="bim-chip-button" data-act="fit"><i class="ph ph-crosshair"></i>Enquadrar</button>
        <button type="button" class="bim-chip-button" data-act="isolate"><i class="ph ph-selection"></i>Isolar</button>
        <button type="button" class="bim-chip-button" data-act="hide"><i class="ph ph-eye-slash"></i>Ocultar</button>
        <button type="button" class="bim-chip-button" data-act="export"><i class="ph ph-file-xls"></i>Exportar</button>
      </div>
      ${sums.length ? `<dl class="bim-qty-grid">${sums.map((key, position) => `
        <div class="bim-qty${position < 2 ? ' bim-qty--lead' : ''}">
          <dt>${QUANTITY_BY_KEY[key].label} total</dt>
          <dd><span class="bim-qty__value">${formatQuantity(key, totals[key], { withUnit: false })}</span><span class="bim-qty__unit">${QUANTITY_BY_KEY[key].unit}</span></dd>
          <span class="bim-qty__source">${formatCount(totals[`${key}Count`])} de ${formatCount(rows.length)}</span>
        </div>`).join('')}</dl>` : ''}
      <section class="bim-sheet__composition">
        <h3>Composição</h3>
        <ul>${byCategory.map((group) => `<li><span>${escapeHtml(group.key)}</span><b>${formatCount(group.rows.length)}</b></li>`).join('')}</ul>
      </section>
      <section class="bim-sheet__list">
        <h3>Elementos</h3>
        <ul>${rows.slice(0, MULTI_LIST_LIMIT).map((row) => `<li><button type="button" data-key="${escapeHtml(row.key)}"><span>${escapeHtml(row.name || row.typeName)}</span><small>${escapeHtml(row.classLabel)}, ${escapeHtml(row.storey)}</small></button></li>`).join('')}</ul>
        ${rows.length > MULTI_LIST_LIMIT ? `<p class="bim-muted">e mais ${formatCount(rows.length - MULTI_LIST_LIMIT)} elementos. Exporte para ver a lista completa.</p>` : ''}
      </section>`;
  }

  onClick(event) {
    const keyButton = event.target.closest('[data-key]');
    if (keyButton) {
      const row = this.engine.bimIndex.byKey.get(keyButton.dataset.key);
      if (row) void this.actions.select([row], { zoom: true });
      return;
    }
    const action = event.target.closest('[data-act]')?.dataset.act;
    if (!action || !this.rows.length) return;
    const rows = this.rows;
    if (action === 'fit') void this.engine.fitToMap(BimIndex.toMap(rows), BimIndex.boxOf(rows));
    else if (action === 'isolate') void this.actions.isolate(rows);
    else if (action === 'hide') void this.actions.hide(rows);
    else if (action === 'export') this.actions.exportRows(rows, 'selecao');
    else if (action === 'same-type') {
      const [row] = rows;
      const same = this.engine.bimIndex.rows.filter((candidate) => candidate.type === row.type && candidate.cls === row.cls);
      void this.actions.select(same, { zoom: false });
    } else if (action === 'copy-guid') {
      const guid = rows[0].guid;
      if (!guid) return;
      navigator.clipboard?.writeText(guid).then(
        () => this.actions.status('GlobalId copiado.'),
        () => this.actions.status(`GlobalId: ${guid}`)
      );
    }
  }
}
