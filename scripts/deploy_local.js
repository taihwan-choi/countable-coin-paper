const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const INITIAL_SUPPLY = 1_000_000; // 1M tokens

  // Deploy CountableCoin
  const CountableCoin = await hre.ethers.getContractFactory("CountableCoin");
  const cnc = await CountableCoin.deploy(INITIAL_SUPPLY);
  await cnc.waitForDeployment();
  console.log("CountableCoin deployed to:", await cnc.getAddress());

  // Deploy StandardToken
  const StandardToken = await hre.ethers.getContractFactory("StandardToken");
  const std = await StandardToken.deploy(INITIAL_SUPPLY);
  await std.waitForDeployment();
  console.log("StandardToken deployed to:", await std.getAddress());

  // Save addresses for other scripts
  const addresses = {
    CountableCoin: await cnc.getAddress(),
    StandardToken: await std.getAddress(),
    deployer: deployer.address,
    network: hre.network.name,
  };

  const outPath = path.join(__dirname, "..", "deployed_addresses.json");
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));
  console.log("Addresses saved to deployed_addresses.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
