// Conductor de E2 · Manipulación del libro.
// Uso:  node experimentos/e2-manipulacion/correr.js [--sin-limite]
// Exige la red arriba y el contrato desplegado (deploy-e1.js). Nunca apaga node1: es el punto de entrada del emisor.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { NODOS, foto } = require("./src/observador");
const { dormir, docker, altura, esperarBloque, verdadPorNodo } = require("./src/acciones");
const { crearProxy } = require("./src/proxy-mentiroso");
const { crearEmisor } = require("./enviar-facturas");

const SIN_LIMITE = process.argv.includes("--sin-limite");
const MAX_RECUPERACION_MS = 6 * 60 * 1000;
const fase = (n, t) => console.log(`\n\x1b[1;36m[Fase ${n}] ${t}\x1b[0m`);
const dato = (t) => console.log(`  ${t}`);

async function main() {
  const res = { inicio: new Date().toISOString(), version: "", fases: {} };
  const proxy = crearProxy();
  await proxy.iniciar();
  const urls = { ...NODOS, node4: proxy.url };
  const emisor = await crearEmisor();

  try {
    res.version = execSync("git rev-parse --short HEAD", { stdio: "pipe" }).toString().trim();
  } catch {
    res.version = "desconocido";
  }

  // ---------- Fase 0 ----------
  fase(0, "Línea base: 4 nodos sanos");
  const base = await emisor.enviar(2);
  await esperarBloque(Object.values(urls), base.recibo.blockNumber);
  const f0 = await foto(urls, [base.recibo.blockNumber]);
  dato(`lote en el bloque ${base.recibo.blockNumber}; los 4 nodos coinciden: ${f0.honestos.length === 4}`);
  res.fases.base = { bloque: base.recibo.blockNumber, coinciden4: f0.honestos.length === 4 };
  if (f0.honestos.length !== 4) throw new Error("La línea base no coincide; reinicia la red antes de medir");

  // ---------- Fase 1 ----------
  fase(1, "Manipulación de 1 de 4: node4 reescribe su libro");
  const h0 = await altura();
  proxy.mentir(true);
  const t0 = Date.now();
  let f1;
  do {
    f1 = await foto(urls, [h0]);
    if (f1.divergentes.length || f1.caidos.length) break;
    await dormir(100);
  } while (Date.now() - t0 < 30000);
  const msDeteccion = Date.now() - t0;
  const bloquesDeteccion = Math.max(...Object.values(f1.alturas).filter((a) => a !== null)) - h0;
  dato(`detectado en ${msDeteccion} ms, ${bloquesDeteccion} bloque(s) después; divergente: ${f1.divergentes.join(",") || "ninguno"}`);

  const original = base.facturas[0].item.huella;
  const facturaId = base.facturas[0].item.facturaId;
  const lecturas = await verdadPorNodo(emisor, urls, facturaId);
  dato(`huellaDe(factura) por nodo: ${Object.entries(lecturas).map(([n, h]) => `${n}=${h.slice(0, 10)}…`).join("  ")}`);
  const honestos = Object.keys(lecturas).filter((n) => lecturas[n] === original);
  dato(`la mayoría (${honestos.length}/4) devuelve la huella original; la verdad del consorcio no cambió: ${honestos.length >= 3}`);

  let confirmados = 0;
  for (let i = 0; i < 3; i++) {
    const l = await emisor.enviar(2);
    confirmados += l.recibo.status === 1 ? 1 : 0;
  }
  dato(`lotes enviados mientras node4 miente: 3, confirmados: ${confirmados}`);
  proxy.mentir(false);
  res.fases.manipulacion1de4 = {
    detectadoMs: msDeteccion,
    detectadoBloques: bloquesDeteccion,
    divergentes: f1.divergentes,
    nodosConVerdad: honestos,
    lotesConfirmados: confirmados,
    cumple: bloquesDeteccion <= 1 && honestos.length >= 3 && confirmados === 3,
  };

  if (SIN_LIMITE) return cerrar(res, proxy);

  // ---------- Fase 2 ----------
  fase(2, "Límite: 1 y luego 2 de 4 fuera de servicio (node3 y node4 se detienen de verdad)");
  docker("stop node4");
  const tStop = Date.now();
  const hA = await altura();
  while ((await altura()) <= hA && Date.now() - tStop < 60000) await dormir(300);
  dato(`con 1 caído, la red produjo bloque a los ${((Date.now() - tStop) / 1000).toFixed(1)} s`);
  const con3 = await emisor.enviar(2);
  dato(`lote con 3 de 4: confirmado en el bloque ${con3.recibo.blockNumber} (${con3.ms} ms)`);

  docker("stop node3");
  const hB = await altura();
  const colgado = await emisor.enviar(2, { esperar: false });
  await dormir(20000);
  const hC = await altura();
  const recibo2 = await emisor.proveedor.getTransactionReceipt(colgado.tx.hash);
  const congelada = hC - hB <= 1 && !recibo2;
  dato(`con 2 caídos, 20 s después: altura ${hB} → ${hC}, tx confirmada: ${Boolean(recibo2)}; red detenida: ${congelada}`);

  docker("start node3");
  docker("start node4");
  const tReinicio = Date.now();
  dato("nodos reiniciados; esperando a que el quórum retome (puede tardar minutos)...");
  let recuperado = false;
  let ultimoAviso = 0;
  while (Date.now() - tReinicio < MAX_RECUPERACION_MS) {
    const r = await emisor.proveedor.getTransactionReceipt(colgado.tx.hash).catch(() => null);
    if (r) {
      recuperado = true;
      break;
    }
    if (Date.now() - ultimoAviso > 30000) {
      dato(`  ${Math.round((Date.now() - tReinicio) / 1000)} s, altura ${await altura().catch(() => "?")}`);
      ultimoAviso = Date.now();
    }
    await dormir(1000);
  }
  const msRecuperacion = Date.now() - tReinicio;
  dato(recuperado ? `la red retomó y confirmó la tx pendiente a los ${Math.round(msRecuperacion / 1000)} s` : "NO se recuperó dentro del límite");
  res.fases.limite = {
    conUnCaido: { loteConfirmadoEnBloque: con3.recibo.blockNumber },
    conDosCaidos: { alturaAntes: hB, alturaDespues: hC, redDetenida: congelada, txConfirmada: Boolean(recibo2) },
    recuperacionMs: recuperado ? msRecuperacion : null,
    cumple: congelada && recuperado,
  };
  return cerrar(res, proxy);
}

async function cerrar(res, proxy) {
  await proxy.detener();
  fase("Resumen", "");
  const m = res.fases.manipulacion1de4;
  console.log(`  1 de 4 manipulado: detección ${m.detectadoBloques} bloque(s) / ${m.detectadoMs} ms → ${m.cumple ? "CUMPLE" : "NO CUMPLE"} (meta ≤ 1 bloque, verdad por mayoría, 3 lotes confirmados)`);
  if (res.fases.limite) {
    const l = res.fases.limite;
    console.log(`  2 de 4 fuera: red detenida=${l.conDosCaidos.redDetenida}, recuperación ${l.recuperacionMs ? Math.round(l.recuperacionMs / 1000) + " s" : "no"} → ${l.cumple ? "COMPORTAMIENTO ESPERADO" : "REVISAR"}`);
  }
  const dir = path.join(__dirname, "resultados");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "resumen.json"), JSON.stringify(res, null, 2));
  console.log(`\n  Evidencia: experimentos/e2-manipulacion/resultados/resumen.json`);
}

main().catch(async (e) => {
  console.error("\nE2 falló:", e.message);
  try {
    for (const n of ["node3", "node4"]) docker(`start ${n}`);
  } catch {}
  process.exit(1);
});
