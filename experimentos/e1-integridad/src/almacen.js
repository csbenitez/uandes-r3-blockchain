// Almacenamiento off-chain local con AES-256-GCM. Sustituye al servicio de objetos cifrado de las láminas.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const LARGO_NONCE = 12;
const LARGO_ETIQUETA = 16;

class DocumentoIlegible extends Error {
  constructor(motivo) {
    super(motivo);
    this.motivo = motivo;
  }
}

class Almacen {
  constructor(directorio, llave) {
    if (llave.length !== 32) throw new Error("la llave debe tener 32 bytes");
    this.directorio = directorio;
    this.llave = llave;
    fs.mkdirSync(directorio, { recursive: true });
  }

  ruta(id, extension) {
    return path.join(this.directorio, `${id}.${extension}.enc`);
  }

  guardar(id, extension, datos) {
    const nonce = crypto.randomBytes(LARGO_NONCE);
    const cifrador = crypto.createCipheriv("aes-256-gcm", this.llave, nonce);
    const cuerpo = Buffer.concat([cifrador.update(datos), cifrador.final()]);
    fs.writeFileSync(this.ruta(id, extension), Buffer.concat([nonce, cifrador.getAuthTag(), cuerpo]));
  }

  leer(id, extension) {
    let crudo;
    try {
      crudo = fs.readFileSync(this.ruta(id, extension));
    } catch {
      throw new DocumentoIlegible("documento_ausente");
    }
    try {
      const nonce = crudo.subarray(0, LARGO_NONCE);
      const etiqueta = crudo.subarray(LARGO_NONCE, LARGO_NONCE + LARGO_ETIQUETA);
      const descifrador = crypto.createDecipheriv("aes-256-gcm", this.llave, nonce);
      descifrador.setAuthTag(etiqueta);
      return Buffer.concat([descifrador.update(crudo.subarray(LARGO_NONCE + LARGO_ETIQUETA)), descifrador.final()]);
    } catch {
      throw new DocumentoIlegible("cifrado_invalido");
    }
  }

  // Simula a un atacante sin la llave: cambia un byte del objeto cifrado.
  corromper(id, extension) {
    const ruta = this.ruta(id, extension);
    const crudo = fs.readFileSync(ruta);
    crudo[crudo.length - 1] ^= 0x01;
    fs.writeFileSync(ruta, crudo);
  }

  eliminar(id, extension) {
    fs.rmSync(this.ruta(id, extension));
  }
}

module.exports = { Almacen, DocumentoIlegible };
