// Carga continua de liquidaciones: un lote cada `cadaMs`, sin esperar el bloque, y seguimiento de cada recibo.
// Sirve para ver en Grafana cómo se acumulan los lotes pendientes cuando la red pierde el quórum.
const MAX_PENDIENTES = 30;

class Carga {
  constructor({ emisor, monitor, porLote = 2, cadaMs = 2000 }) {
    this.emisor = emisor;
    this.monitor = monitor;
    this.porLote = porLote;
    this.cadaMs = cadaMs;
    this.pendientes = new Map(); // hash -> instante de envío
    this.confirmados = 0;
    this.errores = 0;
    this.latenciaMs = 0;
    this.activa = false;
    this.publicar();
  }

  get encendida() {
    return this.activa;
  }

  iniciar() {
    if (this.activa) return;
    this.activa = true;
    this.envio = setInterval(() => this.enviarUno(), this.cadaMs);
    this.revision = setInterval(() => this.revisar(), 1000);
  }

  detener() {
    this.activa = false;
    clearInterval(this.envio);
    clearInterval(this.revision);
  }

  async enviarUno() {
    if (this.pendientes.size >= MAX_PENDIENTES) return;
    try {
      const { tx } = await this.emisor.enviar(this.porLote, { esperar: false });
      this.pendientes.set(tx.hash, Date.now());
    } catch {
      this.errores++;
    }
    this.publicar();
  }

  async revisar() {
    for (const [hash, t0] of [...this.pendientes]) {
      const recibo = await this.emisor.proveedor.getTransactionReceipt(hash).catch(() => null);
      if (!recibo) continue;
      this.pendientes.delete(hash);
      this.confirmados += recibo.status === 1 ? 1 : 0;
      this.latenciaMs = Date.now() - t0;
    }
    this.publicar();
  }

  publicar() {
    this.monitor.fijar("e2_lotes_confirmados", this.confirmados);
    this.monitor.fijar("e2_lotes_pendientes", this.pendientes.size);
    this.monitor.fijar("e2_latencia_confirmacion_ms", this.latenciaMs);
    this.monitor.fijar("e2_carga_encendida", this.activa ? 1 : 0);
  }
}

module.exports = { Carga };
