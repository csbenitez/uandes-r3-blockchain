// Observador: pide a cada nodo, por su propio RPC, el hash de los mismos bloques y los compara.
// Verdad del consorcio = el hash que repite la mayoría de los nodos que responden.
// Uso:  node experimentos/e2-manipulacion/src/observador.js     (Ctrl+C para salir)
const NODOS = {
  node1: process.env.E2_NODE1 ?? "http://127.0.0.1:8545",
  node2: process.env.E2_NODE2 ?? "http://127.0.0.1:8555",
  node3: process.env.E2_NODE3 ?? "http://127.0.0.1:8565",
  node4: process.env.E2_NODE4 ?? "http://127.0.0.1:8575",
};

async function rpc(url, method, params = [], ms = 1500) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(ms),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

const hex = (n) => "0x" + n.toString(16);

// extras: alturas antiguas que también se comparan (una reescritura de historia no toca solo el último bloque).
async function foto(urls = NODOS, extras = []) {
  const alturas = {};
  await Promise.all(
    Object.entries(urls).map(async ([n, u]) => {
      try {
        alturas[n] = parseInt(await rpc(u, "eth_blockNumber"), 16);
      } catch {
        alturas[n] = null;
      }
    }),
  );
  const vivos = Object.keys(alturas).filter((n) => alturas[n] !== null);
  const caidos = Object.keys(alturas).filter((n) => alturas[n] === null);
  if (!vivos.length) return { alturas, caidos, comun: null, firmas: {}, honestos: [], divergentes: [], mayoria: null };

  const comun = Math.min(...vivos.map((n) => alturas[n]));
  const revisar = [comun, ...extras.filter((b) => b < comun)];
  const firmas = {};
  await Promise.all(
    vivos.map(async (n) => {
      try {
        const hashes = await Promise.all(revisar.map(async (b) => (await rpc(urls[n], "eth_getBlockByNumber", [hex(b), false]))?.hash));
        firmas[n] = hashes.join("|");
      } catch {
        firmas[n] = null;
      }
    }),
  );

  const conteo = {};
  for (const f of Object.values(firmas)) if (f) conteo[f] = (conteo[f] ?? 0) + 1;
  const [mejor, votos] = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const respondieron = Object.keys(firmas).filter((n) => firmas[n]);
  const mayoria = votos * 2 > respondieron.length ? mejor : null;
  const honestos = respondieron.filter((n) => firmas[n] === mayoria);
  const divergentes = respondieron.filter((n) => firmas[n] !== mayoria);
  return { alturas, caidos, comun, firmas, honestos, divergentes, mayoria };
}

module.exports = { NODOS, rpc, foto, hex };

if (require.main === module) {
  (async () => {
    console.log("Comparando hashes de los 4 nodos (Ctrl+C para salir)\n");
    for (;;) {
      const f = await foto();
      const estado = Object.keys(NODOS)
        .map((n) => `${n}:${f.caidos.includes(n) ? "CAÍDO" : f.divergentes.includes(n) ? "DIVERGE" : "ok"}`)
        .join("  ");
      const corto = f.mayoria ? f.mayoria.slice(0, 12) + "…" : "sin mayoría";
      console.log(`${new Date().toISOString().slice(11, 19)}  bloque común ${f.comun}  hash ${corto}  ${estado}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  })();
}
