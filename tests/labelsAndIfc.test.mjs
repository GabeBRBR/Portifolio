import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classLabel,
  typeLabel,
  familyLabel,
  formatNumber,
  formatQuantity,
  escapeHtml,
  fold,
  foldKey
} from '../src/bim/labels.js';
import { decodeIfcString } from '../src/bim/ifc-index-builder.js';

test('classLabel translates known IFC classes to Portuguese and prettifies unknown ones', () => {
  assert.equal(classLabel('IfcWallStandardCase'), 'Parede');
  assert.equal(classLabel('IFCFIRESUPPRESSIONTERMINAL'), 'Hidrante / sprinkler');
  assert.equal(classLabel('IfcBridgePart'), 'Bridgepart');
});

test('typeLabel and familyLabel split Revit Family:Type strings cleanly', () => {
  assert.equal(typeLabel('Parede Básica:Alvenaria 15cm'), 'Alvenaria 15cm');
  assert.equal(familyLabel('Parede Básica:Alvenaria 15cm'), 'Parede Básica');
  assert.equal(typeLabel('Bloco Simples'), 'Bloco Simples');
  assert.equal(familyLabel('Bloco Simples'), null);
  assert.equal(typeLabel(''), 'Sem tipo');
});

test('formatNumber and formatQuantity use Brazilian decimal comma and appropriate units', () => {
  assert.equal(formatNumber(12.5, 2), '12,50');
  assert.equal(formatNumber(null), '—');
  assert.equal(formatQuantity('volume', 1.23456), '1,235 m³');
  assert.equal(formatQuantity('diameter', 0.05), '50 mm');
  assert.equal(formatQuantity('area', 24.5, { withUnit: false }), '24,50');
});

test('fold and foldKey normalize accents, case and punctuation', () => {
  assert.equal(fold('Número do Circuito - 01'), 'numero do circuito - 01');
  assert.equal(foldKey('Número do Circuito - 01'), 'numerodocircuito01');
  assert.equal(escapeHtml('<script>"teste" & \'ok\'</script>'), '&lt;script&gt;&quot;teste&quot; &amp; &#39;ok&#39;&lt;/script&gt;');
});

test('decodeIfcString decodes ISO 10303-21 X2, X4, X and S escape sequences', () => {
  // \X2\00C1\X0\ -> 'Á', \X2\00E700E3\X0\ -> 'çã'
  assert.equal(decodeIfcString('Tubula\\X2\\00E700E3\\X0\\o de \\X2\\00C1\\X0\\gua'), 'Tubulação de Água');
  // \X\E9 -> 'é'
  assert.equal(decodeIfcString('T\\X\\E9rreo'), 'Térreo');
  // Plain text without backslashes returns unchanged
  assert.equal(decodeIfcString('Concreto Armado fck 30 MPa'), 'Concreto Armado fck 30 MPa');
});
