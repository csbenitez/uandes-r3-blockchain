// Imprime el resultado comprometido frente al obtenido. También se ejecuta suelto: node src/reporte.js <resumen.json>
const fs = require("fs");

const miles = (n) => Number(n).toLocaleString("es-CO");

function imprimirReporte(r) {
  const c = r.criterios;
  const veredicto = (ok) => (ok ? "\x1b[1;32mCUMPLE\x1b[0m" : "\x1b[1;31mNO CUMPLE\x1b[0m");
  const fila = (nombre, objetivo, obtenido, ok) =>
    console.log(`  ${nombre.padEnd(34)} ${objetivo.padEnd(18)} ${obtenido.padEnd(18)} ${ok === undefined ? "" : veredicto(ok)}`);

  console.log(`\n\x1b[1mResultado de E1\x1b[0m  ·  red ${r.red.nombre} (chainId ${r.red.chainId})  ·  contrato ${r.contrato.nombre}\n`);
  fila("Medida", "Comprometido", "Obtenido");
  fila("Alteraciones detectadas", `${miles(c.deteccion.total)} (100 %)`, `${miles(c.deteccion.obtenido)} (${(c.deteccion.tasa * 100).toFixed(1)} %)`, c.deteccion.cumple);
  fila("Falsos positivos en íntegras", `0 de ${miles(c.falsosPositivos.total)}`, `${miles(c.falsosPositivos.obtenido)} de ${miles(c.falsosPositivos.total)}`, c.falsosPositivos.cumple);
  fila("NO ANCLADA correctas", `${miles(c.noAnclada.total)}`, miles(c.noAnclada.obtenido), c.noAnclada.cumple);
  fila("txHash de evidencia distintos", "0", miles(c.evidencia.obtenido), c.evidencia.cumple);

  console.log("\n  Controles (no cuentan en el criterio)");
  fila("Falsos positivos sin canónica", "se espera > 0", `${miles(r.controlNegativoSinCanonica.falsosPositivos)} de ${miles(r.controlNegativoSinCanonica.total)}`);
  fila("Alteración previa al hash", "no se detecta", `${r.limiteConocido.noDetectadas} de ${r.limiteConocido.casos} sin detectar`);

  console.log("\n  Operación");
  fila("Anclaje", "", `${miles(r.anclaje.facturas)} en ${r.anclaje.transacciones} tx, ${r.anclaje.segundos} s`);
  fila("Gas por factura", "", miles(r.anclaje.gasPorFactura));
  fila("Verificación p50 / p95", "", `${r.verificacionMs.p50} / ${r.verificacionMs.p95} ms`);
  fila("Reintentos por cadena", "", miles(r.reintentosPorCadena));
  console.log(`\n  Veredicto: ${veredicto(Object.values(c).every((x) => x.cumple))}\n`);
}

if (require.main === module) imprimirReporte(JSON.parse(fs.readFileSync(process.argv[2], "utf8")));

module.exports = { imprimirReporte };
