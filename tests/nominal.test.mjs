import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNominal, parseNominal, normalisasiNominal } from '../src/lib/nominal.js';

test('nominal rupiah tampil pakai titik ribuan', () => {
  assert.equal(formatNominal('3000'), '3.000');
  assert.equal(formatNominal('15000000'), '15.000.000');
  assert.equal(formatNominal('-150000'), '-150.000');
  assert.equal(formatNominal('999'), '999');
  assert.equal(formatNominal(''), '');
  assert.equal(formatNominal('1250.5'), '1.250,5');
  assert.equal(formatNominal('12.'), '12,');
});

test('ketikan user dikembalikan jadi angka mentah', () => {
  assert.equal(parseNominal('3.000'), '3000');
  assert.equal(parseNominal('Rp 1.000.000'), '1000000');
  assert.equal(parseNominal('3.0001'), '30001');
  assert.equal(parseNominal('007'), '7');
  assert.equal(parseNominal(''), '');
  assert.equal(parseNominal('-15.000'), '15000');
  assert.equal(parseNominal('-15.000', { bolehMinus: true }), '-15000');
  assert.equal(parseNominal('-', { bolehMinus: true }), '-');
  assert.equal(parseNominal('1.250,5', { desimal: true }), '1250.5');
  assert.equal(parseNominal('1.250,567', { desimal: true }), '1250.56');
  assert.equal(parseNominal('12,', { desimal: true }), '12.');
  assert.equal(parseNominal('1,5', { desimal: false }), '15');
});

test('nilai dari DB dirapikan', () => {
  assert.equal(normalisasiNominal('1250.00'), '1250');
  assert.equal(normalisasiNominal(1250), '1250');
  assert.equal(normalisasiNominal('1250.50', { desimal: true }), '1250.5');
  assert.equal(normalisasiNominal('1250.00', { desimal: true }), '1250');
  assert.equal(normalisasiNominal(null), '');
  assert.equal(normalisasiNominal('abc'), '');
});
