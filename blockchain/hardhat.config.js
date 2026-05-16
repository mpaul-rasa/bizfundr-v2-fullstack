require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: { version: "0.8.20", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: {
    localhost: { url: "http://127.0.0.1:8545" },
    amoy: { url: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology", accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [], chainId: 80002 },
    polygon: { url: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com", accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [], chainId: 137 },
  },
};
