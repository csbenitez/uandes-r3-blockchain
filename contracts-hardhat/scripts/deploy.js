const fs = require("fs");
const path = require("path");
const { ethers, artifacts, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Desplegando con", deployer.address, "en", network.name);

  const registry = await (await ethers.getContractFactory("EventRegistry")).deploy(deployer.address);
  await registry.waitForDeployment();
  const registryTx = registry.deploymentTransaction();
  const receipt = await registryTx.wait();

  const token = await (await ethers.getContractFactory("SimpleToken")).deploy(deployer.address);
  await token.waitForDeployment();

  const out = {
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    deployBlock: receipt.blockNumber,
    EventRegistry: {
      address: await registry.getAddress(),
      abi: (await artifacts.readArtifact("EventRegistry")).abi,
    },
    SimpleToken: {
      address: await token.getAddress(),
      abi: (await artifacts.readArtifact("SimpleToken")).abi,
    },
  };

  const dir = path.join(__dirname, "..", "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "besu.json"), JSON.stringify(out, null, 2));
  console.log("EventRegistry:", out.EventRegistry.address, "(bloque", receipt.blockNumber + ")");
  console.log("SimpleToken  :", out.SimpleToken.address);
  console.log("Guardado en deployments/besu.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
