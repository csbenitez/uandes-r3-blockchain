require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "../.env" });

const deployerKey =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0x8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Besu 25.x soporta Cancun, pero "paris" evita PUSH0/MCOPY y funciona en cualquier red EVM.
      evmVersion: "paris",
    },
  },
  networks: {
    besu: {
      url: process.env.RPC_URL || "http://127.0.0.1:8545",
      chainId: 20261,
      accounts: [deployerKey],
      gasPrice: 0,
    },
  },
};
