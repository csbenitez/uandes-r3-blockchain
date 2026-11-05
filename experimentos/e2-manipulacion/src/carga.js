// Carga constante de liquidaciones: cada `cadaMs` se emite una ráfaga de `facturasPorCiclo` facturas,
// partida en lotes de MAX_LOTE (500 facturas = 5 transacciones registrarLote). No espera el bloque:
// cada lote queda pendiente hasta que aparece su recibo. Así se ve en Grafana cómo crece el backlog
// cuando la red pierde el quórum y cómo se vacía al recuperarlo.
const { lotesPara } = require("./lotes");

// Tope de lotes sin confirmar. Con la red detenida la carga deja de emitir al llegar aquí
// (cuenta el ciclo como omitido) para no inundar el txpool de Besu: 60 lotes = 6000 facturas.
const MAX_PENDIENTES = 60;
// Ventana para calcular facturas confirmadas por segundo.
const VENTANA_MS = 10000;

class Carga {
  constructor({ emisor, monitor, facturasPorCiclo = 500, cadaMs = 5000 }) {
    this.emisor = emisor;
    this.monitor = monitor;
    this.facturasPorCiclo = facturasPorCiclo;
    this.cadaMs = cadaMs;
    this.lotesPorCiclo = lotesPara(facturasPorCiclo, emisor.maxLote);
    this.pendientes = new Map(); // hash -> { t0, n }
    this.confirmados = 0; // lotes confirmados (nombre que usan los pasos de guiado.js)
    this.facturasConfirmadas = 0;
    this.revertidos = 0;
    this.errores = 0; // lotes que el RPC rechazó al enviarlos
    this.ciclos = 0;
    this.ciclosOmitidos = 0;
    this.latenciaMs = 0;
    this.facturasPorSegundo = 0;
    this.historial = []; // [instante, facturas confirmadas] dentro de la ventana
    this.enviando = false;
    this.revisando = false;
    this.activa = false;
    this.publicar();
  }

  get encendida() {
    return this.activa;
  }

  get facturasPendientes() {
    let s = 0;
    for (const { n } of this.pendientes.values()) s += n;
    return s;
  }

  iniciar() {
    if (this.activa) return;
    this.activa = true;
    this.cicloUno();
    this.envio = setInterval(() => this.cicloUno(), this.cadaMs);
    this.revision = setInterval(() => this.revisar(), 1000);
    this.publicar();
  }

  detener() {
    this.activa = false;
    clearInterval(this.envio);
    clearInterval(this.revision);
    this.publicar();
  }

  // Una ráfaga. Se omite si la anterior aún se está enviando o si el backlog no cabe bajo el tope.
  async cicloUno() {
    if (this.enviando || this.pendientes.size + this.lotesPorCiclo > MAX_PENDIENTES) {
      this.ciclosOmitidos++;
      this.publicar();
      return;
    }
    this.enviando = true;
    try {
      const { lotes, errores } = await this.emisor.enviarFacturas(this.facturasPorCiclo, { esperar: false });
      const t0 = Date.now();
      for (const { tx, facturas } of lotes) this.pendientes.set(tx.hash, { t0, n: facturas.length });
      this.errores += errores;
      this.ciclos++;
    } catch {
      this.errores += this.lotesPorCiclo;
    } finally {
      this.enviando = false;
    }
    this.publicar();
  }

  // Busca el recibo de cada lote pendiente (en paralelo) y actualiza los contadores.
  async revisar() {
    if (this.revisando) return;
    this.revisando = true;
    try {
      const entradas = [...this.pendientes];
      const recibos = await Promise.all(
        entradas.map(([hash]) => this.emisor.proveedor.getTransactionReceipt(hash).catch(() => null)),
      );
      const ahora = Date.now();
      recibos.forEach((recibo, i) => {
        if (!recibo) return;
        const [hash, { t0, n }] = entradas[i];
        this.pendientes.delete(hash);
        if (recibo.status === 1) {
          this.confirmados++;
          this.facturasConfirmadas += n;
          this.historial.push([ahora, n]);
        } else {
          this.revertidos++;
        }
        this.latenciaMs = ahora - t0;
      });
      this.historial = this.historial.filter(([t]) => ahora - t <= VENTANA_MS);
      const enVentana = this.historial.reduce((s, [, n]) => s + n, 0);
      this.facturasPorSegundo = Math.round(enVentana / (VENTANA_MS / 1000));
    } finally {
      this.revisando = false;
    }
    this.publicar();
  }

  // Resumen para la terminal y los JSON de evidencia.
  resumen() {
    return {
      facturasPorCiclo: this.facturasPorCiclo,
      cadaS: this.cadaMs / 1000,
      maxLote: this.emisor.maxLote,
      lotesPorCiclo: this.lotesPorCiclo,
      ciclos: this.ciclos,
      ciclosOmitidos: this.ciclosOmitidos,
      lotesConfirmados: this.confirmados,
      facturasConfirmadas: this.facturasConfirmadas,
      lotesRevertidos: this.revertidos,
      lotesRechazados: this.errores,
    };
  }

  linea() {
    return `facturas ok ${this.facturasConfirmadas} pend ${this.facturasPendientes} (${this.facturasPorSegundo}/s) | lotes ok ${this.confirmados} pend ${this.pendientes.size}`;
  }

  publicar() {
    const m = this.monitor;
    m.fijar("e2_lotes_confirmados", this.confirmados);
    m.fijar("e2_lotes_pendientes", this.pendientes.size);
    m.fijar("e2_lotes_revertidos", this.revertidos);
    m.fijar("e2_lotes_rechazados", this.errores);
    m.fijar("e2_facturas_confirmadas", this.facturasConfirmadas);
    m.fijar("e2_facturas_pendientes", this.facturasPendientes);
    m.fijar("e2_facturas_por_segundo", this.facturasPorSegundo);
    m.fijar("e2_facturas_por_ciclo", this.facturasPorCiclo);
    m.fijar("e2_lotes_por_ciclo", this.lotesPorCiclo);
    m.fijar("e2_ciclos_omitidos", this.ciclosOmitidos);
    m.fijar("e2_latencia_confirmacion_ms", this.latenciaMs);
    m.fijar("e2_carga_encendida", this.activa ? 1 : 0);
  }
}

module.exports = { Carga, MAX_PENDIENTES };
