// Simula liquidaciones de Voltera: genera facturas sintéticas y las ancla en la cadena con registrarLote.
// Uso:  node experimentos/e2-manipulacion/enviar-facturas.js [lotes=3] [facturasPorLote=2] [pausaMs=0]
// Requiere deployments/e1.json (npx hardhat run scripts/deploy-e1.js --network besu, dentro de contracts-hardhat).
const fs = require("fs");
const path = require("path");
const { ethers } = require("../../node_modules/ethers");
const { crearRng, generarFactura } = require("../e1-integridad/src/generador");

const RAIZ = path.join(__dirname, "..", "..");
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const GAS_POR_FACTURA = 35000;

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

  // Base distinta en cada corrida: reenviar la misma factura con la misma huella se omite sin evento.
  let n = Math.floor(Date.now() / 1000) % 9_000_000;
  const rng = crearRng(`e2-${n}`);
  let nonce = await proveedor.getTransactionCount(firmante.address, "pending");

  return {
    dep,
    direccion: firmante.address,
    proveedor,
    // esperar=false devuelve en cuanto la red acepta la tx, sin esperar el bloque.
    async enviar(porLote, { esperar = true } = {}) {
      const facturas = Array.from({ length: porLote }, () => generarFactura(rng, n++, "sal-e2"));
      const t0 = Date.now();
      try {
        const tx = await registro.registrarLote(
          facturas.map((f) => f.item),
          { nonce: nonce++, gasLimit: 100000 + GAS_POR_FACTURA * facturas.length },
        );
        const recibo = esperar ? await tx.wait() : null;
        return { facturas, tx, recibo, ms: Date.now() - t0 };
      } catch (e) {
        // Un envío fallido no debe dejar un hueco de nonce que atasque los siguientes.
        nonce = await proveedor.getTransactionCount(firmante.address, "pending");
        throw e;
      }
    },
  };
}

async function main() {
  const [lotes = 3, porLote = 2, pausaMs = 0] = process.argv.slice(2).map(Number);
  const emisor = await crearEmisor();
  console.log(`Contrato ${emisor.dep.RegistroFacturas.address} | cuenta ${emisor.direccion} | bloque actual ${await emisor.proveedor.getBlockNumber()}`);
  for (let i = 1; i <= lotes; i++) {
    const { facturas, tx, recibo, ms } = await emisor.enviar(porLote);
    console.log(
      `lote ${i}/${lotes} | ${facturas.map((f) => f.idNegocio).join(", ")} | tx ${tx.hash.slice(0, 12)}… | bloque ${recibo.blockNumber} | ${ms} ms`,
    );
    if (pausaMs) await dormir(pausaMs);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { crearEmisor, leerDespliegue };
