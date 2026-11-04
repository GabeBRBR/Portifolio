import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMetricsAccumulator,
  addPlacedGeometry,
  convexHull,
  minimumAreaRectangle,
  finalizeMetrics,
  classFamily,
  deriveQuantities
} from '../src/bim/geometry-metrics.js';

const IDENTITY_MATRIX = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
];

/** Builds an axis-aligned closed box [0..dx] x [0..dy] x [0..dz] with outward triangles (stride 6). */
function buildBoxMesh(dx, dy, dz) {
  const corners = [
    [0, 0, 0], [dx, 0, 0], [dx, dy, 0], [0, dy, 0],
    [0, 0, dz], [dx, 0, dz], [dx, dy, dz], [0, dy, dz]
  ];
  const vertices = [];
  for (const [x, y, z] of corners) {
    vertices.push(x, y, z, 0, 1, 0);
  }
  const indices = [
    // bottom (y = 0, normal -Y)
    0, 1, 5, 0, 5, 4,
    // top (y = dy, normal +Y)
    3, 7, 6, 3, 6, 2,
    // front (z = dz, normal +Z)
    4, 5, 6, 4, 6, 7,
    // back (z = 0, normal -Z)
    1, 0, 3, 1, 3, 2,
    // right (x = dx, normal +X)
    1, 2, 6, 1, 6, 5,
    // left (x = 0, normal -X)
    0, 4, 7, 0, 7, 3
  ];
  return { vertices, indices };
}

test('convexHull collapses duplicate vertices and extracts the outer boundary', () => {
  const flat = [
    0, 0,
    4, 0,
    4, 2,
    0, 2,
    2, 1, // interior point
    0, 0  // duplicate point
  ];
  const hull = convexHull(flat);
  assert.equal(hull.length, 4);
});

test('minimumAreaRectangle computes true length and width even when rotated 45 degrees', () => {
  const cos = Math.SQRT1_2;
  const sin = Math.SQRT1_2;
  const rectPoints = [
    [0, 0],
    [5, 0],
    [5, 0.2],
    [0, 0.2]
  ];
  const rotatedFlat = [];
  for (const [x, z] of rectPoints) {
    rotatedFlat.push(x * cos - z * sin, x * sin + z * cos);
  }
  const rect = minimumAreaRectangle(convexHull(rotatedFlat));
  assert.ok(Math.abs(rect.length - 5) < 1e-3);
  assert.ok(Math.abs(rect.width - 0.2) < 1e-3);
});

test('addPlacedGeometry and finalizeMetrics compute exact volume, surfaceArea, upArea and ignore duplicate pieces', () => {
  const acc = createMetricsAccumulator();
  const { vertices, indices } = buildBoxMesh(4, 3, 0.2);
  addPlacedGeometry(acc, vertices, indices, IDENTITY_MATRIX);
  // Adding the exact same piece a second time should be deduplicated
  addPlacedGeometry(acc, vertices, indices, IDENTITY_MATRIX);

  const metrics = finalizeMetrics(acc);
  assert.ok(metrics);
  assert.ok(Math.abs(metrics.volume - 2.4) < 1e-5);
  assert.ok(Math.abs(metrics.upArea - 0.8) < 1e-5);
  assert.ok(Math.abs(metrics.surfaceArea - 26.8) < 1e-5);
  assert.ok(Math.abs(metrics.height - 3) < 1e-5);
  assert.ok(Math.abs(metrics.planLength - 4) < 1e-3);
  assert.ok(Math.abs(metrics.planWidth - 0.2) < 1e-3);
});

test('classFamily maps standard IFC classes to expected engineering families', () => {
  assert.equal(classFamily('IfcWallStandardCase'), 'wall');
  assert.equal(classFamily('IFCSLAB'), 'slab');
  assert.equal(classFamily('IFCCOLUMN'), 'column');
  assert.equal(classFamily('IFCBEAM'), 'beam');
  assert.equal(classFamily('IFCPIPESEGMENT'), 'segment');
  assert.equal(classFamily('IFCDOOR'), 'opening');
  assert.equal(classFamily('IFCUNKNOWNCLASS'), 'other');
});

test('deriveQuantities derives wall net area from volume/thickness and pipe equivalent diameter', () => {
  const wallQ = deriveQuantities('IFCWALL', {
    volume: 2.0, // e.g. 12 m² gross wall minus 2 m² door opening * 0.20 m thickness
    surfaceArea: 22,
    upArea: 0.8,
    planLength: 4,
    planWidth: 0.2,
    height: 3
  });
  assert.equal(wallQ.area, 10);
  assert.equal(wallQ.thickness, 0.2);
  assert.equal(wallQ.length, 4);
  assert.equal(wallQ.height, 3);

  const radius = 0.05; // 100 mm diameter pipe
  const length = 6;
  const volume = Math.PI * radius * radius * length;
  const pipeQ = deriveQuantities('IFCPIPESEGMENT', {
    volume,
    surfaceArea: 2 * Math.PI * radius * length,
    upArea: 0,
    planLength: length,
    planWidth: 0.1,
    height: 0.1
  });
  assert.equal(pipeQ.length, 6);
  assert.ok(Math.abs(pipeQ.diameter - 0.1) < 1e-3);
});
