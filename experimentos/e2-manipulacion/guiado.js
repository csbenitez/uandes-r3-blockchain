// E2 guiado: terminal interactiva para provocar la manipulación y las caídas mientras Grafana muestra el efecto.
// Uso:  node experimentos/e2-manipulacion/guiado.js                       menú
//       node experimentos/e2-manipulacion/guiado.js --autopiloto --pausa=8  secuencia completa con pausas
// Exige la red arriba, el contrato desplegado (deploy-e1.js) y Prometheus/Grafana si se quiere grabar el tablero.
const fs = require("fs");
const path = require("path");
const readline = require("readline/promises");
const { NODOS, foto } = require("./src/observador");
const { crearProxy } = require("./src/proxy-mentiroso");
const { Monitor } = require("./src/monitor");
const { Carga } = require("./src/carga");
const { dormir, altura, tumbar, levantar, restaurarNodos, esperarBloque, verdadPorNodo, TUMBABLES } = require("./src/acciones");
const { crearEmisor } = require("./enviar-facturas");

const AUTOPILOTO = process.argv.includes("--autopiloto");
const PAUSA_S = Number((process.argv.find((a) => a.startsWith("--pausa=")) ?? "--pausa=8").split("=")[1]);
const MAX_RECUPERACION_MS = 6 * 60 * 1000;

const c = { cian: "\x1b[1;36m", verde: "\x1b[1;32m", rojo: "\x1b[1;31m", ama: "\x1b[1;33m", gris: "\x1b[90m", fin: "\x1b[0m" };
const titulo = (t) => console.log(`\n${c.cian}${t}${c.fin}`);
const narrar = (t) => console.log(`  ${t}`);
const mirar = (t) => console.log(`  ${c.ama}En Grafana:${c.fin} ${t}`);
const dato = (t) => console.log(`  ${c.verde}▸${c.fin} ${t}`);
const aviso = (t) => console.log(`  ${c.rojo}${t}${c.fin}`);

let ctx; // estado compartido de la sesión

// Espera `seg` segundos mostrando el estado de la red cada 3 s (para que el video muestre qué pasa).
async function esperar(seg, mostrar = true) {
  const fin = Date.now() + seg * 1000;
  let ultimo = 0;
  while (Date.now() < fin) {
    if (mostrar && Date.now() - ultimo >= 3000) {
      console.log(`  ${c.gris}${ctx.monitor.linea()} | lotes ok ${ctx.carga.confirmados} pend ${ctx.carga.pendientes.size}${c.fin}`);
      ultimo = Date.now();
    }
    await dormir(250);
  }
}

