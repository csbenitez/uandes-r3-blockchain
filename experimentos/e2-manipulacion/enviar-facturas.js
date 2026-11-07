// Simula liquidaciones de Voltera: genera facturas sintéticas y las ancla en la cadena con registrarLote.
// Una ráfaga de N facturas se parte en lotes de hasta MAX_LOTE (lo dice el contrato): 500 facturas = 5 lotes.
// Uso:  node experimentos/e2-manipulacion/enviar-facturas.js [facturas=10] [ciclos=1] [pausaMs=0]
// Requiere deployments/e1.json (npx hardhat run scripts/deploy-e1.js --network besu, dentro de contracts-hardhat).
const fs = require("fs");
const path = require("path");
const { ethers } = require("../../node_modules/ethers");
const { crearRng, generarFactura } = require("../e1-integridad/src/generador");
const { lotear } = require("./src/lotes");

const RAIZ = path.join(__dirname, "..", "..");
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const GAS_POR_FACTURA = 35000;
const MAX_LOTE_RESPALDO = 100;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function llaveDePrueba() {
  const env = fs.readFileSync(path.join(RAIZ, ".env"), "utf8");
  return /^DEPLOYER_PRIVATE_KEY=(0x[0-9a-fA-F]+)/m.exec(env)[1];
}

function leerDespliegue() {
  return JSON.parse(fs.readFileSync(path.join(RAIZ, "deployments", "e1.json"), "utf8"));
}

// Un emisor lleva su propio nonce: envía lotes uno tras otro sin chocar consigo mismo.
async function crearEmisor(rpcUrl = RPC_URL) {
  const dep = leerDespliegue();
  const proveedor = new ethers.JsonRpcProvider(rpcUrl, dep.chainId, { staticNetwork: ethers.Network.from(dep.chainId) });
  const firmante = new ethers.Wallet(llaveDePrueba(), proveedor);
  const registro = new ethers.Contract(dep.RegistroFacturas.address, dep.RegistroFacturas.abi, firmante);

  // El tope de ítems por lote lo fija el contrato; si el ABI no lo expone se usa 100 (lámina 15).
  const maxLote = await registro
    .MAX_LOTE()
    .then(Number)
    .catch(() => MAX_LOTE_RESPALDO);

  // Base distinta en cada corrida: reenviar la misma factura con otra huella revierte (HuellaDistinta).
  // Se usa el reloj en ms: la carga consume menos de 1 id por ms, así una corrida nueva nunca pisa los de otra.
  let n = Date.now();
  const rng = crearRng(`e2-${n}`);
  let nonce = await proveedor.getTransactionCount(firmante.address, "pending");

  const generar = (cantidad) => Array.from({ length: cantidad }, () => generarFactura(rng, n++, "sal-e2"));

  // Envía un lote (≤ maxLote facturas) como una transacción. esperar=false vuelve en cuanto la red acepta la tx.
  async function enviarTrozo(facturas, esperar) {
    try {
      const tx = await registro.registrarLote(
        facturas.map((f) => f.item),
        { nonce: nonce++, gasLimit: 100000 + GAS_POR_FACTURA * facturas.length },
      );
      const recibo = esperar ? await tx.wait() : null;
      return { facturas, tx, recibo };
    } catch (e) {
      // Un envío fallido no debe dejar un hueco de nonce que atasque los siguientes.
      nonce = await proveedor.getTransactionCount(firmante.address, "pending");
      throw e;
    }
  }

  return {
    dep,
    direccion: firmante.address,
    proveedor,
    maxLote,

    // Un solo lote de `porLote` facturas (lote de referencia de los pasos de línea base).
    async enviar(porLote, { esperar = true } = {}) {
      if (porLote > maxLote) throw new Error(`Un lote admite hasta ${maxLote} facturas; usa enviarFacturas(${porLote})`);
      const t0 = Date.now();
      const r = await enviarTrozo(generar(porLote), esperar);
      return { ...r, ms: Date.now() - t0 };
    },

    // Una ráfaga de `total` facturas partida en lotes de maxLote. Las tx salen con nonces consecutivos
    // sin esperar bloque entre ellas; con esperar=true se espera el recibo de todas.
    // Un lote rechazado por el RPC no aborta la ráfaga: se cuenta en `errores` y siguen los demás.
    async enviarFacturas(total, { esperar = true } = {}) {
      const t0 = Date.now();
      const facturas = generar(total);
      const lotes = [];
      let errores = 0;
      for (const trozo of lotear(facturas, maxLote)) {
        try {
          lotes.push(await enviarTrozo(trozo, false));
        } catch {
          errores++;
        }
      }
      if (!lotes.length) throw new Error(`La red rechazó los ${errores} lotes de la ráfaga`);
      if (esperar) {
        const recibos = await Promise.all(lotes.map((l) => l.tx.wait()));
        recibos.forEach((r, i) => (lotes[i].recibo = r));
      }
      return { facturas, lotes, errores, ms: Date.now() - t0 };
    },
  };
}

async function main() {
  const [facturas = 10, ciclos = 1, pausaMs = 0] = process.argv.slice(2).map(Number);
  const emisor = await crearEmisor();
  console.log(
    `Contrato ${emisor.dep.RegistroFacturas.address} | cuenta ${emisor.direccion} | MAX_LOTE ${emisor.maxLote} | bloque actual ${await emisor.proveedor.getBlockNumber()}`,
  );
  for (let c = 1; c <= ciclos; c++) {
    const { lotes, ms } = await emisor.enviarFacturas(facturas);
    lotes.forEach(({ facturas: fs, tx, recibo }, i) => {
      console.log(
        `  ciclo ${c} · lote ${i + 1}/${lotes.length} | ${fs.length} facturas (${fs[0].idNegocio} … ${fs.at(-1).idNegocio}) | tx ${tx.hash.slice(0, 12)}… | bloque ${recibo.blockNumber} | ${recibo.status === 1 ? "ok" : "REVERTIDO"}`,
      );
    });
    const ok = lotes.filter((l) => l.recibo.status === 1).length;
    console.log(`ciclo ${c}/${ciclos}: ${facturas} facturas en ${lotes.length} lotes, ${ok} confirmados, ${ms} ms`);
    if (pausaMs && c < ciclos) await dormir(pausaMs);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { crearEmisor, leerDespliegue };
