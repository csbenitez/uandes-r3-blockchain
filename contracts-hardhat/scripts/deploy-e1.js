// Despliega el registro de facturas de E1 y escribe deployments/e1.json, sin tocar besu.json.
// CONTRATO_REGISTRO permite desplegar otra implementación de IRegistroFacturas.
const fs = require("fs");
const path = require("path");
const { ethers, artifacts, network } = require("hardhat");

async function main() {
  const nombre = process.env.CONTRATO_REGISTRO || "RegistroFacturasMinimo";
  const [deployer] = await ethers.getSigners();

  const registro = await (await ethers.getContractFactory(nombre)).deploy(deployer.address);
  await registro.waitForDeployment();
  const recibo = await registro.deploymentTransaction().wait();

  const salida = {
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    deployBlock: recibo.blockNumber,
    RegistroFacturas: {
      contrato: nombre,
      address: await registro.getAddress(),
      abi: (await artifacts.readArtifact(nombre)).abi,
    },
  };

  const destino = path.join(__dirname, "..", "..", "deployments", "e1.json");
  fs.writeFileSync(destino, JSON.stringify(salida, null, 2));
  console.log(`${nombre} en ${salida.RegistroFacturas.address}, bloque ${recibo.blockNumber}, red ${network.name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
