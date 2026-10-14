import { BimIndex, DIMENSIONS } from '../bim/BimIndex.js';
import { escapeHtml, formatCount, formatQuantity } from '../bim/labels.js';

const GROUPABLE = ['classLabel', 'type', 'storey', 'material', 'discipline', 'system', 'diameter'];
const COLUMNS = [
  { key: 'count', label: 'Qtd.', unit: 'un' },
  { key: 'length', label: 'Comprimento', unit: 'm' },
  { key: 'area', label: 'Área', unit: 'm²' },
  { key: 'volume', label: 'Volume', unit: 'm³' }
];

/** Rows for spreadsheet export: one line per element with every quantity. */
export function elementSheetRows(rows) {
  const header = ['GlobalId', 'Disciplina', 'Pavimento', 'Elevação do pavimento (m)', 'Categoria', 'Classe IFC', 'Família', 'Tipo', 'Nome', 'Marca', 'Materiais', 'Sistema',
    'Comprimento (m)', 'Área (m²)', 'Volume (m³)', 'Altura (m)', 'Largura (m)', 'Espessura (m)', 'Ø equivalente (mm)', 'Origem das quantidades'];
  const round = (value, digits) => (value === undefined || value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits);
  return [header, ...rows.map((row) => [
    row.guid, row.discipline, row.storey, row.storeyElevation, row.classLabel, row.cls, row.typeFamily, row.typeName, row.name, row.tag,
    row.materials.join(' + '), row.systems.join(', '),
    round(row.q.length, 3), round(row.q.area, 3), round(row.q.volume, 4), round(row.q.height, 3), round(row.q.width, 3), round(row.q.thickness, 3),
    row.q.diameter ? Math.round(row.q.diameter * 1000) : null,
    row.ifcq.size ? `IFC: ${[...row.ifcq].join(', ')}; demais medidas da geometria` : 'Geometria 3D'
  ])];
}

/**
 * Quantity takeoff: groups the federated index by one or two dimensions,
 * sums counts, lengths, areas and volumes, and exports to Excel/CSV.
 * Clicking a row selects its elements in the 3D view beside the table.
 */
export class TakeoffView {
  constructor(root, { engine, actions }) {
    this.root = root;
    this.engine = engine;
    this.actions = actions;
    this.state = { group: 'classLabel', subgroup: 'type', discipline: '', storey: '', query: '' };
    this.expanded = new Set();
    this.groups = [];
    this.filtered = [];
    this.root.addEventListener('change', (event) => this.onChange(event));
    this.root.addEventListener('input', (event) => {
      if (!event.target.matches('[data-filter="query"]')) return;
      clearTimeout(this.queryTimer);
      this.queryTimer = setTimeout(() => { this.state.query = event.target.value; this.renderTable(); }, 160);
    });
    this.root.addEventListener('click', (event) => this.onClick(event));
  }

