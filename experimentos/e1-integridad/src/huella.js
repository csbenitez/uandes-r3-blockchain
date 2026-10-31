// Canonicalización y huella de facturas. La regla completa está en docs/voltera/especificacion-huella.md.
const crypto = require("crypto");

class DocumentoInvalido extends Error {}

// JSON.parse descarta claves duplicadas y acepta decimales; este lector estricto los rechaza.
function parsearEstricto(texto) {
  let i = 0;
  const fallo = (msg) => {
    throw new DocumentoInvalido(`${msg} en posición ${i}`);
  };
  const saltarEspacios = () => {
    while (" \t\n\r".includes(texto[i]) && i < texto.length) i++;
  };

  function valor() {
    saltarEspacios();
    const c = texto[i];
    if (c === "{") return objeto();
    if (c === "[") return arreglo();
    if (c === '"') return cadena();
    if (c === "-" || (c >= "0" && c <= "9")) return numero();
    for (const [lit, v] of [["true", true], ["false", false], ["null", null]]) {
      if (texto.startsWith(lit, i)) {
        i += lit.length;
        return v;
      }
    }
    fallo("valor inesperado");
  }

  function objeto() {
    const out = {};
    const vistas = new Set();
    i++;
    saltarEspacios();
    if (texto[i] === "}") {
      i++;
      return out;
    }
    for (;;) {
      saltarEspacios();
      if (texto[i] !== '"') fallo("se esperaba una clave");
      const clave = cadena().normalize("NFC");
      if (vistas.has(clave)) fallo(`clave duplicada "${clave}"`);
      vistas.add(clave);
      saltarEspacios();
      if (texto[i++] !== ":") fallo("se esperaba ':'");
      Object.defineProperty(out, clave, { value: valor(), enumerable: true, writable: true, configurable: true });
      saltarEspacios();
      const sep = texto[i++];
      if (sep === "}") return out;
      if (sep !== ",") fallo("se esperaba ',' o '}'");
    }
  }

  function arreglo() {
    const out = [];
    i++;
    saltarEspacios();
    if (texto[i] === "]") {
      i++;
      return out;
    }
    for (;;) {
      out.push(valor());
      saltarEspacios();
      const sep = texto[i++];
      if (sep === "]") return out;
      if (sep !== ",") fallo("se esperaba ',' o ']'");
    }
  }

  function cadena() {
    const inicio = i;
    i++;
    while (i < texto.length && texto[i] !== '"') i += texto[i] === "\\" ? 2 : 1;
    if (i >= texto.length) fallo("cadena sin cerrar");
    i++;
    try {
      return JSON.parse(texto.slice(inicio, i));
    } catch {
      fallo("cadena inválida");
    }
  }

  function numero() {
    const m = /^-?(0|[1-9][0-9]*)/.exec(texto.slice(i, i + 32));
    if (!m) fallo("número inválido");
    i += m[0].length;
    if (/[.eE]/.test(texto[i] ?? "")) fallo("solo se aceptan enteros");
    if (m[0] === "-0") fallo("-0 no es canónico");
    const n = Number(m[0]);
    if (!Number.isSafeInteger(n)) fallo("entero fuera de rango");
    return n;
  }

  if (texto.charCodeAt(0) === 0xfeff) fallo("BOM no permitido");
  const v = valor();
  saltarEspacios();
  if (i !== texto.length) fallo("contenido después del documento");
  return v;
}

function serializar(v) {
  if (v === null || typeof v === "boolean") return JSON.stringify(v);
  if (typeof v === "string") return JSON.stringify(v.normalize("NFC"));
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v) || Object.is(v, -0)) throw new DocumentoInvalido(`número no canónico: ${v}`);
    return String(v);
  }
  if (Array.isArray(v)) return `[${v.map(serializar).join(",")}]`;
  if (typeof v === "object") {
    const pares = new Map();
    for (const k of Object.keys(v)) {
      const nk = k.normalize("NFC");
      if (pares.has(nk)) throw new DocumentoInvalido(`clave duplicada "${nk}"`);
      pares.set(nk, v[k]);
    }
    // El orden por defecto de JS compara unidades de código UTF-16, como pide RFC 8785.
    const claves = [...pares.keys()].sort();
    return `{${claves.map((k) => `${JSON.stringify(k)}:${serializar(pares.get(k))}`).join(",")}}`;
  }
  throw new DocumentoInvalido(`tipo no admitido: ${typeof v}`);
}

const sha256Hex = (datos) => "0x" + crypto.createHash("sha256").update(datos).digest("hex");

const canonicalizar = (textoJson) => serializar(parsearEstricto(textoJson));

const huellaDeFactura = (textoJson) => sha256Hex(Buffer.from(canonicalizar(textoJson), "utf8"));

const idDeFactura = (idNegocio) => sha256Hex(Buffer.from(idNegocio, "utf8"));

const cuentaSeudonima = (nic, sal) => "0x" + crypto.createHmac("sha256", sal).update(nic, "utf8").digest("hex");

module.exports = { DocumentoInvalido, parsearEstricto, serializar, canonicalizar, huellaDeFactura, idDeFactura, cuentaSeudonima, sha256Hex };
