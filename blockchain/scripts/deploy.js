const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const addr = await usdc.getAddress();

  console.log("\n══════════════════════════════════");
  console.log("  MockUSDC deployed at:", addr);
  console.log("  Set USDC_ADDRESS=" + addr + " in .env");
  console.log("══════════════════════════════════\n");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
