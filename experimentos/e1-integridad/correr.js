// Conductor de E1: genera, ancla, altera, verifica contra invoice-verifier y evalúa los criterios.
// Lo invoca e1.sh; no se ejecuta solo porque necesita la red, el contrato y el servicio arriba.
// Configuración por entorno: E1_INTEGRAS, E1_ALTERADAS, E1_SIN_ANCLAR, E1_LIMITE, E1_SEMILLA.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const { sha256Hex, huellaDeFactura } = require("./src/huella");
const { crearRng, generarFactura, VARIANTES } = require("./src/generador");
const { Almacen } = require("./src/almacen");
const { ALTERACIONES } = require("./src/alteraciones");
const { Metricas } = require("./src/metricas");
const { imprimirReporte } = require("./src/reporte");

const RESULTADO = { INTEGRA: "ÍNTEGRA", ALTERADA: "ALTERADA", NO_ANCLADA: "NO ANCLADA" };

const CONFIG = {
  integras: Number(process.env.E1_INTEGRAS ?? 10000),
  alteradas: Number(process.env.E1_ALTERADAS ?? 1000),
  sinAnclar: Number(process.env.E1_SIN_ANCLAR ?? 200),
  limite: Number(process.env.E1_LIMITE ?? 50),
  semilla: process.env.E1_SEMILLA ?? "voltera-e1",
  tamanoLote: 100,
  concurrencia: Number(process.env.E1_CONCURRENCIA ?? 8),
};
const VERIFICADOR = process.env.E1_VERIFICADOR ?? "http://localhost:8090";
const MAX_INTENTOS = 3;
const GAS_POR_FACTURA = 35000;
const RAIZ = path.join(__dirname, "..", "..");

const fase = (n, titulo) => console.log(`\n\x1b[1;36m[Fase ${n}] ${titulo}\x1b[0m`);
const dato = (texto) => console.log(`  ${texto}`);
const percentil = (ordenados, p) => ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)];
const campoCsv = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function versionCodigo() {
  try {
    const commit = execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: "pipe" }).trim();
    const sucio = execSync("git status --porcelain", { encoding: "utf8", stdio: "pipe" }).trim() !== "";
    return sucio ? `${commit}+cambios` : commit;
  } catch {
    return "desconocido";
  }
}

// gasLimit fijo: Besu falla de forma intermitente con eth_estimateGas mientras importa un bloque.
async function enviarLote(registro, lote, nonce, estadisticas) {
  const gasLimit = 100000 + GAS_POR_FACTURA * lote.length;
  for (let intento = 1; ; intento++) {
    try {
      return await registro.registrarLote(lote.map((f) => f.item), { nonce, gasLimit });
    } catch (e) {
      if (!String(e.message).includes("Internal error") || intento === MAX_INTENTOS) throw e;
      estadisticas.reintentos++;
      await dormir(500);
    }
  }
}

async function anclar(registro, firmante, facturas, metricas, estadisticas) {
  let nonce = await firmante.getNonce();
  const pendientes = [];
  for (let i = 0; i < facturas.length; i += CONFIG.tamanoLote) {
    const lote = facturas.slice(i, i + CONFIG.tamanoLote);
    pendientes.push({ tx: await enviarLote(registro, lote, nonce++, estadisticas), lote });
  }
  const txPorFactura = new Map();
  let gasTotal = 0n;
  for (const { tx, lote } of pendientes) {
    const recibo = await tx.wait();
    if (recibo.status !== 1) throw new Error(`lote revertido: ${tx.hash}`);
    gasTotal += recibo.gasUsed;
    for (const f of lote) txPorFactura.set(f.idNegocio, recibo.hash);
    metricas.fijar("e1_facturas_ancladas", txPorFactura.size);
  }
  return { txPorFactura, gasTotal, transacciones: pendientes.length };
}

