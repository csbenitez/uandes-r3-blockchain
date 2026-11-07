// Nodo que miente: proxy delante del RPC de un nodo. Honesto por defecto; al activarlo reescribe lo que
// ese nodo cuenta del libro (hash y stateRoot de cada bloque, y las lecturas eth_call de contratos).
// No toca su disco ni su participación en el consenso: simula "un nodo cuya copia dice otra cosa".
const http = require("http");
const crypto = require("crypto");

const falso = (h) => "0x" + crypto.createHash("sha256").update("falso" + h).digest("hex");

function crearProxy({ puerto = 8585, destino = "http://127.0.0.1:8575" } = {}) {
  let miente = false;

  function reescribir(peticion, respuesta) {
    if (!miente || !respuesta || respuesta.result == null) return respuesta;
    const r = respuesta.result;
    if (peticion.method.startsWith("eth_getBlockBy") && r.hash) {
      r.hash = falso(r.hash);
      r.stateRoot = falso(r.stateRoot);
    } else if (peticion.method === "eth_call" && typeof r === "string" && r.length === 66) {
      respuesta.result = "0x" + "0".repeat(64);
    }
    return respuesta;
  }

  async function reenviar(peticion) {
    const r = await fetch(destino, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(peticion) });
    return r.json();
  }

  const servidor = http.createServer((req, res) => {
    if (req.url === "/_mentir" || req.url === "/_honesto") {
      miente = req.url === "/_mentir";
      res.end(JSON.stringify({ miente }));
      return;
    }
    let cuerpo = "";
    req.on("data", (d) => (cuerpo += d));
    req.on("end", async () => {
      try {
        const p = JSON.parse(cuerpo);
        const salida = Array.isArray(p)
          ? await Promise.all(p.map(async (x) => reescribir(x, await reenviar(x))))
          : reescribir(p, await reenviar(p));
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(salida));
      } catch (e) {
        res.statusCode = 502;
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  });

  return {
    url: `http://127.0.0.1:${puerto}`,
    iniciar: () => new Promise((ok) => servidor.listen(puerto, "127.0.0.1", ok)),
    detener: () => new Promise((ok) => servidor.close(ok)),
    mentir: (v = true) => {
      miente = v;
    },
  };
}

module.exports = { crearProxy };

if (require.main === module) {
  const p = crearProxy();
  p.iniciar().then(() => console.log(`Proxy en ${p.url} -> nodo 4. Activar: curl ${p.url}/_mentir | volver: curl ${p.url}/_honesto`));
}
