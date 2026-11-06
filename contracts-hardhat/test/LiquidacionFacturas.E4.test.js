const { expect } = require("chai");
const { ethers } = require("hardhat");

const b32 = (texto) => ethers.sha256(ethers.toUtf8Bytes(texto));

const crearItem = (id, huella) => ({
  facturaId: b32(id),
  huella: b32(huella),
  cuenta: b32(`cuenta-${id}`),
  periodo: 202610,
  wh: 123456n,
  cop: 98765n,
});

describe("E4 - Autorizacion y doble firma", function () {
  let contrato;

  let registrador;
  let voltera;
  let sspd;
  let billingEngine;

  let VOLTERA_ROLE;
  let SSPD_ROLE;
  let REGISTRAR_ROLE;

  const facturaId = b32("FACTURA-E4-001");
  const huellaOriginal = b32("HUELLA-ORIGINAL");
  const huellaNueva = b32("HUELLA-AJUSTADA");
  const ajusteId = b32("AJUSTE-E4-001");

  beforeEach(async function () {
    [
      registrador,
      voltera,
      sspd,
      billingEngine
    ] = await ethers.getSigners();

    const Factory =
      await ethers.getContractFactory("LiquidacionFacturas");

    contrato = await Factory.deploy(
      registrador.address
    );

    await contrato.waitForDeployment();

    VOLTERA_ROLE =
      await contrato.VOLTERA_ROLE();

    SSPD_ROLE =
      await contrato.SSPD_ROLE();

    REGISTRAR_ROLE =
      await contrato.REGISTRAR_ROLE();

    // Asignación de roles
    await contrato.grantRole(
      VOLTERA_ROLE,
      voltera.address
    );

    await contrato.grantRole(
      SSPD_ROLE,
      sspd.address
    );

    // Factura inicial
    const item = crearItem(
      "FACTURA-E4-001",
      "HUELLA-ORIGINAL"
    );

    await contrato
      .connect(registrador)
      .registrarLote([item]);

    // Propuesta de ajuste
    await contrato
      .connect(registrador)
      .proponerAjuste(
        ajusteId,
        facturaId,
        huellaNueva
      );
  });

  // --------------------------------------------------
  // E4.1
  // Una sola firma NO debe ejecutar el ajuste
  // --------------------------------------------------

  it("E4.1 - una firma de Voltera no es suficiente", async function () {

    await contrato
      .connect(voltera)
      .aprobarComoVoltera(ajusteId);

    await expect(
      contrato
        .connect(registrador)
        .anclarAjuste(ajusteId)
    )
      .to.be.revertedWithCustomError(
        contrato,
        "DobleFirmaRequerida"
      );

    // La huella debe seguir siendo la original
    expect(
      await contrato.huellaDe(facturaId)
    ).to.equal(huellaOriginal);
  });

  // --------------------------------------------------
  // E4.2
  // Voltera + SSPD permiten ejecutar el ajuste
  // --------------------------------------------------

  it("E4.2 - Voltera y SSPD autorizan el ajuste", async function () {

    await contrato
      .connect(voltera)
      .aprobarComoVoltera(ajusteId);

    await contrato
      .connect(sspd)
      .aprobarComoSSPD(ajusteId);

    await expect(
      contrato
        .connect(registrador)
        .anclarAjuste(ajusteId)
    )
      .to.emit(
        contrato,
        "AjusteAnclado"
      )
      .withArgs(
        ajusteId,
        facturaId,
        huellaOriginal,
        huellaNueva
      );

    // La huella vigente debe ser la nueva
    expect(
      await contrato.huellaDe(facturaId)
    ).to.equal(huellaNueva);

    const ajuste =
      await contrato.obtenerAjuste(ajusteId);

    expect(
      ajuste.firmanteVoltera
    ).to.equal(voltera.address);

    expect(
      ajuste.firmanteSSPD
    ).to.equal(sspd.address);

    expect(
      ajuste.ejecutado
    ).to.equal(true);
  });

  // --------------------------------------------------
  // E4.3
  // billing-engine no tiene permisos blockchain
  // --------------------------------------------------

  it("E4.3 - billing-engine no puede escribir en el contrato", async function () {

    const otroAjuste =
      b32("AJUSTE-NO-AUTORIZADO");

    await expect(
      contrato
        .connect(billingEngine)
        .proponerAjuste(
          otroAjuste,
          facturaId,
          b32("HUELLA-ILEGAL")
        )
    )
      .to.be.revertedWithCustomError(
        contrato,
        "AccessControlUnauthorizedAccount"
      )
      .withArgs(
        billingEngine.address,
        REGISTRAR_ROLE
      );
  });

  // --------------------------------------------------
  // E4.4
  // Una misma identidad no cuenta como dos partes
  // --------------------------------------------------

  it("E4.4 - una misma identidad no puede representar Voltera y SSPD", async function () {

    // Forzamos el escenario:
    // Voltera recibe también SSPD_ROLE.
    await contrato.grantRole(
      SSPD_ROLE,
      voltera.address
    );

    await contrato
      .connect(voltera)
      .aprobarComoVoltera(ajusteId);

    await expect(
      contrato
        .connect(voltera)
        .aprobarComoSSPD(ajusteId)
    )
      .to.be.revertedWithCustomError(
        contrato,
        "FirmaDuplicada"
      );
  });
});