const test = require("node:test");
const assert = require("node:assert/strict");
const { lotear, lotesPara } = require("../src/lotes");

const n = (k) => Array.from({ length: k }, (_, i) => i);
const tamanos = (trozos) => trozos.map((t) => t.length);

test("500 facturas con MAX_LOTE 100 son 5 lotes de 100", () => {
  assert.deepEqual(tamanos(lotear(n(500), 100)), [100, 100, 100, 100, 100]);
  assert.equal(lotesPara(500, 100), 5);
});

test("1000 facturas son 10 lotes", () => {
  assert.equal(lotear(n(1000), 100).length, 10);
  assert.equal(lotesPara(1000, 100), 10);
});

test("un resto queda en un último lote más pequeño", () => {
  assert.deepEqual(tamanos(lotear(n(250), 100)), [100, 100, 50]);
  assert.equal(lotesPara(250, 100), 3);
});

test("los lotes conservan el orden y no pierden ni repiten facturas", () => {
  assert.deepEqual(lotear(n(250), 100).flat(), n(250));
});

test("sin facturas no hay lotes", () => {
  assert.deepEqual(lotear([], 100), []);
});

test("un tamaño de lote inválido lanza", () => {
  assert.throws(() => lotear(n(3), 0));
  assert.throws(() => lotear(n(3), 1.5));
});
