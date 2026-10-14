/**
 * Geometric measurements of one IFC element, computed from its tessellated
 * representation (web-ifc output, Y-up, metres).
 *
 * The figures are deliberately conservative: volume uses the divergence
 * theorem and is discarded when the mesh is evidently not closed, and the
 * plan dimensions come from the minimum-area rectangle around the element's
 * footprint, so walls and beams at any angle report their real length.
 */

const UP_FACE_NORMAL_Y = 0.5;

export function createMetricsAccumulator() {
  return {
    signedVolume6: 0,
    surfaceArea: 0,
    upArea: 0,
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
    footprint: [],
    vertexCount: 0
  };
}

/**
 * Adds one placed geometry to the accumulator.
 * @param {object} acc accumulator from createMetricsAccumulator()
 * @param {Float32Array|number[]} vertices interleaved position+normal (stride 6) as returned by web-ifc
 * @param {Uint32Array|number[]} indices triangle indices
 * @param {number[]} matrix column-major 4x4 transformation
 */
export function addPlacedGeometry(acc, vertices, indices, matrix, stride = 6) {
  const count = Math.floor(vertices.length / stride);
  if (!count || !indices.length) return;
  const world = new Float64Array(count * 3);
  const m = matrix;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i += 1) {
    const x = vertices[i * stride];
    const y = vertices[i * stride + 1];
    const z = vertices[i * stride + 2];
    const w = [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14]
    ];
    for (let axis = 0; axis < 3; axis += 1) {
      world[i * 3 + axis] = w[axis];
      if (w[axis] < min[axis]) min[axis] = w[axis];
      if (w[axis] > max[axis]) max[axis] = w[axis];
    }
  }
  // A mirrored placement flips the winding order and therefore the sign of
  // every tetrahedron. Normalise per placed geometry so mirrored copies add up.
  const det = m[0] * (m[5] * m[10] - m[9] * m[6])
    - m[4] * (m[1] * m[10] - m[9] * m[2])
    + m[8] * (m[1] * m[6] - m[5] * m[2]);
  let signed = 0;
  let surface = 0;
  let up = 0;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    const ax = world[a]; const ay = world[a + 1]; const az = world[a + 2];
    const bx = world[b]; const by = world[b + 1]; const bz = world[b + 2];
    const cx = world[c]; const cy = world[c + 1]; const cz = world[c + 2];
    // Signed tetrahedron volume against the origin (x6).
    signed += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    const ux = bx - ax; const uy = by - ay; const uz = bz - az;
    const vx = cx - ax; const vy = cy - ay; const vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const doubled = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!doubled) continue;
    surface += doubled / 2;
    if (ny / doubled > UP_FACE_NORMAL_Y) up += doubled / 2;
  }
  // Some exporters (Revit "Forma direta", multiple body representations)
  // emit the same solid twice. Counting both would double volume and area.
  const key = [signed, ...min, ...max].map((value) => value.toFixed(4)).join('|');
  acc.pieces ??= new Set();
  if (acc.pieces.has(key)) return;
  acc.pieces.add(key);
  for (let axis = 0; axis < 3; axis += 1) {
    if (min[axis] < acc.min[axis]) acc.min[axis] = min[axis];
    if (max[axis] > acc.max[axis]) acc.max[axis] = max[axis];
  }
  for (let i = 0; i < count; i += 1) acc.footprint.push(world[i * 3], world[i * 3 + 2]);
  acc.vertexCount += count;
  acc.signedVolume6 += det < 0 ? -signed : signed;
  acc.surfaceArea += surface;
  acc.upArea += up;
}

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Andrew's monotone chain. Input: flat [x0, z0, x1, z1, ...]. */
export function convexHull(flat) {
  const points = [];
  // Round to 0.1 mm to collapse the many duplicated vertices of a mesh.
  const seen = new Set();
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const x = Math.round(flat[i] * 1e4) / 1e4;
    const z = Math.round(flat[i + 1] * 1e4) / 1e4;
    const key = `${x}|${z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push([x, z]);
  }
  if (points.length < 3) return points;
  points.sort((p, q) => (p[0] - q[0]) || (p[1] - q[1]));
  const lower = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const p = points[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Minimum-area enclosing rectangle of a convex polygon (rotating calipers). */
export function minimumAreaRectangle(hull) {
  if (hull.length === 0) return { length: 0, width: 0 };
  if (hull.length < 3) {
    const [a, b = a] = hull;
    return { length: Math.hypot(b[0] - a[0], b[1] - a[1]), width: 0 };
  }
  let best = null;
  for (let i = 0; i < hull.length; i += 1) {
    const p = hull[i];
    const q = hull[(i + 1) % hull.length];
    const edge = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (edge < 1e-9) continue;
    const ux = (q[0] - p[0]) / edge;
    const uz = (q[1] - p[1]) / edge;
    let minU = Infinity; let maxU = -Infinity; let minV = Infinity; let maxV = -Infinity;
    for (const r of hull) {
      const u = r[0] * ux + r[1] * uz;
      const v = -r[0] * uz + r[1] * ux;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const a = maxU - minU;
    const b = maxV - minV;
    const area = a * b;
    if (!best || area < best.area) best = { area, length: Math.max(a, b), width: Math.min(a, b) };
  }
  return best || { length: 0, width: 0 };
}

export function finalizeMetrics(acc) {
  if (!acc.vertexCount) return null;
  const size = [acc.max[0] - acc.min[0], acc.max[1] - acc.min[1], acc.max[2] - acc.min[2]];
  const boxVolume = size[0] * size[1] * size[2];
  let volume = Math.abs(acc.signedVolume6) / 6;
  // An open shell yields an arbitrary figure. Anything larger than the
  // element's bounding box cannot be a real solid volume.
  if (!(volume > 1e-9) || volume > boxVolume * 1.02 + 1e-6) volume = null;
  const rect = minimumAreaRectangle(convexHull(acc.footprint));
  acc.footprint = [];
  acc.pieces = null;
  return {
    volume,
    surfaceArea: acc.surfaceArea,
    upArea: acc.upArea,
    planLength: rect.length,
    planWidth: rect.width,
    height: size[1],
    bbox: { min: [...acc.min], max: [...acc.max] }
  };
}

const FAMILIES = [
  ['wall', /^IFC(WALL|WALLSTANDARDCASE|WALLELEMENTEDCASE|CURTAINWALL|PLATE)$/],
  ['slab', /^IFC(SLAB|SLABSTANDARDCASE|SLABELEMENTEDCASE|ROOF|COVERING|RAMP|RAMPFLIGHT|PAVEMENT)$/],
  ['column', /^IFC(COLUMN|COLUMNSTANDARDCASE|PILE)$/],
  ['beam', /^IFC(BEAM|BEAMSTANDARDCASE|MEMBER|MEMBERSTANDARDCASE|RAILING)$/],
  ['footing', /^IFC(FOOTING)$/],
  ['stair', /^IFC(STAIR|STAIRFLIGHT)$/],
  ['opening', /^IFC(DOOR|DOORSTANDARDCASE|WINDOW|WINDOWSTANDARDCASE)$/],
  ['segment', /^IFC(FLOWSEGMENT|PIPESEGMENT|DUCTSEGMENT|CABLECARRIERSEGMENT|CABLESEGMENT)$/],
  ['fitting', /^IFC(FLOWFITTING|PIPEFITTING|DUCTFITTING|CABLECARRIERFITTING|CABLEFITTING|JUNCTIONBOX)$/],
  ['terminal', /^IFC(FLOWTERMINAL|SANITARYTERMINAL|LIGHTFIXTURE|OUTLET|SWITCHINGDEVICE|ELECTRICAPPLIANCE|AIRTERMINAL|FIRESUPPRESSIONTERMINAL|WASTETERMINAL|STACKTERMINAL|VALVE|FLOWCONTROLLER|DISTRIBUTIONCONTROLELEMENT|ELECTRICDISTRIBUTIONBOARD|PROTECTIVEDEVICE)$/],
  ['space', /^IFC(SPACE)$/],
  ['furniture', /^IFC(FURNISHINGELEMENT|FURNITURE|SYSTEMFURNITUREELEMENT)$/]
];

export function classFamily(ifcClass) {
  const upper = String(ifcClass || '').toUpperCase();
  for (const [family, pattern] of FAMILIES) if (pattern.test(upper)) return family;
  return 'other';
}

const round = (value, digits = 4) => (Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null);

/**
 * Turns raw metrics into engineering quantities appropriate for the class.
 * Returns only meaningful keys: volume (m³), area (m²), length, width,
 * height, thickness, diameter (m) and surface (m²).
 */
export function deriveQuantities(ifcClass, metrics, overrides = {}) {
  if (!metrics) return {};
  const family = classFamily(ifcClass);
  const { volume, surfaceArea, upArea, planLength, planWidth, height } = metrics;
  const q = { volume, surface: surfaceArea };
  const planMax = Math.max(planLength, height);
  switch (family) {
    case 'wall': {
      q.length = planLength;
      q.height = height;
      q.thickness = planWidth;
      // The tessellated wall already has its doors and windows cut out, so
      // volume / thickness is the net side area. Fall back to the gross face.
      q.area = volume && planWidth > 0.005 ? volume / planWidth : planLength * height;
      break;
    }
    case 'slab': {
      // Coverings are also used for wall tiling; treat a vertical finish like a wall face.
      const vertical = upArea < surfaceArea * 0.1;
      if (vertical) {
        q.length = planLength;
        q.height = height;
        q.thickness = planWidth;
        q.area = volume && planWidth > 0.002 ? volume / planWidth : planLength * height;
      } else {
        q.area = upArea;
        q.thickness = volume && upArea > 0 ? volume / upArea : height;
        q.length = planLength;
        q.width = planWidth;
      }
      break;
    }
    case 'column': {
      q.length = height;
      q.height = height;
      q.width = planWidth;
      q.depth = planLength;
      break;
    }
    case 'beam': {
      const vertical = height > planLength;
      q.length = vertical ? height : planLength;
      q.width = vertical ? planWidth : planWidth;
      q.height = vertical ? planLength : height;
      break;
    }
    case 'footing':
    case 'stair': {
      q.length = planLength;
      q.width = planWidth;
      q.height = height;
      if (family === 'stair') q.area = upArea;
      break;
    }
    case 'opening': {
      q.width = planLength;
      q.height = height;
      q.area = planLength * height;
      break;
    }
    case 'segment': {
      const length = overrides.length ?? planMax;
      q.length = length;
      if (volume && length > 0.01) q.diameter = 2 * Math.sqrt(volume / (Math.PI * length));
      break;
    }
    case 'space': {
      q.area = upArea;
      q.height = height;
      break;
    }
    default: {
      q.length = planLength;
      q.width = planWidth;
      q.height = height;
      if (upArea > surfaceArea * 0.2) q.area = upArea;
    }
  }
  const output = {};
  Object.entries(q).forEach(([key, value]) => {
    const rounded = round(value, key === 'volume' ? 6 : 4);
    if (rounded !== null && rounded > 0) output[key] = rounded;
  });
  return output;
}
