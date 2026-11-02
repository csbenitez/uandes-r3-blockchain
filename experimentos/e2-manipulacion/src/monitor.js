// Monitor: observa los 4 nodos de forma continua y publica el estado como métricas Prometheus (puerto 9465).
const { Metricas } = require("../../e1-integridad/src/metricas");
const { NODOS, foto } = require("./observador");

const ESTADO = { OK: 0, DIVERGE: 1, CAIDO: 2 };
const TEXTO = ["ok", "DIVERGE", "CAÍDO"];
// Con bloques cada 2 s, más de 8 s sin ninguno es una red detenida y no un simple retraso.
const SEGUNDOS_RED_DETENIDA = 8;

// Función pura: convierte una foto del observador en un estado por nodo.
function clasificar(f, nombres = Object.keys(NODOS)) {
  const estados = {};
  for (const n of nombres) {
    estados[n] = f.caidos.includes(n) ? ESTADO.CAIDO : f.honestos.includes(n) ? ESTADO.OK : ESTADO.DIVERGE;
  }
  return estados;
}

class Monitor {
  constructor({ urls = NODOS, puerto = Number(process.env.E2_PUERTO_METRICAS ?? 9465), intervaloMs = 500 } = {}) {
    this.urls = urls;
    this.intervaloMs = intervaloMs;
    this.metricas = new Metricas(puerto);
    this.extras = []; // alturas antiguas que también se comparan
    this.fase = 0;
    this.ultima = null;
    this.estados = {};
    this.maxAltura = 0;
    this.tUltimoBloque = Date.now();
    this.activo = false;
  }

  fijar(nombre, valor, etiquetas) {
    this.metricas.fijar(nombre, valor, etiquetas);
  }

  iniciar() {
    this.metricas.iniciar();
    this.fijar("e2_fase", this.fase);
    this.activo = true;
    const ciclo = async () => {
      if (!this.activo) return;
      try {
        await this.tick();
      } catch {
        // Un fallo del observador no debe tumbar el experimento; el siguiente ciclo reintenta.
      }
      this.temporizador = setTimeout(ciclo, this.intervaloMs);
    };
    ciclo();
  }

  detener() {
    this.activo = false;
    clearTimeout(this.temporizador);
    this.metricas.detener();
  }

  async tick() {
    const f = await foto(this.urls, this.extras);
    this.ultima = f;
    this.estados = clasificar(f, Object.keys(this.urls));

    const vivas = Object.values(f.alturas).filter((a) => a !== null);
    const alto = vivas.length ? Math.max(...vivas) : this.maxAltura;
    if (alto > this.maxAltura) {
      this.maxAltura = alto;
      this.tUltimoBloque = Date.now();
    }
    this.segundosSinBloque = (Date.now() - this.tUltimoBloque) / 1000;
    this.redDetenida = this.segundosSinBloque > SEGUNDOS_RED_DETENIDA;

    for (const [n, e] of Object.entries(this.estados)) this.fijar("e2_nodo_estado", e, { nodo: n });
    this.fijar("e2_nodos_honestos", f.honestos.length);
    this.fijar("e2_nodos_en_desacuerdo", f.divergentes.length);
    this.fijar("e2_altura_comun", f.comun ?? 0);
    this.fijar("e2_segundos_sin_bloque", Number(this.segundosSinBloque.toFixed(1)));
    this.fijar("e2_red_detenida", this.redDetenida ? 1 : 0);
    this.fijar("e2_fase", this.fase);
  }

  // Línea de estado para la terminal.
  linea() {
    const f = this.ultima;
    if (!f) return "observando…";
    const nodos = Object.entries(this.estados)
      .map(([n, e]) => `${n}:${TEXTO[e]}`)
      .join(" ");
    return `bloque ${f.comun ?? "?"} | ${nodos} | ${this.redDetenida ? "RED DETENIDA" : "produciendo"}`;
  }
}

module.exports = { Monitor, clasificar, ESTADO, TEXTO, SEGUNDOS_RED_DETENIDA };
