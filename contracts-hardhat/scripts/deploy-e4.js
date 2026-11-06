const fs = require("fs");
const path = require("path");
const { ethers, artifacts, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("==========================================");
  console.log(" E4 - DEPLOY LIQUIDACION FACTURAS");
  console.log("==========================================");
  console.log("Red      :", network.name);
  console.log("Deployer :", deployer.address);

  const factory =
    await ethers.getContractFactory("LiquidacionFacturas");

  // En esta etapa el deployer representa settlement-ledger/registrador.
  const contrato = await factory.deploy(deployer.address);

  await contrato.waitForDeployment();

  const address = await contrato.getAddress();
  const deployTx = contrato.deploymentTransaction();
  const receipt = await deployTx.wait();

  const chainId = Number(
    (await ethers.provider.getNetwork()).chainId
  );

  console.log("");
  console.log("LiquidacionFacturas desplegado");
  console.log("Address    :", address);
  console.log("TxHash     :", deployTx.hash);
  console.log("Block      :", receipt.blockNumber);
  console.log("ChainId    :", chainId);

  const out = {
    experiment: "E4-autorizacion",
    network: network.name,
    chainId,
    deployer: deployer.address,
    LiquidacionFacturas: {
      address,
      deployTxHash: deployTx.hash,
      deployBlock: receipt.blockNumber,
      abi: (
        await artifacts.readArtifact("LiquidacionFacturas")
      ).abi,
    },
  };

  const dir = path.join(
    __dirname,
    "..",
    "..",
    "deployments"
  );

  fs.mkdirSync(dir, { recursive: true });

  const output = path.join(
    dir,
    "e4-besu.json"
  );

  fs.writeFileSync(
    output,
    JSON.stringify(out, null, 2)
  );

  console.log("");
  console.log("Evidencia guardada en:");
  console.log("deployments/e4-besu.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});