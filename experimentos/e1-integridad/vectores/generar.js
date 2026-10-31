// Escribe vectores.json. Los demás lenguajes deben reproducir estos resultados sin calcularlos con Node.
const fs = require("fs");
const path = require("path");
const { canonicalizar, huellaDeFactura, idDeFactura, cuentaSeudonima } = require("../src/huella");

const validos = {
  claves_ordenadas: '{"b":1,"a":2}',
  espacios: ' { "a" : [ 1 , 2 ] ,\n\t"b" : { } } ',
  anidado: '{"z":{"y":1,"x":[{"b":1,"a":2}]},"a":null,"m":true,"n":false}',
  arreglo_conserva_orden: '{"a":[3,1,2]}',
  nfd_a_nfc: '{"nombre":"José"}',
  nfc_directo: '{"nombre":"José"}',
  clave_nfd: '{"José":1}',
  escape_unicode: '{"nombre":"Jos\\u00e9"}',
  escape_sustituto: '{"s":"\\ud83d\\ude00"}',
  orden_utf16: '{"😀":1,"！":2,"a":3,"é":4}',
  control: '{"s":"a\\nb\\t\\"c\\\\\\u0001"}',
  barra_escapada: '{"s":"a\\/b"}',
  negativo: '{"n":-5}',
  entero_maximo: '{"n":9007199254740991}',
  cero: '{"n":0}',
  vacio: "{}",
  arreglo_raiz: "[1,2]",
};

const invalidos = {
  clave_duplicada: '{"a":1,"a":2}',
  clave_duplicada_nfc: '{"José":1,"José":2}',
  decimal: '{"n":1.5}',
  decimal_cero: '{"n":1.0}',
  exponente: '{"n":1e3}',
  menos_cero: '{"n":-0}',
  cero_a_la_izquierda: '{"n":01}',
  fuera_de_rango: '{"n":9007199254740992}',
  bom: '﻿{"a":1}',
  coma_final: '{"a":1,}',
  contenido_extra: '{"a":1} x',
};

const salida = {
  version: 1,
  validos: Object.entries(validos).map(([nombre, entrada]) => ({
    nombre,
    entrada,
    canonico: canonicalizar(entrada),
    huella: huellaDeFactura(entrada),
  })),
  invalidos: Object.entries(invalidos).map(([nombre, entrada]) => ({ nombre, entrada })),
  identificadores: [{ entrada: "FAC-2026-10-0000001", facturaId: idDeFactura("FAC-2026-10-0000001") }],
  cuentas: [{ nic: "NIC-1234567", sal: "sal-de-prueba", cuenta: cuentaSeudonima("NIC-1234567", "sal-de-prueba") }],
};

fs.writeFileSync(path.join(__dirname, "vectores.json"), JSON.stringify(salida, null, 2) + "\n");
console.log(`${salida.validos.length} válidos, ${salida.invalidos.length} inválidos`);
