import { BimIndex } from '../bim/BimIndex.js';
import { DISCIPLINE_COLORS, escapeHtml, formatCount, formatNumber, formatQuantity } from '../bim/labels.js';

const BAR_LIMIT = 8;
const CONCRETE = /concreto|concrete|bet[aã]o/i;

/**
 * Project dashboard: headline figures, distributions by storey, type and
 * diameter, room areas and data-quality checks. Every bar and check selects
 * its elements in the model.
 */
export class OverviewView {
  constructor(root, { engine, actions }) {
    this.root = root;
    this.engine = engine;
    this.actions = actions;
    this.sets = new Map();
    this.root.addEventListener('click', (event) => {
      const target = event.target.closest('[data-set]');
      if (!target) return;
      const rows = this.sets.get(target.dataset.set) || [];
      if (rows.length) void this.actions.showInModel(rows);
    });
  }

  register(rows) {
    const id = `s${this.sets.size}`;
    this.sets.set(id, rows);
    return id;
  }

  render() {
    const index = this.engine.bimIndex;
    this.sets.clear();
    if (!index.size) {
      this.root.innerHTML = '<div class="bim-empty bim-empty--page"><h2>Visão geral indisponível</h2><p>Abra um dos exemplos ou um IFC para ver os números do projeto.</p></div>';
      return;
    }
    const rows = index.rows;
    const disciplines = BimIndex.group(rows, 'discipline');
    const storeys = index.storeys().filter((storey) => storey.name !== 'Sem pavimento');
    const concrete = rows.filter((row) => row.q.volume && row.materials.some((material) => CONCRETE.test(material)));
    const walls = rows.filter((row) => row.family === 'wall' && row.q.area);
    const segments = rows.filter((row) => row.family === 'segment' && row.q.length);
    const spaces = rows.filter((row) => row.family === 'space' && row.q.area);
    const sum = (list, key) => list.reduce((total, row) => total + (row.q[key] || 0), 0);

    const kpis = [
      { label: 'Elementos', value: formatCount(rows.length), detail: `${disciplines.length} disciplina${disciplines.length === 1 ? '' : 's'}, ${storeys.length} pavimento${storeys.length === 1 ? '' : 's'}`, set: rows },
      concrete.length ? { label: 'Concreto', value: formatQuantity('volume', sum(concrete, 'volume'), { withUnit: false }), unit: 'm³', detail: `${formatCount(concrete.length)} elementos com material de concreto`, set: concrete } : null,
      walls.length ? { label: 'Paredes', value: formatQuantity('area', sum(walls, 'area'), { withUnit: false }), unit: 'm²', detail: `área líquida de ${formatCount(walls.length)} paredes`, set: walls } : null,
      segments.length ? { label: 'Tubos e eletrodutos', value: formatNumber(sum(segments, 'length'), 1), unit: 'm', detail: `${formatCount(segments.length)} segmentos`, set: segments } : null,
      spaces.length ? { label: 'Ambientes', value: formatQuantity('area', sum(spaces, 'area'), { withUnit: false }), unit: 'm²', detail: `${formatCount(spaces.length)} ambientes`, set: spaces } : null
    ].filter(Boolean);

    const volumeByStorey = BimIndex.group(rows.filter((row) => row.q.volume && row.family !== 'space' && row.cls !== 'IFCGEOGRAPHICELEMENT'), 'storey')
      .map((group) => ({ label: group.key, value: group.totals.volume || 0, rows: group.rows }));
    const wallTypes = BimIndex.group(walls, 'type').map((group) => ({ label: group.key, value: group.totals.area || 0, rows: group.rows }));
    const diameters = BimIndex.group(segments, 'diameter')
      .map((group) => ({ label: group.key, value: group.totals.length || 0, rows: group.rows }))
      .sort((a, b) => b.value - a.value);
    const disciplineBars = disciplines.map((group) => ({ label: group.key, value: group.rows.length, rows: group.rows, color: DISCIPLINE_COLORS[group.key] }));

    const total = rows.length;
    const missingStorey = rows.filter((row) => row.storey === 'Sem pavimento');
    const missingMaterial = rows.filter((row) => !row.materials.length && !['segment', 'fitting', 'terminal', 'space'].includes(row.family));
    const proxies = rows.filter((row) => row.cls === 'IFCBUILDINGELEMENTPROXY');
    const missingType = rows.filter((row) => !row.type);
    const fromIfc = rows.filter((row) => ['volume', 'area'].some((key) => row.ifcq.has(key)));
    const fromIfcKeys = new Set(fromIfc.map((row) => row.key));
    const checks = [
      { label: 'Elementos com pavimento', ok: total - missingStorey.length, issue: missingStorey, hint: 'Sem pavimento, o elemento não aparece nos quantitativos por andar.' },
      { label: 'Elementos com tipo definido', ok: total - missingType.length, issue: missingType, hint: 'O tipo agrupa os quantitativos; elementos sem tipo ficam em “Sem tipo”.' },
      { label: 'Elementos construtivos com material', ok: total - missingMaterial.length, issue: missingMaterial, hint: 'Instalações e ambientes não entram nesta verificação.' },
      { label: 'Classificados em categoria IFC própria', ok: total - proxies.length, issue: proxies, hint: '“Elemento genérico” (IfcBuildingElementProxy) dificulta filtros e orçamentos.' },
      { label: 'Área ou volume vindos do IFC', ok: fromIfc.length, issue: rows.filter((row) => !fromIfcKeys.has(row.key)), hint: 'Exporte do Revit com “Exportar quantidades base” para usar os valores oficiais em vez da medição geométrica.', soft: true }
    ];

    this.root.innerHTML = `
      <header class="bim-page-head">
        <div>
          <h2>Visão geral</h2>
          <p>${escapeHtml(this.actions.projectLabel())}. Clique em qualquer número, barra ou verificação para ver os elementos no modelo.</p>
        </div>
      </header>
      <div class="bim-kpis">${kpis.map((kpi) => `
        <button type="button" class="bim-kpi" data-set="${this.register(kpi.set)}">
          <span class="bim-kpi__label">${escapeHtml(kpi.label)}</span>
          <span class="bim-kpi__value">${kpi.value}${kpi.unit ? `<small>${kpi.unit}</small>` : ''}</span>
          <span class="bim-kpi__detail">${escapeHtml(kpi.detail)}</span>
        </button>`).join('')}</div>
      <div class="bim-dash">
        ${this.barChart('Elementos por disciplina', 'unidades', disciplineBars, (value) => formatCount(value))}
        ${volumeByStorey.length ? this.barChart('Volume por pavimento', 'm³', volumeByStorey, (value) => formatNumber(value, 2), { keepOrder: true }) : ''}
        ${wallTypes.length ? this.barChart('Paredes por tipo', 'm² de área líquida', wallTypes, (value) => formatNumber(value, 2)) : ''}
        ${diameters.length ? this.barChart('Tubos e eletrodutos por diâmetro', 'm de comprimento', diameters, (value) => formatNumber(value, 1)) : ''}
        ${spaces.length ? this.spacesTable(spaces) : ''}
        ${this.qualityCard(checks, total)}
      </div>`;
  }

