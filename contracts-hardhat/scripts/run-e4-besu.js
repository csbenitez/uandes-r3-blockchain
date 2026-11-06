const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

const b32 = (texto) =>
  ethers.sha256(ethers.toUtf8Bytes(texto));

async function enviarYEsperar(txPromise) {
  const tx = await txPromise;
  return await tx.wait();
}

async function main() {
  console.log("==========================================");
  console.log(" E4 - VALIDACION SOBRE BESU");
  console.log("==========================================");

  const [deployer] = await ethers.getSigners();

  // --------------------------------------------------
  // Cargar contrato previamente desplegado
  // --------------------------------------------------

  const deploymentPath = path.join(
    __dirname,
    "..",
    "..",
    "deployments",
    "e4-besu.json"
  );

  const deployment = JSON.parse(
    fs.readFileSync(deploymentPath, "utf8")
  );

  const contractAddress =
    deployment.LiquidacionFacturas.address;

  const contrato = await ethers.getContractAt(
    "LiquidacionFacturas",
    contractAddress,
    deployer
  );

  console.log("Contrato :", contractAddress);
  console.log("Admin    :", deployer.address);
  console.log("");

  // --------------------------------------------------
  // Identidades de laboratorio
  // NO usar estas claves en producción.
  // --------------------------------------------------

  const volteraPK = ethers.keccak256(
    ethers.toUtf8Bytes("VOLTERA-E4-LAB")
  );

  const sspdPK = ethers.keccak256(
    ethers.toUtf8Bytes("SSPD-E4-LAB")
  );

  const billingPK = ethers.keccak256(
    ethers.toUtf8Bytes("BILLING-ENGINE-E4-LAB")
  );

  const voltera = new ethers.Wallet(
    volteraPK,
    ethers.provider
  );

  const sspd = new ethers.Wallet(
    sspdPK,
    ethers.provider
  );

  const billingEngine = new ethers.Wallet(
    billingPK,
    ethers.provider
  );

  console.log("Voltera        :", voltera.address);
  console.log("SSPD           :", sspd.address);
  console.log("billing-engine :", billingEngine.address);
  console.log("");

  // --------------------------------------------------
  // Financiar cuentas de laboratorio
  // --------------------------------------------------

  for (const wallet of [
    voltera,
    sspd,
    billingEngine
  ]) {
    const balance =
      await ethers.provider.getBalance(wallet.address);

    if (balance === 0n) {
      await enviarYEsperar(
        deployer.sendTransaction({
          to: wallet.address,
          value: ethers.parseEther("1"),
          gasPrice: 0
        })
      );
    }
  }

  // --------------------------------------------------
  // Roles
  // --------------------------------------------------

  const VOLTERA_ROLE =
    await contrato.VOLTERA_ROLE();

  const SSPD_ROLE =
    await contrato.SSPD_ROLE();

  const REGISTRAR_ROLE =
    await contrato.REGISTRAR_ROLE();

  await enviarYEsperar(
    contrato.grantRole(
      VOLTERA_ROLE,
      voltera.address
    )
  );

  await enviarYEsperar(
    contrato.grantRole(
      SSPD_ROLE,
      sspd.address
    )
  );

  console.log("Roles configurados correctamente.");
  console.log("");

  // --------------------------------------------------
  // Preparar factura
  // --------------------------------------------------

  const sufijo = Date.now().toString();

  const facturaId =
    b32(`FACTURA-E4-BESU-${sufijo}`);

  const ajusteId =
    b32(`AJUSTE-E4-BESU-${sufijo}`);

  const huellaOriginal =
    b32(`HUELLA-ORIGINAL-${sufijo}`);

  const huellaNueva =
    b32(`HUELLA-AJUSTADA-${sufijo}`);

  const item = {
    facturaId,
    huella: huellaOriginal,
    cuenta: b32(`CUENTA-${sufijo}`),
    periodo: 202611,
    wh: 123456n,
    cop: 98765n
  };

  let receipt;

  receipt = await enviarYEsperar(
    contrato.registrarLote(
      [item],
      { gasPrice: 0 }
    )
  );

  console.log(
    "Factura registrada:",
    receipt.hash
  );

  receipt = await enviarYEsperar(
    contrato.proponerAjuste(
      ajusteId,
      facturaId,
      huellaNueva,
      { gasPrice: 0 }
    )
  );

  console.log(
    "Ajuste propuesto  :",
    receipt.hash
  );

  console.log("");

  // ==================================================
  // E4.1
  // SOLO VOLTERA
  // ==================================================

  console.log("E4.1 - UNA SOLA FIRMA");

  const contratoVoltera =
    contrato.connect(voltera);

  receipt = await enviarYEsperar(
    contratoVoltera.aprobarComoVoltera(
      ajusteId,
      { gasPrice: 0 }
    )
  );

  console.log(
    "Firma Voltera     :",
    receipt.hash
  );

  let e41 = "NO VALIDADO";
  let e41Hash = null;

  try {
    // Se envía manualmente para que la tx llegue realmente
    // a Besu aun sabiendo que revertirá.
    const data =
      contrato.interface.encodeFunctionData(
        "anclarAjuste",
        [ajusteId]
      );

    const tx =
      await deployer.sendTransaction({
        to: contractAddress,
        data,
        gasLimit: 500000,
        gasPrice: 0
      });

    e41Hash = tx.hash;

    await tx.wait();

    console.log(
      "ERROR: el ajuste fue aceptado con una firma"
    );
  } catch (error) {
    if (!e41Hash && error.receipt) {
      e41Hash = error.receipt.hash;
    }

    e41 = "REVERTIDO";

    console.log(
      "Resultado          : REVERTIDO [OK]"
    );

    if (e41Hash) {
      console.log(
        "TxHash revertida   :",
        e41Hash
      );
    }
  }

  console.log("");

  // ==================================================
  // E4.2
  // VOLTERA + SSPD
  // ==================================================

  console.log("E4.2 - DOBLE AUTORIZACION");

  const contratoSSPD =
    contrato.connect(sspd);

  receipt = await enviarYEsperar(
    contratoSSPD.aprobarComoSSPD(
      ajusteId,
      { gasPrice: 0 }
    )
  );

  console.log(
    "Firma SSPD        :",
    receipt.hash
  );

  const txAnclaje =
    await contrato.anclarAjuste(
      ajusteId,
      { gasPrice: 0 }
    );

  const receiptAnclaje =
    await txAnclaje.wait();

  console.log(
    "Resultado          : AJUSTE ANCLADO [OK]"
  );

  console.log(
    "TxHash             :",
    receiptAnclaje.hash
  );

  console.log(
    "Bloque             :",
    receiptAnclaje.blockNumber
  );

  const huellaFinal =
    await contrato.huellaDe(facturaId);

  console.log(
    "Huella actualizada :",
    huellaFinal === huellaNueva
      ? "SI [OK]"
      : "NO"
  );

  console.log("");

  // ==================================================
  // E4.3
  // BILLING ENGINE SIN PERMISOS
  // ==================================================

  console.log(
    "E4.3 - BILLING-ENGINE SIN AUTORIZACION"
  );

  let e43 = "NO VALIDADO";
  let e43Hash = null;

  try {
    const otroAjuste =
      b32(`NO-AUTORIZADO-${sufijo}`);

    const data =
      contrato.interface.encodeFunctionData(
        "proponerAjuste",
        [
          otroAjuste,
          facturaId,
          b32(`HUELLA-ILEGAL-${sufijo}`)
        ]
      );

    const tx =
      await billingEngine.sendTransaction({
        to: contractAddress,
        data,
        gasLimit: 500000,
        gasPrice: 0
      });

    e43Hash = tx.hash;

    await tx.wait();

    console.log(
      "ERROR: billing-engine pudo escribir"
    );
  } catch (error) {
    if (!e43Hash && error.receipt) {
      e43Hash = error.receipt.hash;
    }

    e43 = "BLOQUEADO";

    console.log(
      "Resultado          : BLOQUEADO [OK]"
    );

    if (e43Hash) {
      console.log(
        "TxHash revertida   :",
        e43Hash
      );
    }
  }

  console.log("");
  console.log("==========================================");
  console.log(" RESUMEN E4");
  console.log("==========================================");
  console.log("1 firma           :", e41);
  console.log("2 firmas          : AJUSTE ANCLADO");
  console.log("billing-engine    :", e43);
  console.log("Contrato          :", contractAddress);
  console.log("ChainId           : 20261");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});