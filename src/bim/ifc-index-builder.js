import {
  IFCBUILDINGSTOREY, IFCRELAGGREGATES, IFCRELASSIGNSTOGROUP, IFCRELASSOCIATESMATERIAL,
  IFCRELCONTAINEDINSPATIALSTRUCTURE, IFCRELDEFINESBYPROPERTIES, IFCRELDEFINESBYTYPE, IFCRELNESTS, IFCSPACE, IFCUNITASSIGNMENT
} from 'web-ifc';
import { BIM_INDEX_VERSION } from './index-version.js';
import { addPlacedGeometry, classFamily, createMetricsAccumulator, deriveQuantities, finalizeMetrics } from './geometry-metrics.js';

/**
 * Builds the BIM index of one IFC model with web-ifc.
 *
 * The same function runs in Node (scripts/convert-ifc-to-fragments.mjs, for
 * the hosted examples) and in a Web Worker (for IFCs opened by the user), so
 * both paths produce exactly the same data.
 *
 * Index format (version 1):
 * {
 *   version, schema, units,
 *   storeys:  [{ id, guid, name, elevation }],           // sorted by elevation
 *   elements: [{ id, guid, cls, name, type, tag, ptype, storey, materials, systems,
 *                systemTypes, q: {volume, area, length, ...}, ifcq: [keys read from IFC],
 *                p: {Reference, IsExternal, ...}, box: [minX,minY,minZ,maxX,maxY,maxZ] }]
 *   Optional keys are omitted when empty; quantities not listed in `ifcq` were
 *   measured from the geometry.
 * }
 * `id` is the IFC express ID, which is also the Fragments local ID.
 */

export { BIM_INDEX_VERSION };

const T = {
  IFCRELCONTAINEDINSPATIALSTRUCTURE,
  IFCRELAGGREGATES,
  IFCRELNESTS,
  IFCRELDEFINESBYTYPE,
  IFCRELDEFINESBYPROPERTIES,
  IFCRELASSOCIATESMATERIAL,
  IFCRELASSIGNSTOGROUP,
  IFCBUILDINGSTOREY,
  IFCUNITASSIGNMENT
};

const SI_PREFIX = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9 };
const CONVERSION_UNITS = { FOOT: 0.3048, FEET: 0.3048, INCH: 0.0254, YARD: 0.9144, MILE: 1609.344 };

const KEPT_PROPERTIES = new Set(['reference', 'isexternal', 'loadbearing', 'firerating', 'acousticrating', 'thermaltransmittance', 'status', 'nominaldiameter', 'outsidediameter', 'manufacturer']);

const QUANTITY_ALIASES = [
  ['volume', ['netvolume', 'volume', 'grossvolume']],
  ['area', ['netsidearea', 'netfloorarea', 'netarea', 'area', 'grosssidearea', 'grossfloorarea', 'grossarea', 'netsurfacearea', 'crosssectionarea']],
  ['length', ['length', 'comprimento']],
  ['width', ['width', 'largura']],
  ['height', ['height', 'altura', 'unconnectedheight']],
  ['thickness', ['thickness', 'espessura', 'depth']],
  ['diameter', ['outsidediameter', 'nominaldiameter', 'diametro', 'diameter']],
  ['perimeter', ['perimeter', 'perimetro', 'grossperimeter', 'netperimeter']]
];
const QUANTITY_BY_NAME = new Map();
QUANTITY_ALIASES.forEach(([key, names]) => names.forEach((name, rank) => QUANTITY_BY_NAME.set(name, { key, rank })));