  render() {
    const index = this.engine.bimIndex;
    if (!index.size) {
      this.root.innerHTML = '<div class="bim-empty bim-empty--page"><h2>Sem dados para quantificar</h2><p>Abra um dos exemplos ou um IFC para gerar os quantitativos.</p></div>';
      return;
    }
    const disciplines = [...new Set(index.rows.map((row) => row.discipline))];
    const storeys = index.storeys();
    const option = (value, label, selected) => `<option value="${escapeHtml(value)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    this.root.innerHTML = `
      <header class="bim-page-head">
        <div>
          <h2>Quantitativos</h2>
          <p>Somatório por grupo dos elementos visíveis no índice BIM. Clique em uma linha para localizar os elementos no modelo.</p>
        </div>
        <div class="bim-page-head__actions">
          <button type="button" class="bim-button" data-export="xlsx"><i class="ph ph-file-xls"></i>Exportar Excel</button>
          <button type="button" class="bim-button bim-button--quiet" data-export="csv"><i class="ph ph-file-csv"></i>CSV</button>
        </div>
      </header>
      <div class="bim-filters" role="group" aria-label="Agrupamento e filtros">
        <label>Agrupar por<select class="bim-select" data-filter="group">${GROUPABLE.map((key) => option(key, DIMENSIONS[key].label, key === this.state.group)).join('')}</select></label>
        <label>Depois por<select class="bim-select" data-filter="subgroup">${option('', 'Sem subgrupo', !this.state.subgroup)}${GROUPABLE.map((key) => option(key, DIMENSIONS[key].label, key === this.state.subgroup)).join('')}</select></label>
        <label>Disciplina<select class="bim-select" data-filter="discipline">${option('', 'Todas', !this.state.discipline)}${disciplines.map((value) => option(value, value, value === this.state.discipline)).join('')}</select></label>
        <label>Pavimento<select class="bim-select" data-filter="storey">${option('', 'Todos', !this.state.storey)}${storeys.map((storey) => option(storey.name, storey.name, storey.name === this.state.storey)).join('')}</select></label>
        <label class="bim-filters__search">Buscar<input type="search" class="bim-input" data-filter="query" value="${escapeHtml(this.state.query)}" placeholder="Tipo, material, nome…"></label>
      </div>
      <div class="bim-table-wrap" data-role="table"></div>
      <p class="bim-note bim-takeoff__note">Comprimento, área e volume vêm das quantidades do IFC quando exportadas (Qto / BaseQuantities). Na falta delas, são medidos na geometria 3D de cada elemento: área de parede é líquida (vãos descontados) e Ø é o diâmetro equivalente do volume do tubo.</p>`;
    this.renderTable();
  }

  currentRows() {
    const { discipline, storey, query } = this.state;
    return this.engine.bimIndex.filter({
      query,
      disciplines: discipline ? new Set([discipline]) : null,
      storeys: storey ? new Set([storey]) : null
    });
  }

  renderTable() {
    const target = this.root.querySelector('[data-role="table"]');
    if (!target) return;
    this.filtered = this.currentRows();
    const subgroup = this.state.subgroup && this.state.subgroup !== this.state.group ? this.state.subgroup : null;
    this.groups = BimIndex.group(this.filtered, this.state.group, subgroup);
    this.rowMap = new Map();
    const totals = BimIndex.totals(this.filtered);
    const cells = (values) => COLUMNS.map(({ key }) => {
      if (key === 'count') return `<td class="bim-num">${formatCount(values.count)}</td>`;
      const value = values[key];
      if (value === undefined) return '<td class="bim-num bim-muted">—</td>';
      const partial = values[`${key}Count`] < values.count ? ` title="${formatCount(values[`${key}Count`])} de ${formatCount(values.count)} elementos têm esta medida"` : '';
      return `<td class="bim-num"${partial}>${formatQuantity(key, value, { withUnit: false })}${partial ? '<sup>*</sup>' : ''}</td>`;
    }).join('');
    const body = this.groups.map((group, groupIndex) => {
      const id = `g${groupIndex}`;
      this.rowMap.set(id, group.rows);
      const open = this.expanded.has(`${this.state.group}|${group.key}`);
      const children = open && group.children ? group.children.map((child, childIndex) => {
        const childId = `${id}-${childIndex}`;
        this.rowMap.set(childId, child.rows);
        return `<tr class="bim-takeoff__child" data-row="${childId}"><th scope="row"><span>${escapeHtml(child.key)}</span></th>${cells(child.totals)}</tr>`;
      }).join('') : '';
      return `<tr class="bim-takeoff__group${open ? ' is-open' : ''}" data-row="${id}" data-group-key="${escapeHtml(group.key)}">
        <th scope="row">${group.children ? `<button type="button" class="bim-node__toggle" data-expand aria-expanded="${open}" aria-label="${open ? 'Recolher' : 'Detalhar'} ${escapeHtml(group.key)}"><i class="ph ph-caret-right"></i></button>` : ''}<span>${escapeHtml(group.key)}</span></th>${cells(group.totals)}
      </tr>${children}`;
    }).join('');
    target.innerHTML = this.filtered.length ? `
      <table class="bim-table">
        <thead><tr><th scope="col">${escapeHtml(DIMENSIONS[this.state.group].label)}${subgroup ? ` / ${escapeHtml(DIMENSIONS[subgroup].label)}` : ''}</th>${COLUMNS.map((column) => `<th scope="col" class="bim-num">${column.label}<small>${column.unit}</small></th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><th scope="row">Total (${formatCount(this.groups.length)} grupos)</th>${cells(totals)}</tr></tfoot>
      </table>
      <p class="bim-note"><sup>*</sup> Nem todos os elementos do grupo têm essa medida (ex.: conexões não têm comprimento).</p>`
      : '<p class="bim-empty">Nenhum elemento atende a estes filtros.</p>';
  }

  onChange(event) {
    const filter = event.target.dataset.filter;
    if (!filter || filter === 'query') return;
    this.state[filter] = event.target.value;
    if (filter === 'group') this.expanded.clear();
    this.renderTable();
  }

  async onClick(event) {
    const exportButton = event.target.closest('[data-export]');
    if (exportButton) return this.export(exportButton.dataset.export);
    const row = event.target.closest('[data-row]');
    if (!row) return;
    if (event.target.closest('[data-expand]')) {
      const key = `${this.state.group}|${row.dataset.groupKey}`;
      if (this.expanded.has(key)) this.expanded.delete(key); else this.expanded.add(key);
      this.renderTable();
      return;
    }
    this.root.querySelectorAll('tr.is-active').forEach((active) => active.classList.remove('is-active'));
    row.classList.add('is-active');
    await this.actions.select(this.rowMap.get(row.dataset.row) || [], { zoom: true });
  }

  export(format) {
    const group = this.state.group;
    const subgroup = this.state.subgroup && this.state.subgroup !== group ? this.state.subgroup : null;
    const header = [DIMENSIONS[group].label, ...(subgroup ? [DIMENSIONS[subgroup].label] : []), 'Quantidade (un)', 'Comprimento (m)', 'Área (m²)', 'Volume (m³)'];
    const round = (value, digits) => (value === undefined ? null : Math.round(value * 10 ** digits) / 10 ** digits);
    const line = (keys, totals) => [...keys, totals.count, round(totals.length, 3), round(totals.area, 3), round(totals.volume, 4)];
    const summary = [header];
    this.groups.forEach((entry) => {
      if (subgroup && entry.children) entry.children.forEach((child) => summary.push(line([entry.key, child.key], child.totals)));
      else summary.push(line([entry.key, ...(subgroup ? [''] : [])], entry.totals));
    });
    this.actions.exportSheets([
      { name: 'Resumo', rows: summary, widths: [34, ...(subgroup ? [34] : []), 14, 16, 14, 14] },
      { name: 'Elementos', rows: elementSheetRows(this.filtered), widths: [24, 14, 26, 12, 22, 22, 24, 30, 36, 14, 34, 22, 14, 12, 12, 12, 12, 12, 14, 30] }
    ], `quantitativos-${group}`, format);
  }
}
