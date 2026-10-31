// Alteraciones aplicadas después del anclaje. Salvo las dos últimas, simulan a alguien con acceso a la llave:
// descifra, cambia y vuelve a cifrar, para que quien detecte sea la huella y no AES-GCM.

function reescribir(ctx, cambiar) {
  const doc = JSON.parse(ctx.texto);
  cambiar(doc);
  ctx.almacen.guardar(ctx.idNegocio, "json", Buffer.from(JSON.stringify(doc), "utf8"));
}

function reescribirTexto(ctx, cambiar) {
  const nuevo = cambiar(ctx.texto);
  if (nuevo === ctx.texto) throw new Error(`alteración sin efecto en ${ctx.idNegocio}`);
  ctx.almacen.guardar(ctx.idNegocio, "json", Buffer.from(nuevo, "utf8"));
}

const ALTERACIONES = {
  monto_1_cop: (ctx) => reescribir(ctx, (d) => { d.totales.cop += 1; }),
  consumo_1_wh: (ctx) => reescribir(ctx, (d) => { d.lineas[0].wh += 1; }),
  periodo: (ctx) => reescribir(ctx, (d) => { d.periodo = "2026-09"; }),
  version_tarifa: (ctx) => reescribir(ctx, (d) => { d.tarifa.version = "2026-09-v1"; }),
  raiz_lecturas: (ctx) => reescribir(ctx, (d) => {
    const fin = d.raizLecturas.at(-1) === "0" ? "1" : "0";
    d.raizLecturas = d.raizLecturas.slice(0, -1) + fin;
  }),
  linea_eliminada: (ctx) => reescribir(ctx, (d) => { d.lineas.length > 1 ? d.lineas.pop() : d.lineas.splice(0, 1); }),
  linea_duplicada: (ctx) => reescribir(ctx, (d) => { d.lineas.push({ ...d.lineas[0] }); }),
  lineas_reordenadas: (ctx) => reescribir(ctx, (d) => { d.lineas.push({ concepto: "ajuste", cop: 0, wh: 0 }); d.lineas.reverse(); }),
  nombre_homoglifo: (ctx) => reescribir(ctx, (d) => { d.cliente.nombre = d.cliente.nombre.replace(/[aeo]/, (c) => ({ a: "а", e: "е", o: "о" })[c]); }),
  campo_extra: (ctx) => reescribir(ctx, (d) => { d.descuentoSecreto = 1; }),
  sustitucion: (ctx) => ctx.almacen.guardar(ctx.idNegocio, "json", Buffer.from(ctx.otra.texto, "utf8")),
  clave_duplicada: (ctx) => reescribirTexto(ctx, (t) => t.replace('{"version"', '{"totales":{"cop":1,"wh":1},"version"')),
  decimal_no_canonico: (ctx) => reescribirTexto(ctx, (t) => t.replace(/"cop":(-?\d+)/, '"cop":$1.0')),
  pdf_alterado: (ctx) => ctx.almacen.guardar(ctx.idNegocio, "pdf", Buffer.concat([ctx.pdf, Buffer.from("x")])),
  documento_eliminado: (ctx) => ctx.almacen.eliminar(ctx.idNegocio, "json"),
  cifrado_sin_llave: (ctx) => ctx.almacen.corromper(ctx.idNegocio, "json"),
};

module.exports = { ALTERACIONES };
