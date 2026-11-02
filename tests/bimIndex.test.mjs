import test from 'node:test';
import assert from 'node:assert/strict';
import { BimIndex } from '../src/bim/BimIndex.js';

const row = (box, q = {}, ifcq = []) => ({ box, q, ifcq: new Set(ifcq) });

test('boxOf unions the boxes of a small selection', () => {
  const box = BimIndex.boxOf([row([0, 0, 0, 1, 1, 1]), row([2, 0, 0, 3, 2, 1])]);
  assert.deepEqual(box, { min: [0, 0, 0], max: [3, 2, 1] });
});

test('boxOf returns null without any box', () => {
  assert.equal(BimIndex.boxOf([row(null)]), null);
});

test('boxOf ignores a stray element far from the rest', () => {
  const rows = Array.from({ length: 100 }, (_, index) => row([index * 0.1, 0, 0, index * 0.1 + 1, 1, 1]));
  rows.push(row([5000, 0, 0, 5001, 1, 1]));
  assert.ok(BimIndex.boxOf(rows).max[0] < 100);
});

test('totals sums additive quantities and averages the others', () => {
  const totals = BimIndex.totals([row(null, { volume: 2, height: 3 }, ['volume']), row(null, { volume: 1, height: 5 })]);
  assert.equal(totals.volume, 3);
  assert.equal(totals.volumeFromIfc, 1);
  assert.equal(totals.height, 4);
});
