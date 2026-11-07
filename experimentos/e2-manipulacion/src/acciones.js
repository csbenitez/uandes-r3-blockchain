// Acciones compartidas por el conductor automático (correr.js) y la terminal guiada (guiado.js).
const { execSync } = require("child_process");
const { ethers } = require("../../../node_modules/ethers");
const { NODOS, rpc } = require("./observador");

// node1 es la entrada del emisor y del observador de referencia: no se apaga.
const TUMBABLES = ["node2", "node3", "node4"];

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const docker = (cmd) => execSync(`docker ${cmd}`, { stdio: "pipe" }).toString().trim();
const altura = async (url = NODOS.node1) => parseInt(await rpc(url, "eth_blockNumber"), 16);

function tumbar(nodo) {
  if (!TUMBABLES.includes(nodo)) throw new Error(`Solo se pueden detener ${TUMBABLES.join(", ")}`);
  docker(`stop ${nodo}`);
}

function levantar(nodo) {
  if (!TUMBABLES.includes(nodo)) throw new Error(`Solo se pueden iniciar ${TUMBABLES.join(", ")}`);
  docker(`start ${nodo}`);
}

// Nodos que Docker tiene detenidos (sirve para restaurar al salir, aunque los haya detenido otra corrida).
function detenidos() {
  const corriendo = docker("ps --format {{.Names}}").split(/\s+/);
  return TUMBABLES.filter((n) => !corriendo.includes(n));
}

function restaurarNodos() {
  for (const n of detenidos()) levantar(n);
}

// Espera hasta que todos los nodos indicados tengan el bloque.
async function esperarBloque(urls, bloque, ms = 10000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    const hs = await Promise.all(urls.map((u) => altura(u).catch(() => -1)));
    if (hs.every((h) => h >= bloque)) return true;
    await dormir(200);
  }
  return false;
}

async function verdadPorNodo(emisor, urls, facturaId) {
  const salida = {};
  for (const [nombre, url] of Object.entries(urls)) {
    const proveedor = new ethers.JsonRpcProvider(url, emisor.dep.chainId, {
      staticNetwork: ethers.Network.from(emisor.dep.chainId),
      batchMaxCount: 1,
    });
    const c = new ethers.Contract(emisor.dep.RegistroFacturas.address, emisor.dep.RegistroFacturas.abi, proveedor);
    try {
      salida[nombre] = await c.huellaDe(facturaId);
    } catch {
      salida[nombre] = "sin respuesta";
    }
    proveedor.destroy();
  }
  return salida;
}

module.exports = { TUMBABLES, dormir, docker, altura, tumbar, levantar, detenidos, restaurarNodos, esperarBloque, verdadPorNodo };
