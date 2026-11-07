// Loteo de facturas: el contrato rechaza lotes de más de MAX_LOTE ítems (RegistroFacturasMinimo.sol),
// así que una ráfaga de N facturas se parte en ceil(N / MAX_LOTE) transacciones registrarLote.
function lotear(lista, tam) {
  if (!Number.isInteger(tam) || tam < 1) throw new Error(`Tamaño de lote inválido: ${tam}`);
  const trozos = [];
  for (let i = 0; i < lista.length; i += tam) trozos.push(lista.slice(i, i + tam));
  return trozos;
}

// Cuántos lotes produce una ráfaga de `total` facturas.
const lotesPara = (total, tam) => Math.ceil(total / tam);

module.exports = { lotear, lotesPara };
