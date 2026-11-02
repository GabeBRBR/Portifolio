import test from 'node:test';
import assert from 'node:assert/strict';
import { createCsv, createXlsx } from '../src/bim/export.js';

const csvBytes = async (rows) => Buffer.from(await createCsv(rows).arrayBuffer());

test('csv uses ; separator, decimal comma and a UTF-8 BOM', async () => {
  const bytes = await csvBytes([['Nome', 'Valor'], ['Parede', 1.5]]);
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(bytes.subarray(3).toString('utf8'), 'Nome;Valor\r\nParede;1,5');
});

test('csv does not let a text cell run as a formula', async () => {
  const text = (await csvBytes([['=SOMA(1;2)', '-1 pilar', 'normal']])).subarray(3).toString('utf8');
  assert.equal(text, "\"'=SOMA(1;2)\";'-1 pilar;normal");
});

test('xlsx is a zip with the expected parts', async () => {
  const bytes = new Uint8Array(await createXlsx([{ name: 'Elementos', rows: [['A'], [1]] }]).arrayBuffer());
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const text = Buffer.from(bytes).toString('latin1');
  for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']) assert.ok(text.includes(part), part);
});
