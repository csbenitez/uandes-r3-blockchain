const test = require("node:test");
const assert = require("node:assert/strict");
const { clasificar, ESTADO } = require("../src/monitor");

const nombres = ["node1", "node2", "node3", "node4"];
const foto = (honestos, divergentes = [], caidos = []) => ({ honestos, divergentes, caidos });

test("cuatro nodos de acuerdo: todos ok", () => {
  const e = clasificar(foto(nombres), nombres);
  assert.deepEqual(Object.values(e), [0, 0, 0, 0]);
});

test("un nodo con otro hash queda DIVERGE y los demás ok", () => {
  const e = clasificar(foto(["node1", "node2", "node3"], ["node4"]), nombres);
  assert.equal(e.node4, ESTADO.DIVERGE);
  assert.equal(e.node1, ESTADO.OK);
});

test("un nodo que no responde queda CAÍDO", () => {
  const e = clasificar(foto(["node1", "node2"], [], ["node3", "node4"]), nombres);
  assert.equal(e.node3, ESTADO.CAIDO);
  assert.equal(e.node4, ESTADO.CAIDO);
  assert.equal(e.node2, ESTADO.OK);
});

test("sin mayoría nadie queda ok", () => {
  const e = clasificar(foto([], ["node1", "node2", "node3", "node4"]), nombres);
  assert.deepEqual(Object.values(e), [1, 1, 1, 1]);
});
