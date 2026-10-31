const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { crearRng, generarFactura, VARIANTES } = require("../src/generador");
const { Almacen } = require("../src/almacen");
const { ALTERACIONES } = require("../src/alteraciones");
const { Metricas } = require("../src/metricas");
const { huellaDeFactura, sha256Hex, DocumentoInvalido } = require("../src/huella");

function escenario() {
  const directorio = fs.mkdtempSync(path.join(os.tmpdir(), "e1-prueba-"));
  const almacen = new Almacen(directorio, crypto.randomBytes(32));
  const rng = crearRng("prueba");
  const nueva = (n) => {
    const f = generarFactura(rng, n, "sal");
    almacen.guardar(f.idNegocio, "json", Buffer.from(f.texto, "utf8"));
    almacen.guardar(f.idNegocio, "pdf", f.pdf);
    return f;
  };
  return { almacen, nueva };
}

test("el generador es reproducible", () => {
  const a = generarFactura(crearRng("s"), 1, "sal");
  const b = generarFactura(crearRng("s"), 1, "sal");
  assert.equal(a.texto, b.texto);
  assert.notEqual(a.texto, generarFactura(crearRng("t"), 1, "sal").texto);
});

test("los totales caben en el contrato", () => {
  const rng = crearRng("totales");
  for (let i = 1; i <= 2000; i++) assert.ok(generarFactura(rng, i, "sal").item.cop >= 0n);
});

test("cada variante conserva la huella y cambia los bytes", () => {
  const f = generarFactura(crearRng("v"), 1, "sal");
  for (const [nombre, variante] of Object.entries(VARIANTES)) {
    const texto = variante(f.factura);
    assert.equal(huellaDeFactura(texto), f.item.huella, nombre);
    if (nombre !== "original") assert.notEqual(sha256Hex(texto), sha256Hex(f.texto), nombre);
  }
});

test("el almacén recupera lo guardado y rechaza un archivo corrupto", () => {
  const { almacen, nueva } = escenario();
  const f = nueva(1);
  assert.equal(almacen.leer(f.idNegocio, "json").toString("utf8"), f.texto);
  almacen.corromper(f.idNegocio, "json");
  assert.throws(() => almacen.leer(f.idNegocio, "json"), /cifrado_invalido/);
});

for (const [nombre, alterar] of Object.entries(ALTERACIONES)) {
  test(`la alteración cambia lo almacenado: ${nombre}`, () => {
    const { almacen, nueva } = escenario();
    const f = nueva(1);
    const otra = nueva(2);
    alterar({ idNegocio: f.idNegocio, texto: f.texto, pdf: f.pdf, almacen, otra });

    if (nombre === "pdf_alterado") {
      assert.notEqual(sha256Hex(almacen.leer(f.idNegocio, "pdf")), f.factura.pdfSha256);
      return;
    }
    if (nombre === "documento_eliminado") return assert.throws(() => almacen.leer(f.idNegocio, "json"), /documento_ausente/);
    if (nombre === "cifrado_sin_llave") return assert.throws(() => almacen.leer(f.idNegocio, "json"), /cifrado_invalido/);

    const texto = almacen.leer(f.idNegocio, "json").toString("utf8");
    if (nombre === "clave_duplicada" || nombre === "decimal_no_canonico") {
      return assert.throws(() => huellaDeFactura(texto), DocumentoInvalido);
    }
    assert.notEqual(huellaDeFactura(texto), f.item.huella);
  });
}

test("las métricas se exponen en formato Prometheus", () => {
  const m = new Metricas(0);
  m.fijar("e1_fase", 2);
  m.sumar("e1_verificadas_total", { caso: "integra" });
  m.sumar("e1_verificadas_total", { caso: "integra" });
  assert.equal(m.texto(), 'e1_fase 2\ne1_verificadas_total{caso="integra"} 2\n');
});
