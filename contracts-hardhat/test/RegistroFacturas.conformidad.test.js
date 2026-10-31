// Pruebas de la interfaz IRegistroFacturas. El rol 4 las reutiliza con CONTRATO_REGISTRO=<su contrato>.
const { expect } = require("chai");
const { ethers } = require("hardhat");

const CONTRATO = process.env.CONTRATO_REGISTRO || "RegistroFacturasMinimo";

const b32 = (texto) => ethers.sha256(ethers.toUtf8Bytes(texto));
const item = (id, huella = `huella-${id}`) => ({
  facturaId: b32(id),
  huella: b32(huella),
  cuenta: b32(`cuenta-${id}`),
  periodo: 202610,
  wh: 123456n,
  cop: 98765n,
});

describe(`Conformidad IRegistroFacturas (${CONTRATO})`, () => {
  let registro, registrador, otro;

  beforeEach(async () => {
    [registrador, otro] = await ethers.getSigners();
    registro = await (await ethers.getContractFactory(CONTRATO)).deploy(registrador.address);
  });

  it("devuelve vacío para una factura no anclada", async () => {
    expect(await registro.huellaDe(b32("sin-anclar"))).to.equal(ethers.ZeroHash);
  });

  it("registra un lote, guarda la huella y emite el evento", async () => {
    const a = item("A");
    await expect(registro.registrarLote([a, item("B")]))
      .to.emit(registro, "FacturaAnclada")
      .withArgs(a.facturaId, a.huella, a.cuenta, a.periodo, a.wh, a.cop);
    expect(await registro.huellaDe(a.facturaId)).to.equal(a.huella);
  });

  it("acepta 100 facturas por lote y rechaza vacío o 101", async () => {
    const lote = Array.from({ length: 101 }, (_, i) => item(`F${i}`));
    await registro.registrarLote(lote.slice(0, 100));
    await expect(registro.registrarLote(lote)).to.be.revertedWithCustomError(registro, "LoteInvalido");
    await expect(registro.registrarLote([])).to.be.revertedWithCustomError(registro, "LoteInvalido");
  });

  it("un reintento con la misma huella no falla ni emite de nuevo", async () => {
    await registro.registrarLote([item("A")]);
    await expect(registro.registrarLote([item("A"), item("B")]))
      .to.emit(registro, "FacturaAnclada")
      .withArgs(item("B").facturaId, item("B").huella, item("B").cuenta, 202610, 123456n, 98765n);
    const eventos = await registro.queryFilter(registro.filters.FacturaAnclada(item("A").facturaId));
    expect(eventos.length).to.equal(1);
  });

  it("no permite reemplazar la huella de una factura anclada", async () => {
    await registro.registrarLote([item("A")]);
    await expect(registro.registrarLote([item("A", "otra")]))
      .to.be.revertedWithCustomError(registro, "HuellaDistinta");
    expect(await registro.huellaDe(item("A").facturaId)).to.equal(item("A").huella);
  });

  it("un conflicto revierte el lote completo", async () => {
    await registro.registrarLote([item("A")]);
    await expect(registro.registrarLote([item("B"), item("A", "otra")])).to.be.reverted;
    expect(await registro.huellaDe(item("B").facturaId)).to.equal(ethers.ZeroHash);
  });

  it("rechaza identificador o huella vacíos", async () => {
    await expect(registro.registrarLote([{ ...item("A"), huella: ethers.ZeroHash }]))
      .to.be.revertedWithCustomError(registro, "ItemInvalido");
    await expect(registro.registrarLote([{ ...item("A"), facturaId: ethers.ZeroHash }]))
      .to.be.revertedWithCustomError(registro, "ItemInvalido");
  });

  it("solo el registrador puede escribir", async () => {
    await expect(registro.connect(otro).registrarLote([item("A")]))
      .to.be.revertedWithCustomError(registro, "NoAutorizado");
  });
});