  barChart(title, unit, items, format, { keepOrder = false } = {}) {
    let list = keepOrder ? items : [...items].sort((a, b) => b.value - a.value);
    if (list.length > BAR_LIMIT) {
      const rest = list.slice(BAR_LIMIT - 1);
      list = [...list.slice(0, BAR_LIMIT - 1), { label: `Outros (${rest.length})`, value: rest.reduce((total, item) => total + item.value, 0), rows: rest.flatMap((item) => item.rows), other: true }];
    }
    const max = Math.max(...list.map((item) => item.value), 1e-9);
    return `<section class="bim-card">
      <h3>${escapeHtml(title)}</h3><p class="bim-card__unit">${escapeHtml(unit)}</p>
      <ul class="bim-bars">${list.map((item) => `
        <li><button type="button" data-set="${this.register(item.rows)}" title="${escapeHtml(item.label)}: ${format(item.value)} ${escapeHtml(unit)}">
          <span class="bim-bars__label">${item.color ? `<span class="bim-dot" style="--dot:${item.color}"></span>` : ''}${escapeHtml(item.label)}</span>
          <span class="bim-bars__track"><span class="bim-bars__fill${item.other ? ' bim-bars__fill--other' : ''}" style="width:${Math.max(1.5, (item.value / max) * 100).toFixed(2)}%"></span></span>
          <span class="bim-bars__value">${format(item.value)}</span>
        </button></li>`).join('')}</ul>
    </section>`;
  }

  spacesTable(spaces) {
    const sorted = [...spaces].sort((a, b) => (b.q.area || 0) - (a.q.area || 0));
    return `<section class="bim-card bim-card--wide">
      <h3>Ambientes</h3><p class="bim-card__unit">área de piso e pé-direito medidos no modelo</p>
      <table class="bim-table bim-table--compact">
        <thead><tr><th scope="col">Ambiente</th><th scope="col">Pavimento</th><th scope="col" class="bim-num">Área <small>m²</small></th><th scope="col" class="bim-num">Altura <small>m</small></th></tr></thead>
        <tbody>${sorted.map((row) => `<tr data-set="${this.register([row])}"><th scope="row">${escapeHtml(row.props.Reference || row.name || 'Ambiente')}${row.name && row.props.Reference ? ` <small>${escapeHtml(row.name)}</small>` : ''}</th><td>${escapeHtml(row.storey)}</td><td class="bim-num">${formatNumber(row.q.area, 2)}</td><td class="bim-num">${formatNumber(row.q.height, 2)}</td></tr>`).join('')}</tbody>
      </table>
    </section>`;
  }

  qualityCard(checks, total) {
    return `<section class="bim-card bim-card--wide">
      <h3>Qualidade dos dados</h3><p class="bim-card__unit">o quanto o IFC sustenta quantitativos e filtros confiáveis</p>
      <ul class="bim-checks">${checks.map((check) => {
        const share = total ? check.ok / total : 0;
        const state = share >= 0.98 ? 'good' : check.soft || share >= 0.8 ? 'warn' : 'bad';
        const icon = state === 'good' ? 'ph-check-circle' : state === 'warn' ? 'ph-warning-circle' : 'ph-x-circle';
        const stateLabel = state === 'good' ? 'Adequado' : state === 'warn' ? 'Atenção' : 'Revisar';
        return `<li class="bim-check-row bim-check-row--${state}">
          <i class="ph-fill ${icon}" aria-hidden="true"></i>
          <div><strong>${escapeHtml(check.label)}</strong><span>${escapeHtml(check.hint)}</span></div>
          <span class="bim-check-row__value"><b>${formatNumber(share * 100, 0)}%</b><small>${stateLabel}</small></span>
          ${check.issue.length && check.issue.length < total ? `<button type="button" class="bim-link-button" data-set="${this.register(check.issue)}">Ver ${formatCount(check.issue.length)}</button>` : '<span></span>'}
        </li>`;
      }).join('')}</ul>
    </section>`;
  }
}
