const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const vectores = require("../vectores/vectores.json");
const { canonicalizar, huellaDeFactura, idDeFactura, cuentaSeudonima, DocumentoInvalido } = require("../src/huella");

for (const v of vectores.validos) {
  test(`válido: ${v.nombre}`, () => {
    assert.equal(canonicalizar(v.entrada), v.canonico);
    assert.equal(huellaDeFactura(v.entrada), v.huella);
  });
}

for (const v of vectores.invalidos) {
  test(`inválido: ${v.nombre}`, () => {
    assert.throws(() => canonicalizar(v.entrada), DocumentoInvalido);
  });
}

test("los vectores no dependen de esta implementación para ordenar ni hashear", () => {
  // Resultados escritos a mano: si cambian, cambió la especificación.
  const fijos = {
    claves_ordenadas: '{"a":2,"b":1}',
    nfd_a_nfc: '{"nombre":"José"}',
    orden_utf16: '{"a":3,"é":4,"😀":1,"！":2}',
    barra_escapada: '{"s":"a/b"}',
  };
  for (const [nombre, canonico] of Object.entries(fijos)) {
    const v = vectores.validos.find((x) => x.nombre === nombre);
    assert.equal(v.canonico, canonico);
    const esperado = "0x" + crypto.createHash("sha256").update(canonico, "utf8").digest("hex");
    assert.equal(v.huella, esperado);
  }
});

test("equivalentes producen la misma huella", () => {
  const h = (n) => vectores.validos.find((x) => x.nombre === n).huella;
  assert.equal(h("nfd_a_nfc"), h("nfc_directo"));
  assert.equal(h("nfc_directo"), h("escape_unicode"));
});

test("un cambio de valor produce otra huella", () => {
  assert.notEqual(huellaDeFactura('{"cop":1000}'), huellaDeFactura('{"cop":1001}'));
});

test("identificador y cuenta siguen la especificación", () => {
  const [id] = vectores.identificadores;
  assert.equal(idDeFactura(id.entrada), id.facturaId);
  const [c] = vectores.cuentas;
  assert.equal(cuentaSeudonima(c.nic, c.sal), c.cuenta);
  assert.notEqual(cuentaSeudonima(c.nic, "otra-sal"), c.cuenta);
});

test("no acepta contaminación por __proto__", () => {
  const texto = '{"__proto__":{"x":1},"a":2}';
  assert.equal(canonicalizar(texto), '{"__proto__":{"x":1},"a":2}');
});
