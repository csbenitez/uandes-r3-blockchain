// Generador reproducible de facturas sintéticas: misma semilla, mismas facturas.
const crypto = require("crypto");
const { serializar, cuentaSeudonima, idDeFactura, huellaDeFactura, sha256Hex } = require("./huella");

const NOMBRES = ["Ana María Peña", "José Ángel Núñez", "Lucía Muñoz Sáenz", "Andrés Gómez Ibáñez", "María Inés Rodríguez", "Óscar Darío Cañón"];
const CALLES = ["Calle 26 # 13-48", "Carrera 7 # 40-62", "Avenida Boyacá # 80-11", "Calle 100 # 19-54"];
const CIUDADES = ["Bogotá", "Medellín", "Bucaramanga", "Cúcuta", "Popayán"];
const COMUNIDADES = ["Comunidad Solar Chapinero", "Comunidad Energética Laureles", "Comunidad Solar Ciudad Jardín"];

function crearRng(semilla) {
  let s = crypto.createHash("sha256").update(String(semilla)).digest().readUInt32LE(0);
  // mulberry32
  const siguiente = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    entero: (min, max) => min + Math.floor(siguiente() * (max - min + 1)),
    elegir: (lista) => lista[Math.floor(siguiente() * lista.length)],
    barajar: (lista) => {
      const out = [...lista];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(siguiente() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

function pdfSintetico(idNegocio, totalCop) {
  // No es un PDF real: solo aporta bytes para probar la regla pdfSha256.
  return Buffer.from(`%PDF-1.4 sintetico\n${idNegocio}\nTotal COP ${totalCop}\n%%EOF\n`, "utf8");
}

function generarFactura(rng, n, sal) {
  const idNegocio = `FAC-2026-10-${String(n).padStart(7, "0")}`;
  const nic = `NIC-${rng.entero(1000000, 9999999)}`;
  const precioRed = rng.entero(700, 950);

  const lineas = [];
  const agregar = (concepto, wh, cop) => lineas.push({ concepto, cop, wh });
  const whRed = rng.entero(80000, 400000);
  agregar("red", whRed, Math.round((whRed * precioRed) / 1000));
  if (rng.entero(0, 1)) {
    const wh = rng.entero(1000, 30000);
    agregar("excedente", wh, -Math.round((wh * 300) / 1000));
  }
  if (rng.entero(0, 1)) {
    const wh = rng.entero(1000, 20000);
    agregar("compra_p2p", wh, Math.round((wh * 500) / 1000));
  }
  if (rng.entero(0, 1)) {
    const wh = rng.entero(1000, 20000);
    agregar("venta_p2p", wh, -Math.round((wh * 400) / 1000));
  }

  const totalWh = lineas.reduce((s, l) => s + l.wh, 0);
  const totalCop = lineas.reduce((s, l) => s + l.cop, 0);
  const pdf = pdfSintetico(idNegocio, totalCop);

  const factura = {
    version: 1,
    idNegocio,
    periodo: "2026-10",
    emitidaEn: "2026-11-01T05:00:00Z",
    cliente: {
      nic,
      nombre: rng.elegir(NOMBRES),
      direccion: `${rng.elegir(CALLES)}, ${rng.elegir(CIUDADES)}`,
    },
    comunidad: rng.elegir(COMUNIDADES),
    tarifa: { version: "2026-10-v1", huella: sha256Hex("tarifa-2026-10-v1") },
    raizLecturas: sha256Hex(`lote-${rng.entero(1, 500)}`),
    lineas,
    totales: { cop: totalCop, wh: totalWh },
    pdfSha256: sha256Hex(pdf),
  };

  // Emisión: billing-engine serializa una vez y calcula la huella antes de persistir.
  const texto = JSON.stringify(factura);
  const item = {
    facturaId: idDeFactura(idNegocio),
    huella: huellaDeFactura(texto),
    cuenta: cuentaSeudonima(nic, sal),
    periodo: 202610,
    wh: BigInt(totalWh),
    cop: BigInt(totalCop),
  };
  return { idNegocio, factura, texto, pdf, item };
}

// Variantes con la misma información: su huella canónica debe coincidir con la original.
function ordenInverso(v) {
  if (Array.isArray(v)) return v.map(ordenInverso);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort().reverse().map((k) => [k, ordenInverso(v[k])]));
  }
  return v;
}

const escaparNoAscii = (t) =>
  t.replace(/[^\x00-\x7f]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

const VARIANTES = {
  original: (f) => JSON.stringify(f),
  orden_claves: (f) => JSON.stringify(ordenInverso(f)),
  espacios: (f) => JSON.stringify(f, null, 2),
  forma_nfd: (f) => JSON.stringify(f).normalize("NFD"),
  escape_unicode: (f) => escaparNoAscii(JSON.stringify(f)),
  combinada: (f) => escaparNoAscii(JSON.stringify(ordenInverso(f), null, 1).normalize("NFD")),
};

module.exports = { crearRng, generarFactura, VARIANTES, serializar };