// ---------- Pasos ----------
const PASOS = [
  {
    titulo: "Red sana: 4 validadores de acuerdo",
    que: "Se ancla un lote de referencia y se compara el hash del mismo bloque en los 4 nodos.",
    mirar: "'Estado por nodo' con 4 franjas verdes; 'Altura por nodo' con 4 líneas subiendo juntas.",
    async ejecutar() {
      ctx.proxy.mentir(false);
      const base = await ctx.emisor.enviar(2);
      await esperarBloque(Object.values(ctx.monitor.urls), base.recibo.blockNumber);
      const f = await foto(ctx.monitor.urls, [base.recibo.blockNumber]);
      ctx.base = base;
      dato(`lote de referencia en el bloque ${base.recibo.blockNumber}; nodos que coinciden: ${f.honestos.length}/4`);
      if (f.honestos.length !== 4) throw new Error("La línea base no coincide; reinicia la red (taller.ps1 reset) y vuelve a intentar");
      ctx.res.base = { bloque: base.recibo.blockNumber, coinciden4: true };
    },
  },
  {
    titulo: "Encender la carga de liquidaciones",
    que: "Un lote de 2 facturas cada 2 s hacia la red. Mientras corra, se ve si la red sigue confirmando.",
    mirar: "'Lotes confirmados' sube; 'Lotes pendientes' queda en 0-2; 'Latencia' cerca de 4 s.",
    async ejecutar() {
      ctx.carga.iniciar();
      await esperar(12);
      dato(`lotes confirmados: ${ctx.carga.confirmados}, pendientes: ${ctx.carga.pendientes.size}, latencia: ${ctx.carga.latenciaMs} ms`);
    },
  },
  {
    titulo: "Manipulación de 1 de 4: node4 reescribe su libro",
    que: "node4 empieza a contar otro libro (otro hash por bloque y otra respuesta para cada factura). Los otros 3 no cambian.",
    mirar: "'Estado por nodo': node4 pasa a DIVERGE; 'Nodos en desacuerdo' = 1; 'Detección' muestra bloques y ms.",
    async ejecutar() {
      const urls = ctx.monitor.urls;
      const h0 = await altura();
      const conf0 = ctx.carga.confirmados;
      ctx.monitor.extras = [h0];
      ctx.proxy.mentir(true);
      const t0 = Date.now();
      let f;
      do {
        f = await foto(urls, [h0]);
        if (f.divergentes.length || f.caidos.length) break;
        await dormir(100);
      } while (Date.now() - t0 < 30000);
      const ms = Date.now() - t0;
      const bloques = Math.max(...Object.values(f.alturas).filter((a) => a !== null)) - h0;
      ctx.monitor.fijar("e2_deteccion_ms", ms);
      ctx.monitor.fijar("e2_deteccion_bloques", bloques);
      dato(`detectado en ${ms} ms (${bloques} bloque/s después); en desacuerdo: ${f.divergentes.join(", ") || "ninguno"}`);

      const original = ctx.base.facturas[0].item.huella;
      const lecturas = await verdadPorNodo(ctx.emisor, urls, ctx.base.facturas[0].item.facturaId);
      for (const [n, h] of Object.entries(lecturas)) {
        console.log(`    ${n}: huellaDe(factura) = ${h.slice(0, 14)}… ${h === original ? "(coincide con la anclada)" : `${c.rojo}(distinta)${c.fin}`}`);
      }
      const conLaVerdad = Object.keys(lecturas).filter((n) => lecturas[n] === original);
      dato(`la mayoría (${conLaVerdad.length}/4) conserva la huella original: la verdad del consorcio no cambió`);

      await esperar(10);
      const lotes = ctx.carga.confirmados - conf0;
      dato(`lotes confirmados mientras node4 miente: ${lotes}`);
      ctx.res.manipulacion1de4 = {
        detectadoMs: ms,
        detectadoBloques: bloques,
        divergentes: f.divergentes,
        nodosConVerdad: conLaVerdad,
        lotesConfirmados: lotes,
        cumple: bloques <= 1 && conLaVerdad.length >= 3 && lotes > 0,
      };
    },
  },
  {
    titulo: "Restaurar node4",
    que: "node4 vuelve a contar el mismo libro que los demás.",
    mirar: "'Estado por nodo': node4 vuelve a verde; 'Nodos en desacuerdo' = 0.",
    async ejecutar() {
      ctx.proxy.mentir(false);
      ctx.monitor.extras = [];
      const limite = Date.now() + 15000;
      while (Date.now() < limite && ctx.monitor.ultima?.honestos.length !== 4) await dormir(300);
      dato(`nodos de acuerdo: ${ctx.monitor.ultima?.honestos.length ?? "?"}/4`);
    },
  },
  {
    titulo: "Límite, parte 1: se cae 1 de 4 (node4)",
    que: "Se detiene el contenedor node4. Quedan 3 validadores y el quórum es 3: la red debe seguir.",
    mirar: "'Estado por nodo': node4 en CAÍDO; 'Nodos activos' = 3; la altura de los otros 3 sigue subiendo.",
    async ejecutar() {
      const hA = await altura();
      const conf0 = ctx.carga.confirmados;
      tumbar("node4");
      const t0 = Date.now();
      while ((await altura()) <= hA && Date.now() - t0 < 60000) await dormir(300);
      dato(`con 1 caído, la red produjo bloque a los ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      await esperar(12);
      const lotes = ctx.carga.confirmados - conf0;
      dato(`lotes confirmados con 3 de 4: ${lotes}`);
      ctx.res.conUnCaido = { lotesConfirmados: lotes, sigue: lotes > 0 };
    },
  },
  {
    titulo: "Límite, parte 2: se caen 2 de 4 (node4 y node3)",
    que: "Se detiene también node3. Quedan 2 validadores, menos que el quórum de 3: la red prefiere detenerse a avanzar.",
    mirar: "'Estado de la red' pasa a DETENIDA; la altura se congela; 'Lotes pendientes' sube.",
    async ejecutar() {
      const hB = await altura();
      const conf0 = ctx.carga.confirmados;
      tumbar("node3");
      await esperar(25);
      const hC = await altura();
      const lotes = ctx.carga.confirmados - conf0;
      const detenida = hC - hB <= 1 && lotes === 0;
      ctx.pendientesAlCaer = ctx.carga.pendientes.size;
      dato(`altura ${hB} → ${hC}; lotes confirmados: ${lotes}; pendientes: ${ctx.pendientesAlCaer}; red detenida: ${detenida}`);
      ctx.res.conDosCaidos = { alturaAntes: hB, alturaDespues: hC, lotesConfirmados: lotes, pendientes: ctx.pendientesAlCaer, redDetenida: detenida };
      ctx.confirmadosAlCaer = ctx.carga.confirmados;
    },
  },
  {
    titulo: "Recuperación: se restauran node3 y node4",
    que: "Se inician los dos contenedores. El tiempo de recuperación depende de las rondas de QBFT (decenas de segundos a minutos).",
    mirar: "Los nodos pasan a verde; 'Lotes pendientes' baja; 'Recuperación (s)' se llena al confirmar el primer lote.",
    async ejecutar() {
      levantar("node3");
      levantar("node4");
      const t0 = Date.now();
      let ultimo = 0;
      let recuperado = false;
      while (Date.now() - t0 < MAX_RECUPERACION_MS) {
        if (ctx.carga.confirmados > (ctx.confirmadosAlCaer ?? 0)) {
          recuperado = true;
          break;
        }
        if (Date.now() - ultimo >= 15000) {
          console.log(`  ${c.gris}${Math.round((Date.now() - t0) / 1000)} s | ${ctx.monitor.linea()} | pendientes ${ctx.carga.pendientes.size}${c.fin}`);
          ultimo = Date.now();
        }
        await dormir(500);
      }
      const seg = Math.round((Date.now() - t0) / 1000);
      ctx.monitor.fijar("e2_recuperacion_s", recuperado ? seg : -1);
      dato(recuperado ? `la red retomó y confirmó lotes a los ${seg} s` : `${c.rojo}no se recuperó en ${seg} s${c.fin}`);
      await esperar(10);
      ctx.res.recuperacionS = recuperado ? seg : null;
      cerrarExperimento();
    },
  },
];

function cerrarExperimento() {
  const r = ctx.res;
  r.cumple = Boolean(r.manipulacion1de4?.cumple && r.conUnCaido?.sigue && r.conDosCaidos?.redDetenida && r.recuperacionS !== null);
  ctx.monitor.fijar("e2_criterio_cumplido", r.cumple ? 1 : 0);
  ctx.monitor.fijar("e2_fase", 8);
  ctx.monitor.fase = 8;
  ctx.carga.detener();
  titulo("Resumen de E2");
  const m = r.manipulacion1de4;
  narrar(`1 de 4 manipulado: detección en ${m.detectadoBloques} bloque/s (${m.detectadoMs} ms), verdad en ${m.nodosConVerdad.length}/4 nodos, ${m.lotesConfirmados} lotes confirmados → ${m.cumple ? "CUMPLE" : "NO CUMPLE"}`);
  narrar(`1 de 4 caído: ${r.conUnCaido.lotesConfirmados} lotes confirmados → ${r.conUnCaido.sigue ? "la red sigue" : "NO siguió"}`);
  narrar(`2 de 4 caídos: red detenida = ${r.conDosCaidos.redDetenida}, ${r.conDosCaidos.pendientes} lotes pendientes; recuperación en ${r.recuperacionS ?? "no"} s`);
  console.log(`\n  ${r.cumple ? c.verde + "E2 CUMPLE" : c.rojo + "E2 NO CUMPLE"}${c.fin}`);
  const dir = path.join(__dirname, "resultados");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "guiado.json"), JSON.stringify({ fecha: new Date().toISOString(), ...r }, null, 2));
  narrar(`Evidencia: experimentos/e2-manipulacion/resultados/guiado.json`);
}

async function correrPaso(i) {
  const p = PASOS[i];
  ctx.monitor.fase = i + 1;
  ctx.monitor.fijar("e2_fase", i + 1);
  titulo(`[Paso ${i + 1}/${PASOS.length}] ${p.titulo}`);
  narrar(p.que);
  mirar(p.mirar);
}

async function ejecutarPaso(i) {
  await correrPaso(i);
  await PASOS[i].ejecutar();
}

// ---------- Modos ----------
async function modoGuiado(rl) {
  for (let i = 0; i < PASOS.length; i++) {
    await correrPaso(i);
    const r = (await rl.question(`\n  ${c.gris}Enter para ejecutar el paso, 's' para salir al menú: ${c.fin}`)).trim().toLowerCase();
    if (r === "s") return;
    await PASOS[i].ejecutar();
  }
}

async function autopiloto() {
  titulo(`Autopiloto: ${PASOS.length} pasos, ${PAUSA_S} s de pausa entre cada uno`);
  for (let i = 0; i < PASOS.length; i++) {
    await ejecutarPaso(i);
    if (i < PASOS.length - 1) await esperar(PAUSA_S);
  }
}

async function manual(rl) {
  const ayuda = `
  a) node4 reescribe su libro    b) node4 vuelve a ser honesto
  c) tumbar un nodo (${TUMBABLES.join("/")})   d) levantar un nodo
  e) carga de liquidaciones on/off   f) restaurar todo
  g) estado                          v) volver`;
  for (;;) {
    console.log(ayuda);
    const o = (await rl.question("  acción> ")).trim().toLowerCase();
    try {
      if (o === "v") return;
      else if (o === "a") (ctx.proxy.mentir(true), dato("node4 miente"));
      else if (o === "b") (ctx.proxy.mentir(false), dato("node4 honesto"));
      else if (o === "c" || o === "d") {
        const n = (await rl.question(`  nodo (${TUMBABLES.join("/")})> `)).trim();
        o === "c" ? tumbar(n) : levantar(n);
        dato(`${n} ${o === "c" ? "detenido" : "iniciado"}`);
      } else if (o === "e") {
        ctx.carga.encendida ? ctx.carga.detener() : ctx.carga.iniciar();
        dato(`carga ${ctx.carga.encendida ? "encendida" : "apagada"}`);
      } else if (o === "f") (await restaurar(), dato("todo restaurado"));
      else if (o === "g") dato(`${ctx.monitor.linea()} | lotes ok ${ctx.carga.confirmados} pend ${ctx.carga.pendientes.size}`);
    } catch (e) {
      aviso(e.message);
    }
  }
}

async function restaurar() {
  ctx.proxy.mentir(false);
  ctx.carga.detener();
  restaurarNodos();
}

let saliendo = false;
async function salir(codigo = 0) {
  if (saliendo) return;
  saliendo = true;
  console.log("\n  Restaurando: node4 honesto, carga apagada, nodos detenidos vuelven a iniciar…");
  try {
    await restaurar();
    ctx.monitor.detener();
    await ctx.proxy.detener();
  } catch (e) {
    aviso(`No se pudo restaurar todo: ${e.message}. Revisa con: docker ps`);
  }
  process.exit(codigo);
}

async function main() {
  const proxy = crearProxy();
  await proxy.iniciar();
  const monitor = new Monitor({ urls: { ...NODOS, node4: proxy.url } });
  monitor.iniciar();
  const emisor = await crearEmisor();
  const carga = new Carga({ emisor, monitor });
  ctx = { proxy, monitor, emisor, carga, res: {} };

  titulo("E2 · Manipulación del libro (modo guiado)");
  narrar("Métricas en http://localhost:9465/metrics  |  Grafana: http://localhost:3001 (tablero 'E2 · Manipulación del libro')");
  await dormir(1500);
  narrar(monitor.linea());

  process.on("SIGINT", () => salir(130));
  if (AUTOPILOTO) {
    await autopiloto();
    return salir(ctx.res.cumple ? 0 : 1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on("SIGINT", () => salir(130));
  for (;;) {
    console.log(`\n  ${c.cian}Menú${c.fin}\n  1) Modo guiado (paso a paso)\n  2) Autopiloto (secuencia completa)\n  3) Acciones manuales\n  4) Estado\n  q) Salir y restaurar`);
    const o = (await rl.question("  opción> ")).trim().toLowerCase();
    if (o === "1") await modoGuiado(rl).catch((e) => aviso(e.message));
    else if (o === "2") await autopiloto().catch((e) => aviso(e.message));
    else if (o === "3") await manual(rl);
    else if (o === "4") dato(`${monitor.linea()} | lotes ok ${carga.confirmados} pend ${carga.pendientes.size}`);
    else if (o === "q") return salir(0);
  }
}

main().catch(async (e) => {
  console.error(`\nE2 guiado falló: ${e.message}`);
  if (ctx) await salir(1);
  else process.exit(1);
});
