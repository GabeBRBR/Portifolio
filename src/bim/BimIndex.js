import { classFamily } from './geometry-metrics.js';
import { classLabel, familyLabel, fold, QUANTITIES, typeLabel } from './labels.js';

const NO_STOREY = 'Sem pavimento';
const NO_MATERIAL = 'Sem material';
const NO_SYSTEM = 'Sem sistema';

/** Dimensions available for grouping, filtering and colouring. */
export const DIMENSIONS = {
  discipline: { label: 'Disciplina', value: (row) => row.discipline },
  storey: { label: 'Pavimento', value: (row) => row.storey },
  classLabel: { label: 'Categoria', value: (row) => row.classLabel },
  type: { label: 'Tipo', value: (row) => row.typeName },
  material: { label: 'Material', value: (row) => row.material },
  system: { label: 'Sistema', value: (row) => row.systemType },
  diameter: { label: 'Ø equivalente', value: (row) => (row.q.diameter ? `Ø ${Math.round(row.q.diameter * 1000)} mm` : 'Sem diâmetro') }
};

/**
 * Federated, in-memory view of the BIM indexes of every loaded model.
 * Rows are flat, display-ready records keyed by `${modelId}:${localId}`.
 */
export class BimIndex {
  constructor() {
    this.models = new Map();
    this.rows = [];
    this.byKey = new Map();
    this.listeners = new Set();
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    this.listeners.forEach((listener) => listener(this));
  }

  /**
   * @param {string} modelId Fragments model id
   * @param {{discipline:string, name?:string}} record
   * @param {object} index BIM index (see ifc-index-builder.js)
   * @param {(number|null)[]} localIds Fragments local id of each index element, same order
   */
  addModel(modelId, record, index, localIds) {
    const storeys = index.storeys || [];
    const rows = [];
    index.elements.forEach((element, position) => {
      const localId = localIds[position];
      if (localId === null || localId === undefined) return;
      const storey = element.storey !== undefined ? storeys[element.storey] : null;
      const materials = element.materials || [];
      const row = {
        key: `${modelId}:${localId}`,
        modelId,
        localId,
        expressId: element.id,
        guid: element.guid || null,
        cls: element.cls,
        family: classFamily(element.cls),
        classLabel: classLabel(element.cls),
        name: element.name || null,
        type: element.type || null,
        typeName: typeLabel(element.type),
        typeFamily: familyLabel(element.type),
        tag: element.tag || null,
        ptype: element.ptype || null,
        discipline: record.discipline,
        storey: storey?.name || NO_STOREY,
        storeyElevation: storey?.elevation ?? null,
        materials,
        material: materials.length ? materials.join(' + ') : NO_MATERIAL,
        systems: element.systems || [],
        system: element.systems?.[0] || NO_SYSTEM,
        systemType: element.systemTypes?.[0] || element.systems?.[0]?.replace(/\s+\d+$/, '') || NO_SYSTEM,
        q: element.q || {},
        ifcq: new Set(element.ifcq || []),
        props: element.p || {},
        box: element.box || null
      };
      row.search = fold([row.name, row.type, row.classLabel, row.cls, row.guid, row.tag, row.storey, row.material, row.system, row.discipline].filter(Boolean).join(' '));
      rows.push(row);
    });
    this.removeModel(modelId, { silent: true });
    this.models.set(modelId, { modelId, record, index, rows });
    this.rebuild();
  }

  removeModel(modelId, { silent = false } = {}) {
    if (!this.models.delete(modelId)) return;
    this.rebuild(silent);
  }

  clear() {
    this.models.clear();
    this.rebuild();
  }

  rebuild(silent = false) {
    this.rows = [...this.models.values()].flatMap((entry) => entry.rows);
    this.byKey = new Map(this.rows.map((row) => [row.key, row]));
    if (!silent) this.emit();
  }

  get size() {
    return this.rows.length;
  }

  hasModel(modelId) {
    return this.models.has(modelId);
  }

  get(modelId, localId) {
    return this.byKey.get(`${modelId}:${localId}`) || null;
  }

  /** Rows of a Fragments ModelIdMap ({ modelId: Set|Array<localId> }). */
  rowsFromMap(map) {
    const rows = [];
    Object.entries(map || {}).forEach(([modelId, ids]) => {
      for (const localId of ids) {
        const row = this.get(modelId, localId);
        if (row) rows.push(row);
      }
    });
    return rows;
  }

