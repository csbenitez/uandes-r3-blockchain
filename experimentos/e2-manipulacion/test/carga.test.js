const test = require("node:test");
const assert = require("node:assert/strict");
const { Carga } = require("../src/carga");

const monitorFalso = () => ({ metricas: {}, fijar(k, v) { this.metricas[k] = v; } });
// Emisor que no toca la red: cada ráfaga devuelve lotes vacíos.
const emisorFalso = () => ({ maxLote: 100, enviarFacturas: async () => ({ lotes: [], errores: 0 }), proveedor: {} });

test("configurar recalcula los lotes por ciclo y publica las métricas", () => {
  const monitor = monitorFalso();
  const carga = new Carga({ emisor: emisorFalso(), monitor });
  assert.equal(carga.lotesPorCiclo, 5);
  carga.configurar({ facturasPorCiclo: 250, cadaMs: 2000 });
  assert.equal(carga.lotesPorCiclo, 3);
  assert.equal(carga.cadaMs, 2000);
  assert.equal(monitor.metricas.e2_facturas_por_ciclo, 250);
  assert.equal(monitor.metricas.e2_lotes_por_ciclo, 3);
});

test("configurar con la carga encendida reinicia el intervalo de envío", () => {
  const carga = new Carga({ emisor: emisorFalso(), monitor: monitorFalso() });
  carga.iniciar();
  const antes = carga.envio;
  carga.configurar({ cadaMs: 2000 });
  assert.notEqual(carga.envio, antes);
  assert.equal(carga.envio._idleTimeout, 2000);
  assert.equal(carga.facturasPorCiclo, 500);
  carga.detener();
});

test("configurar con la carga apagada no la enciende", () => {
  const carga = new Carga({ emisor: emisorFalso(), monitor: monitorFalso() });
  carga.configurar({ facturasPorCiclo: 50 });
  assert.equal(carga.encendida, false);
  assert.equal(carga.envio, undefined);
  assert.equal(carga.lotesPorCiclo, 1);
});