const fold = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Decodes the ISO 10303-21 string escapes that web-ifc may leave in place. */
export function decodeIfcString(text) {
  if (typeof text !== 'string' || !text.includes('\\')) return text;
  return text
    .replace(/\\X2\\((?:[0-9A-F]{4})+)\\X0\\/gi, (_, hex) => hex.match(/.{4}/g).map((code) => String.fromCharCode(parseInt(code, 16))).join(''))
    .replace(/\\X4\\((?:[0-9A-F]{8})+)\\X0\\/gi, (_, hex) => hex.match(/.{8}/g).map((code) => String.fromCodePoint(parseInt(code, 16))).join(''))
    .replace(/\\X\\([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\S\\(.)/g, (_, char) => String.fromCharCode(char.charCodeAt(0) + 128));
}

const plain = (value) => {
  let current = value;
  let guard = 0;
  while (current && typeof current === 'object' && 'value' in current && guard < 4) {
    current = current.value;
    guard += 1;
  }
  return typeof current === 'string' ? decodeIfcString(current) : current;
};
const refId = (value) => (value && typeof value === 'object' && typeof value.value === 'number' ? value.value : (typeof value === 'number' ? value : null));
const refList = (value) => (Array.isArray(value) ? value.map(refId).filter((id) => id !== null) : []);

function lineIds(api, modelID, type) {
  const vector = api.GetLineIDsWithType(modelID, type);
  const ids = [];
  for (let i = 0; i < vector.size(); i += 1) ids.push(vector.get(i));
  return ids;
}

function safeLine(api, modelID, id) {
  try {
    return api.GetLine(modelID, id, false);
  } catch {
    return null;
  }
}

function typeName(api, modelID, id) {
  try {
    return String(api.GetNameFromTypeCode(api.GetLineType(modelID, id)) || '').toUpperCase();
  } catch {
    return '';
  }
}

function readUnitScales(api, modelID) {
  const scales = { LENGTHUNIT: 1, AREAUNIT: null, VOLUMEUNIT: null };
  for (const id of lineIds(api, modelID, T.IFCUNITASSIGNMENT)) {
    const assignment = safeLine(api, modelID, id);
    for (const unitId of refList(assignment?.Units)) {
      const unit = safeLine(api, modelID, unitId);
      if (!unit) continue;
      const unitType = plain(unit.UnitType);
      if (!(unitType in scales)) continue;
      const kind = typeName(api, modelID, unitId);
      if (kind === 'IFCSIUNIT') {
        const prefix = SI_PREFIX[plain(unit.Prefix)] ?? 1;
        const power = unitType === 'AREAUNIT' ? 2 : unitType === 'VOLUMEUNIT' ? 3 : 1;
        scales[unitType] = prefix ** power;
      } else if (kind === 'IFCCONVERSIONBASEDUNIT') {
        const name = String(plain(unit.Name) || '').toUpperCase();
        const base = Object.entries(CONVERSION_UNITS).find(([key]) => name.includes(key))?.[1];
        if (base) {
          const power = unitType === 'AREAUNIT' ? 2 : unitType === 'VOLUMEUNIT' ? 3 : 1;
          scales[unitType] = base ** power;
        }
      }
    }
  }
  const length = scales.LENGTHUNIT || 1;
  return { length, area: scales.AREAUNIT ?? length ** 2, volume: scales.VOLUMEUNIT ?? length ** 3 };
}

/**
 * @param {import('web-ifc').IfcAPI} api initialised web-ifc API
 * @param {number} modelID model opened with api.OpenModel
 * @param {{ onProgress?: (fraction:number, label:string) => void }} options
 */
export function buildBimIndex(api, modelID, { onProgress } = {}) {
  const report = (fraction, label) => onProgress?.(Math.max(0, Math.min(1, fraction)), label);
  const units = readUnitScales(api, modelID);
  const schema = (() => { try { return api.GetModelSchema(modelID); } catch { return null; } })();

  // 1. Geometry: every product web-ifc can tessellate becomes an element.
  report(0.02, 'Medindo geometria');
  const accumulators = new Map();
  const collect = (flatMesh) => {
    const id = flatMesh.expressID;
    let acc = accumulators.get(id);
    if (!acc) {
      acc = createMetricsAccumulator();
      accumulators.set(id, acc);
    }
    const placed = flatMesh.geometries;
    for (let i = 0; i < placed.size(); i += 1) {
      const entry = placed.get(i);
      const geometry = api.GetGeometry(modelID, entry.geometryExpressID);
      try {
        const vertices = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
        const indices = api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());
        addPlacedGeometry(acc, vertices, indices, entry.flatTransformation);
      } finally {
        geometry.delete?.();
      }
    }
  };
  api.StreamAllMeshes(modelID, collect);
  // StreamAllMeshes skips IfcSpace; rooms are worth indexing for their areas.
  try { api.StreamAllMeshesWithTypes(modelID, [IFCSPACE], collect); } catch { /* optional */ }
  report(0.55, 'Lendo relações IFC');

  // 2. Spatial structure.
  const parentOf = new Map();
  for (const relType of [T.IFCRELAGGREGATES, T.IFCRELNESTS]) {
    for (const id of lineIds(api, modelID, relType)) {
      const rel = safeLine(api, modelID, id);
      const parent = refId(rel?.RelatingObject);
      if (parent === null) continue;
      refList(rel.RelatedObjects).forEach((child) => { if (!parentOf.has(child)) parentOf.set(child, parent); });
    }
  }
  const containedIn = new Map();
  for (const id of lineIds(api, modelID, T.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
    const rel = safeLine(api, modelID, id);
    const structure = refId(rel?.RelatingStructure);
    if (structure === null) continue;
    refList(rel.RelatedElements).forEach((element) => containedIn.set(element, structure));
  }
  const storeyLines = lineIds(api, modelID, T.IFCBUILDINGSTOREY).map((id) => {
    const line = safeLine(api, modelID, id) || {};
    const elevation = Number(plain(line.Elevation));
    return {
      id,
      guid: plain(line.GlobalId) || null,
      name: plain(line.Name) || plain(line.LongName) || `Pavimento #${id}`,
      elevation: Number.isFinite(elevation) ? Math.round(elevation * units.length * 1000) / 1000 : null
    };
  });
  storeyLines.sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));
  const storeyIndex = new Map(storeyLines.map((storey, index) => [storey.id, index]));
  const storeyCache = new Map();
  const resolveStorey = (id) => {
    if (storeyCache.has(id)) return storeyCache.get(id);
    let current = id;
    let result = null;
    for (let depth = 0; depth < 12 && current !== undefined && current !== null; depth += 1) {
      if (storeyIndex.has(current)) { result = storeyIndex.get(current); break; }
      const container = containedIn.get(current);
      if (container !== undefined && storeyIndex.has(container)) { result = storeyIndex.get(container); break; }
      current = container !== undefined ? container : parentOf.get(current);
    }
    storeyCache.set(id, result);
    return result;
  };

  // 3. Types.
  const typeOf = new Map();
  for (const id of lineIds(api, modelID, T.IFCRELDEFINESBYTYPE)) {
    const rel = safeLine(api, modelID, id);
    const typeId = refId(rel?.RelatingType);
    if (typeId === null) continue;
    refList(rel.RelatedObjects).forEach((element) => typeOf.set(element, typeId));
  }
  const typeNames = new Map();
  const getTypeName = (typeId) => {
    if (!typeNames.has(typeId)) {
      const line = safeLine(api, modelID, typeId);
      typeNames.set(typeId, plain(line?.Name) || null);
    }
    return typeNames.get(typeId);
  };

  // 4. Materials.
  const materialCache = new Map();
  const resolveMaterials = (id, depth = 0) => {
    if (id === null || depth > 6) return [];
    if (materialCache.has(id)) return materialCache.get(id);
    const line = safeLine(api, modelID, id);
    const kind = typeName(api, modelID, id);
    let names = [];
    if (!line) names = [];
    else if (kind === 'IFCMATERIAL') names = [plain(line.Name)].filter(Boolean);
    else if (kind === 'IFCMATERIALLIST') names = refList(line.Materials).flatMap((child) => resolveMaterials(child, depth + 1));
    else if (kind === 'IFCMATERIALLAYERSETUSAGE') names = resolveMaterials(refId(line.ForLayerSet), depth + 1);
    else if (kind === 'IFCMATERIALLAYERSET') names = refList(line.MaterialLayers).flatMap((child) => resolveMaterials(child, depth + 1));
    else if (kind === 'IFCMATERIALPROFILESETUSAGE' || kind === 'IFCMATERIALPROFILESETUSAGETAPERING') names = resolveMaterials(refId(line.ForProfileSet), depth + 1);
    else if (kind === 'IFCMATERIALPROFILESET') names = refList(line.MaterialProfiles).flatMap((child) => resolveMaterials(child, depth + 1));
    else if (kind === 'IFCMATERIALCONSTITUENTSET') names = refList(line.MaterialConstituents).flatMap((child) => resolveMaterials(child, depth + 1));
    else if (['IFCMATERIALLAYER', 'IFCMATERIALPROFILE', 'IFCMATERIALCONSTITUENT', 'IFCMATERIALLAYERWITHOFFSETS', 'IFCMATERIALPROFILEWITHOFFSETS'].includes(kind)) names = resolveMaterials(refId(line.Material), depth + 1);
    names = [...new Set(names)];
    materialCache.set(id, names);
    return names;
  };
  const materialsOf = new Map();
  for (const id of lineIds(api, modelID, T.IFCRELASSOCIATESMATERIAL)) {
    const rel = safeLine(api, modelID, id);
    const names = resolveMaterials(refId(rel?.RelatingMaterial));
    if (!names.length) continue;
    refList(rel.RelatedObjects).forEach((object) => materialsOf.set(object, [...new Set([...(materialsOf.get(object) || []), ...names])]));
  }

  // 5. Systems (IfcSystem / IfcDistributionSystem / IfcBuildingSystem).
  const systemsOf = new Map();
  for (const id of lineIds(api, modelID, T.IFCRELASSIGNSTOGROUP)) {
    const rel = safeLine(api, modelID, id);
    const groupId = refId(rel?.RelatingGroup);
    if (groupId === null) continue;
    const groupKind = typeName(api, modelID, groupId);
    if (!/SYSTEM$/.test(groupKind)) continue;
    const group = safeLine(api, modelID, groupId);
    const entry = { name: plain(group?.Name) || `Sistema #${groupId}`, type: plain(group?.ObjectType) || plain(group?.PredefinedType) || null };
    refList(rel.RelatedObjects).forEach((object) => {
      const list = systemsOf.get(object) || [];
      list.push(entry);
      systemsOf.set(object, list);
    });
  }

  // 6. Property sets and quantities.
  report(0.7, 'Lendo propriedades e quantidades');
  const propsOf = new Map();
  const quantitiesOf = new Map();
  const definitionCache = new Map();
  const readDefinition = (defId) => {
    if (definitionCache.has(defId)) return definitionCache.get(defId);
    const kind = typeName(api, modelID, defId);
    const line = safeLine(api, modelID, defId);
    const result = { props: {}, quantities: {} };
    if (line && kind === 'IFCELEMENTQUANTITY') {
      for (const quantityId of refList(line.Quantities)) {
        const quantity = safeLine(api, modelID, quantityId);
        if (!quantity) continue;
        const name = fold(plain(quantity.Name));
        const alias = QUANTITY_BY_NAME.get(name);
        if (!alias) continue;
        const raw = plain(quantity.VolumeValue ?? quantity.AreaValue ?? quantity.LengthValue);
        const scale = quantity.VolumeValue !== undefined ? units.volume : quantity.AreaValue !== undefined ? units.area : units.length;
        const value = Number(raw) * scale;
        if (!Number.isFinite(value) || value <= 0) continue;
        const current = result.quantities[alias.key];
        if (!current || alias.rank < current.rank) result.quantities[alias.key] = { value, rank: alias.rank };
      }
    } else if (line && kind === 'IFCPROPERTYSET') {
      for (const propertyId of refList(line.HasProperties)) {
        const property = safeLine(api, modelID, propertyId);
        if (!property || property.NominalValue === undefined) continue;
        const rawName = plain(property.Name);
        const name = fold(rawName);
        const value = plain(property.NominalValue);
        if (value === null || value === undefined || value === '') continue;
        if (KEPT_PROPERTIES.has(name)) result.props[rawName] = typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value;
        // Revit "export Revit property sets" writes quantities as plain properties.
        const alias = QUANTITY_BY_NAME.get(name);
        const measure = String(property.NominalValue?.label || property.NominalValue?.constructor?.name || '').toUpperCase();
        if (alias && typeof value === 'number' && value > 0) {
          const scale = measure.includes('VOLUME') ? units.volume : measure.includes('AREA') ? units.area : measure.includes('LENGTH') ? units.length : null;
          if (scale !== null) {
            const current = result.quantities[alias.key];
            if (!current || alias.rank < current.rank) result.quantities[alias.key] = { value: value * scale, rank: alias.rank + 100 };
          }
        }
      }
    }
    definitionCache.set(defId, result);
    return result;
  };
  for (const id of lineIds(api, modelID, T.IFCRELDEFINESBYPROPERTIES)) {
    const rel = safeLine(api, modelID, id);
    const defIds = Array.isArray(rel?.RelatingPropertyDefinition) ? refList(rel.RelatingPropertyDefinition) : [refId(rel?.RelatingPropertyDefinition)].filter((value) => value !== null);
    for (const defId of defIds) {
      const definition = readDefinition(defId);
      const hasProps = Object.keys(definition.props).length;
      const hasQuantities = Object.keys(definition.quantities).length;
      if (!hasProps && !hasQuantities) continue;
      refList(rel.RelatedObjects).forEach((object) => {
        if (hasProps) propsOf.set(object, { ...(propsOf.get(object) || {}), ...definition.props });
        if (hasQuantities) {
          const merged = { ...(quantitiesOf.get(object) || {}) };
          Object.entries(definition.quantities).forEach(([key, entry]) => {
            if (!merged[key] || entry.rank < merged[key].rank) merged[key] = entry;
          });
          quantitiesOf.set(object, merged);
        }
      });
    }
  }

  // 7. Assemble.
  report(0.85, 'Montando índice');
  const elements = [];
  for (const [id, acc] of accumulators) {
    const line = safeLine(api, modelID, id) || {};
    const cls = typeName(api, modelID, id);
    if (!cls || cls === 'IFCOPENINGELEMENT' || cls === 'IFCANNOTATION') continue;
    const typeId = typeOf.get(id);
    const typeLabel = (typeId !== undefined ? getTypeName(typeId) : null) || plain(line.ObjectType) || null;
    const props = { ...(typeId !== undefined ? propsOf.get(typeId) : null), ...(propsOf.get(id) || {}) };
    const ifcQuantities = { ...(typeId !== undefined ? quantitiesOf.get(typeId) : null), ...(quantitiesOf.get(id) || {}) };
    const metrics = finalizeMetrics(acc);
    // A Length property on a segment (Pset_*SegmentCommon / Revit) is the
    // modelled centreline length, better than any geometric estimate.
    const lengthProperty = Object.entries(props).find(([key]) => fold(key) === 'length');
    const overrides = {};
    if (ifcQuantities.length) overrides.length = ifcQuantities.length.value;
    else if (classFamily(cls) === 'segment' && lengthProperty && Number(lengthProperty[1]) > 0) overrides.length = Number(lengthProperty[1]) * units.length;
    const geometric = deriveQuantities(cls, metrics, overrides);
    const q = { ...geometric };
    // Only quantities read from the IFC are flagged; everything else is geometric.
    const ifcKeys = [];
    if (overrides.length && q.length) ifcKeys.push('length');
    Object.entries(ifcQuantities).forEach(([key, entry]) => {
      q[key] = Math.round(entry.value * 1e6) / 1e6;
      if (!ifcKeys.includes(key)) ifcKeys.push(key);
    });
    const materials = materialsOf.get(id) || (typeId !== undefined ? materialsOf.get(typeId) : null) || (parentOf.has(id) ? materialsOf.get(parentOf.get(id)) : null) || [];
    const systems = systemsOf.get(id) || [];
    const element = { id, cls, q };
    const guid = plain(line.GlobalId);
    const name = plain(line.Name);
    const tag = plain(line.Tag);
    const storey = resolveStorey(id);
    if (guid) element.guid = guid;
    if (name) element.name = name;
    if (typeLabel) element.type = typeLabel;
    if (tag) element.tag = tag;
    if (storey !== null) element.storey = storey;
    if (materials.length) element.materials = materials;
    if (systems.length) {
      element.systems = [...new Set(systems.map((entry) => entry.name))];
      const systemTypes = [...new Set(systems.map((entry) => entry.type).filter(Boolean))];
      if (systemTypes.length) element.systemTypes = systemTypes;
    }
    if (ifcKeys.length) element.ifcq = ifcKeys;
    const predefined = plain(line.PredefinedType);
    if (predefined && predefined !== 'NOTDEFINED' && predefined !== 'USERDEFINED') element.ptype = predefined;
    if (Object.keys(props).length) element.p = props;
    if (metrics?.bbox) element.box = [...metrics.bbox.min, ...metrics.bbox.max].map((value) => Math.round(value * 1000) / 1000);
    elements.push(element);
  }
  elements.sort((a, b) => a.id - b.id);
  report(1, 'Índice pronto');
  return {
    version: BIM_INDEX_VERSION,
    schema,
    units: { length: 'm', area: 'm²', volume: 'm³', sourceLengthScale: units.length },
    storeys: storeyLines.map(({ id, guid, name, elevation }) => ({ id, guid, name, elevation })),
    elements
  };
}