  /** Fragments ModelIdMap of the given rows. */
  static toMap(rows) {
    const map = {};
    rows.forEach((row) => {
      (map[row.modelId] ??= new Set()).add(row.localId);
    });
    return map;
  }

  /** Storeys of the federation, merged by name, ordered by elevation. */
  storeys() {
    const merged = new Map();
    this.rows.forEach((row) => {
      const current = merged.get(row.storey);
      if (!current) merged.set(row.storey, { name: row.storey, elevation: row.storeyElevation, count: 1 });
      else current.count += 1;
    });
    return [...merged.values()].sort((a, b) => {
      if (a.name === NO_STOREY) return 1;
      if (b.name === NO_STOREY) return -1;
      return (a.elevation ?? 0) - (b.elevation ?? 0) || a.name.localeCompare(b.name, 'pt-BR');
    });
  }

  filter({ query = '', disciplines = null, storeys = null, classes = null, rows = this.rows } = {}) {
    const needle = fold(query.trim());
    return rows.filter((row) => (!needle || row.search.includes(needle))
      && (!disciplines || disciplines.has(row.discipline))
      && (!storeys || storeys.has(row.storey))
      && (!classes || classes.has(row.classLabel)));
  }

  /**
   * Groups rows by one or two dimensions and sums their quantities.
   * Quantities flagged as non-additive (height, thickness...) are averaged.
   */
  static group(rows, dimension, subDimension = null) {
    const get = DIMENSIONS[dimension]?.value || ((row) => row[dimension]);
    const groups = new Map();
    rows.forEach((row) => {
      const key = get(row) ?? '—';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    const result = [...groups.entries()].map(([key, groupRows]) => ({
      key,
      rows: groupRows,
      totals: BimIndex.totals(groupRows),
      children: subDimension ? BimIndex.group(groupRows, subDimension) : null
    }));
    result.sort((a, b) => b.rows.length - a.rows.length || String(a.key).localeCompare(String(b.key), 'pt-BR'));
    if (dimension === 'storey') {
      const order = new Map();
      rows.forEach((row) => order.set(row.storey, row.storeyElevation ?? Infinity));
      result.sort((a, b) => (order.get(a.key) ?? Infinity) - (order.get(b.key) ?? Infinity));
    }
    return result;
  }

  /**
   * Bounding box of rows from the index (scene coordinates), ignoring stray
   * elements far from the rest: anything whose centre lies outside the
   * 2nd–98th percentile band (plus a 3 m margin) on any axis.
   * @returns {{min:number[], max:number[]}|null}
   */
  static boxOf(rows) {
    const boxes = rows.map((row) => row.box).filter((box) => Array.isArray(box) && box.length === 6);
    if (!boxes.length) return null;
    let kept = boxes;
    if (boxes.length >= 20) {
      const limits = [0, 1, 2].map((axis) => {
        const centres = boxes.map((box) => (box[axis] + box[axis + 3]) / 2).sort((a, b) => a - b);
        const low = centres[Math.floor(centres.length * 0.02)];
        const high = centres[Math.min(centres.length - 1, Math.ceil(centres.length * 0.98))];
        return [low - 3, high + 3];
      });
      kept = boxes.filter((box) => limits.every(([low, high], axis) => {
        const centre = (box[axis] + box[axis + 3]) / 2;
        return centre >= low && centre <= high;
      }));
    }
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    kept.forEach((box) => {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], box[axis]);
        max[axis] = Math.max(max[axis], box[axis + 3]);
      }
    });
    return { min, max };
  }

  static totals(rows) {
    const totals = { count: rows.length };
    QUANTITIES.forEach(({ key, sum }) => {
      let total = 0;
      let counted = 0;
      let measured = 0;
      rows.forEach((row) => {
        const value = row.q[key];
        if (value === undefined || value === null) return;
        total += value;
        counted += 1;
        if (row.ifcq.has(key)) measured += 1;
      });
      if (!counted) return;
      totals[key] = sum ? total : total / counted;
      totals[`${key}Count`] = counted;
      totals[`${key}FromIfc`] = measured;
    });
    return totals;
  }
}
