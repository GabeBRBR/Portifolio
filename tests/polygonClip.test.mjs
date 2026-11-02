import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { clipPolygonToHalfSpace, subtractBoxFromPolygon, subtractDoorPortals } from '../src/viewer/geometry/polygonClip.js';

const square = (z = 0) => [
  new THREE.Vector3(0, 0, z), new THREE.Vector3(4, 0, z),
  new THREE.Vector3(4, 4, z), new THREE.Vector3(0, 4, z)
];
const area = (polygon) => {
  // Shoelace formula on the XY plane (all test polygons are planar at constant z).
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
};
const totalArea = (polygons) => polygons.reduce((sum, polygon) => sum + area(polygon), 0);

test('clipPolygonToHalfSpace keeps the part of the square above x = 1', () => {
  const kept = clipPolygonToHalfSpace(square(), 'x', 1, true);
  assert.ok(Math.abs(area(kept) - 12) < 1e-9);
  assert.ok(kept.every((point) => point.x >= 1 - 1e-7));
});

test('clipPolygonToHalfSpace keeps the other side when keepGreater is false', () => {
  const kept = clipPolygonToHalfSpace(square(), 'y', 1, false);
  assert.ok(Math.abs(area(kept) - 4) < 1e-9);
});

test('a box that misses the polygon removes nothing', () => {
  const box = new THREE.Box3(new THREE.Vector3(10, -1, -1), new THREE.Vector3(12, 1, 1));
  const remainder = subtractBoxFromPolygon(square(), box);
  assert.equal(remainder.length, 1);
  assert.ok(Math.abs(totalArea(remainder) - 16) < 1e-9);
});

test('a box crossing the middle of the square leaves the surrounding ring', () => {
  const box = new THREE.Box3(new THREE.Vector3(1, -1, -1), new THREE.Vector3(3, 5, 1));
  const remainder = subtractBoxFromPolygon(square(), box);
  // 16 m² square minus the 2 m × 4 m aperture = 8 m².
  assert.ok(Math.abs(totalArea(remainder) - 8) < 1e-6);
});

test('subtractDoorPortals applies every portal in sequence', () => {
  const portals = [
    new THREE.Box3(new THREE.Vector3(0, -1, -1), new THREE.Vector3(1, 5, 1)),
    new THREE.Box3(new THREE.Vector3(3, -1, -1), new THREE.Vector3(4, 5, 1))
  ];
  const triangle = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 0, 0), new THREE.Vector3(4, 4, 0)];
  const remainder = subtractDoorPortals(triangle, portals);
  assert.ok(remainder.length > 0);
  assert.ok(totalArea(remainder) < area(triangle) + 1e-9);
});

test('subtractDoorPortals with no portals returns the triangle unchanged', () => {
  const triangle = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 0, 0), new THREE.Vector3(4, 4, 0)];
  const remainder = subtractDoorPortals(triangle, []);
  assert.equal(remainder.length, 1);
  assert.equal(remainder[0], triangle);
});
