// Publica el avance del experimento en formato Prometheus para verlo en Grafana mientras corre.
const http = require("http");

const clave = (nombre, etiquetas = {}) => {
  const partes = Object.entries(etiquetas).map(([k, v]) => `${k}="${v}"`);
  return partes.length ? `${nombre}{${partes.join(",")}}` : nombre;
};

class Metricas {
  constructor(puerto = Number(process.env.E1_PUERTO_METRICAS ?? 9464)) {
    this.puerto = puerto;
    this.valores = new Map();
  }

  fijar(nombre, valor, etiquetas) {
    this.valores.set(clave(nombre, etiquetas), valor);
  }

  sumar(nombre, etiquetas) {
    const k = clave(nombre, etiquetas);
    this.valores.set(k, (this.valores.get(k) ?? 0) + 1);
  }

  texto() {
    return [...this.valores].map(([k, v]) => `${k} ${v}`).join("\n") + "\n";
  }

  iniciar() {
    this.servidor = http.createServer((_, res) => {
      res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
      res.end(this.texto());
    });
    this.servidor.listen(this.puerto, "0.0.0.0");
  }

  detener() {
    this.servidor?.close();
  }
}

module.exports = { Metricas };
