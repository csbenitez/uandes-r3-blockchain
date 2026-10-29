const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EventRegistry", () => {
  let registry, admin, other;
  const hash = ethers.keccak256(ethers.toUtf8Bytes("factura-001.pdf"));

  beforeEach(async () => {
    [admin, other] = await ethers.getSigners();
    registry = await (await ethers.getContractFactory("EventRegistry")).deploy(admin.address);
  });

  it("registra un evento y lo emite", async () => {
    await expect(registry.registerEvent(hash, "FACTURA", "ipfs://x"))
      .to.emit(registry, "EventRegistered")
      .withArgs(1, hash, admin.address, "FACTURA", "ipfs://x", (t) => t > 0);
    const [exists, rec] = await registry.verify(hash);
    expect(exists).to.equal(true);
    expect(rec.issuer).to.equal(admin.address);
  });

  it("rechaza duplicados y hash vacío", async () => {
    await registry.registerEvent(hash, "A", "");
    await expect(registry.registerEvent(hash, "A", "")).to.be.revertedWithCustomError(registry, "AlreadyRegistered");
    await expect(registry.registerEvent(ethers.ZeroHash, "A", "")).to.be.revertedWithCustomError(registry, "EmptyHash");
  });

  it("solo REGISTRAR_ROLE puede registrar", async () => {
    await expect(registry.connect(other).registerEvent(hash, "A", "")).to.be.reverted;
    await registry.grantRole(await registry.REGISTRAR_ROLE(), other.address);
    await registry.connect(other).registerEvent(hash, "A", "");
  });

  it("pausa bloquea registros", async () => {
    await registry.pause();
    await expect(registry.registerEvent(hash, "A", "")).to.be.reverted;
    await registry.unpause();
    await registry.registerEvent(hash, "A", "");
  });
});
