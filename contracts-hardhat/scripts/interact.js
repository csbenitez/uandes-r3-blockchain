const { ethers } = require("hardhat");
const dep = require("../../deployments/besu.json");

async function main() {
  const [signer] = await ethers.getSigners();
  const registry = new ethers.Contract(dep.EventRegistry.address, dep.EventRegistry.abi, signer);

  const content = `evento-${Date.now()}`;
  const docHash = ethers.keccak256(ethers.toUtf8Bytes(content));
  console.log("Documento:", content, "\nkeccak256:", docHash);

  const tx = await registry.registerEvent(docHash, "DEMO", "off-chain://" + content);
  console.log("tx enviada:", tx.hash);
  const rc = await tx.wait();
  console.log("bloque:", rc.blockNumber, "| gasUsed:", rc.gasUsed.toString(), "| status:", rc.status);

  const [exists, rec] = await registry.verify(docHash);
  console.log("verify ->", exists, { issuer: rec.issuer, timestamp: rec.timestamp.toString(), kind: rec.kind });

  const events = await registry.queryFilter(registry.filters.EventRegistered(), dep.deployBlock);
  console.log("Eventos on-chain desde el despliegue:", events.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