// La consulta es idempotente: un 503 se reintenta y queda contado en el resumen.
async function consultar(idNegocio, estadisticas) {
  for (let intento = 1; ; intento++) {
    const t0 = performance.now();
    const r = await fetch(`${VERIFICADOR}/facturas/${idNegocio}/verificacion`);
    if (r.ok) return { respuesta: await r.json(), ms: performance.now() - t0 };
    if (r.status !== 503 || intento === MAX_INTENTOS) {
      throw new Error(`invoice-verifier respondió ${r.status} para ${idNegocio}`);
    }
    estadisticas.reintentos++;
    await dormir(500);
  }
}

async function main() {
  const inicio = Date.now();
  const llave = Buffer.from(process.env.LLAVE_DOCUMENTOS_HEX ?? "", "hex");
  const despliegue = JSON.parse(fs.readFileSync(path.join(RAIZ, "deployments", "e1.json"), "utf8"));
  const [firmante] = await ethers.getSigners();
  const registro = await ethers.getContractAt("IRegistroFacturas", despliegue.RegistroFacturas.address, firmante);

  const metricas = new Metricas();
  metricas.iniciar();
  metricas.fijar("e1_criterio_cumplido", -1);
  for (const [clave, valor] of Object.entries({ alteradas: CONFIG.alteradas, integras: CONFIG.integras, sin_anclar: CONFIG.sinAnclar })) {
    metricas.fijar("e1_objetivo", valor, { grupo: clave });
  }

  fase(1, `Emisión: ${CONFIG.integras + CONFIG.alteradas + CONFIG.sinAnclar + CONFIG.limite} facturas y almacenamiento off-chain cifrado`);
  metricas.fijar("e1_fase", 1);
  const rng = crearRng(CONFIG.semilla);
  const sal = sha256Hex(`sal-${CONFIG.semilla}`);
  const directorio = path.join(__dirname, ".datos");
  const almacen = new Almacen(directorio, llave);

  let n = 0;
  const lote = (cantidad) => Array.from({ length: cantidad }, () => generarFactura(rng, ++n, sal));
  const integras = lote(CONFIG.integras);
  const alteradas = lote(CONFIG.alteradas);
  const sinAnclar = lote(CONFIG.sinAnclar);
  const previas = lote(CONFIG.limite);

  const nombresVariante = Object.keys(VARIANTES);
  const casos = [];
  integras.forEach((f, i) => {
    const tipo = nombresVariante[i % nombresVariante.length];
    const texto = VARIANTES[tipo](f.factura);
    almacen.guardar(f.idNegocio, "json", Buffer.from(texto, "utf8"));
    almacen.guardar(f.idNegocio, "pdf", f.pdf);
    casos.push({ factura: f, caso: "integra", tipo, esperado: RESULTADO.INTEGRA, texto });
  });
  for (const f of [...alteradas, ...sinAnclar]) {
    almacen.guardar(f.idNegocio, "json", Buffer.from(f.texto, "utf8"));
    almacen.guardar(f.idNegocio, "pdf", f.pdf);
  }
  sinAnclar.forEach((f) => casos.push({ factura: f, caso: "sin_anclar", tipo: "sin_anclar", esperado: RESULTADO.NO_ANCLADA }));

  // Límite conocido: el error ocurre antes de calcular la huella, así que se sella el documento equivocado.
  for (const f of previas) {
    const doc = JSON.parse(f.texto);
    doc.totales.cop += 1;
    f.texto = JSON.stringify(doc);
    f.item = { ...f.item, huella: huellaDeFactura(f.texto) };
    almacen.guardar(f.idNegocio, "json", Buffer.from(f.texto, "utf8"));
    almacen.guardar(f.idNegocio, "pdf", f.pdf);
    casos.push({ factura: f, caso: "limite_conocido", tipo: "alteracion_previa_al_hash", esperado: RESULTADO.INTEGRA });
  }
  dato(`Variantes equivalentes en íntegras: ${nombresVariante.join(", ")}`);

  fase(2, `Anclaje en Besu: lotes de ${CONFIG.tamanoLote} firmados por la cuenta registradora`);
  metricas.fijar("e1_fase", 2);
  const inicioAnclaje = Date.now();
  const estadisticas = { reintentos: 0 };
  const anclaje = await anclar(registro, firmante, [...integras, ...alteradas, ...previas], metricas, estadisticas);
  const segundosAnclaje = (Date.now() - inicioAnclaje) / 1000;
  dato(`${anclaje.txPorFactura.size} facturas en ${anclaje.transacciones} transacciones y ${segundosAnclaje.toFixed(0)} s`);

  fase(3, `Alteración: ${CONFIG.alteradas} documentos cambian después del anclaje`);
  metricas.fijar("e1_fase", 3);
  const nombresAlteracion = Object.keys(ALTERACIONES);
  alteradas.forEach((f, i) => {
    const tipo = nombresAlteracion[i % nombresAlteracion.length];
    const otra = alteradas[(i + 1) % alteradas.length];
    ALTERACIONES[tipo]({ idNegocio: f.idNegocio, texto: f.texto, pdf: f.pdf, almacen, otra });
    casos.push({ factura: f, caso: "alterada", tipo, esperado: RESULTADO.ALTERADA });
    metricas.fijar("e1_alteraciones_aplicadas", i + 1);
  });
  dato(`${nombresAlteracion.length} tipos: ${nombresAlteracion.join(", ")}`);

  fase(4, `Verificación: ${casos.length} consultas a invoice-verifier, que lee la copia del nodo 3`);
  metricas.fijar("e1_fase", 4);
  const pendientes = rng.barajar(casos);
  const filas = [];
  const tiempos = [];
  let detectadas = 0;
  let falsosPositivos = 0;
  let noAncladas = 0;

  const trabajador = async () => {
    for (;;) {
      const c = pendientes.pop();
      if (!c) return;
      const { respuesta: r, ms } = await consultar(c.factura.idNegocio, estadisticas);
      tiempos.push(ms);
      const tx = anclaje.txPorFactura.get(c.factura.idNegocio) ?? "";
      filas.push({
        idNegocio: c.factura.idNegocio,
        facturaId: r.evidencia.facturaId,
        caso: c.caso,
        tipo: c.tipo,
        esperado: c.esperado,
        obtenido: r.resultado,
        motivo: r.motivo,
        hashCalculado: r.evidencia.hashCalculado,
        hashCadena: r.evidencia.hashCadena,
        txHash: r.evidencia.txHash,
        txCoincide: r.evidencia.txHash === tx,
        ms: ms.toFixed(2),
        correcto: r.resultado === c.esperado,
      });
      if (c.caso === "alterada" && r.resultado === RESULTADO.ALTERADA) detectadas++;
      if (c.caso === "integra" && r.resultado !== RESULTADO.INTEGRA) falsosPositivos++;
      if (c.caso === "sin_anclar" && r.resultado === RESULTADO.NO_ANCLADA) noAncladas++;
      metricas.sumar("e1_verificadas_total", { caso: c.caso, obtenido: r.resultado });
      metricas.fijar("e1_detectadas", detectadas);
      metricas.fijar("e1_falsos_positivos", falsosPositivos);
      metricas.fijar("e1_no_ancladas_correctas", noAncladas);
    }
  };
  await Promise.all(Array.from({ length: CONFIG.concurrencia }, trabajador));

  fase(5, "Evaluación de criterios");
  metricas.fijar("e1_fase", 5);

  // Control negativo: sin forma canónica, hashear los bytes guardados da falsos positivos.
  const falsosPositivosSinCanonica = casos
    .filter((c) => c.caso === "integra")
    .filter((c) => sha256Hex(Buffer.from(c.texto, "utf8")) !== sha256Hex(Buffer.from(c.factura.texto, "utf8"))).length;
  metricas.fijar("e1_control_sin_canonica_falsos_positivos", falsosPositivosSinCanonica);

  filas.sort((a, b) => a.idNegocio.localeCompare(b.idNegocio));
  const de = (caso) => filas.filter((f) => f.caso === caso);
  const agrupar = (lista) => {
    const out = {};
    for (const f of lista) {
      out[f.tipo] ??= { total: 0, correctas: 0, motivos: {} };
      out[f.tipo].total++;
      if (f.correcto) out[f.tipo].correctas++;
      out[f.tipo].motivos[f.motivo] = (out[f.tipo].motivos[f.motivo] ?? 0) + 1;
    }
    return out;
  };
  const ejemplo = (caso, tipo) => filas.find((f) => f.caso === caso && (!tipo || f.tipo === tipo))?.idNegocio;
  const ordenados = [...tiempos].sort((a, b) => a - b);

  const resumen = {
    fecha: new Date().toISOString(),
    codigo: versionCodigo(),
    red: {
      nombre: network.name,
      chainId: Number((await ethers.provider.getNetwork()).chainId),
      bloqueFinal: await ethers.provider.getBlockNumber(),
    },
    contrato: { nombre: despliegue.RegistroFacturas.contrato, direccion: despliegue.RegistroFacturas.address },
    configuracion: CONFIG,
    huellaDelDataset: sha256Hex([...integras, ...alteradas, ...sinAnclar, ...previas].map((f) => f.item.huella).join("")),
    anclaje: {
      facturas: anclaje.txPorFactura.size,
      transacciones: anclaje.transacciones,
      gasTotal: anclaje.gasTotal.toString(),
      gasPorFactura: Number(anclaje.gasTotal / BigInt(anclaje.txPorFactura.size)),
      segundos: Math.round(segundosAnclaje),
    },
    criterios: {
      deteccion: { obtenido: detectadas, total: CONFIG.alteradas, tasa: detectadas / CONFIG.alteradas, cumple: detectadas === CONFIG.alteradas },
      falsosPositivos: { obtenido: falsosPositivos, total: CONFIG.integras, cumple: falsosPositivos === 0 },
      noAnclada: { obtenido: noAncladas, total: CONFIG.sinAnclar, cumple: noAncladas === CONFIG.sinAnclar },
      evidencia: {
        obtenido: filas.filter((f) => f.txHash !== "" && !f.txCoincide).length,
        total: anclaje.txPorFactura.size,
        cumple: filas.every((f) => f.txHash === "" || f.txCoincide),
      },
    },
    discrepanciasDeVerificacion: filas.filter((f) => f.caso !== "limite_conocido" && !f.correcto).length,
    controlNegativoSinCanonica: { falsosPositivos: falsosPositivosSinCanonica, total: CONFIG.integras },
    limiteConocido: { casos: CONFIG.limite, noDetectadas: de("limite_conocido").filter((f) => f.obtenido === RESULTADO.INTEGRA).length },
    porTipo: { integras: agrupar(de("integra")), alteradas: agrupar(de("alterada")) },
    verificacionMs: { p50: Number(percentil(ordenados, 50).toFixed(2)), p95: Number(percentil(ordenados, 95).toFixed(2)) },
    reintentosPorCadena: estadisticas.reintentos,
    ejemplos: {
      integra: ejemplo("integra", "combinada"),
      alterada1Cop: ejemplo("alterada", "monto_1_cop"),
      alteradaPdf: ejemplo("alterada", "pdf_alterado"),
      sinAnclar: ejemplo("sin_anclar"),
    },
    duracionSegundos: Math.round((Date.now() - inicio) / 1000),
  };

  const destino = path.join(__dirname, "resultados", network.name);
  fs.mkdirSync(destino, { recursive: true });
  const columnas = Object.keys(filas[0]);
  const csv = [columnas.join(","), ...filas.map((f) => columnas.map((c) => campoCsv(f[c])).join(","))].join("\n") + "\n";
  fs.writeFileSync(path.join(destino, "resultados.csv"), csv);
  fs.writeFileSync(path.join(destino, "resumen.json"), JSON.stringify(resumen, null, 2) + "\n");

  const cumple = Object.values(resumen.criterios).every((c) => c.cumple);
  metricas.fijar("e1_criterio_cumplido", cumple ? 1 : 0);
  imprimirReporte(resumen);
  dato(`Evidencias en experimentos/e1-integridad/resultados/${network.name}/`);

  // Prometheus lee cada pocos segundos: se retiene el valor final para que quede en el tablero.
  await dormir(Number(process.env.E1_RETENER_S ?? 12) * 1000);
  metricas.detener();
  if (!cumple) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
