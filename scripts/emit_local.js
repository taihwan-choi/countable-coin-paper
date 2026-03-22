/**
 * emit_local.js
 * Triggers several TransferWithCD events from alice → bob
 * so the watcher can record them.
 */
const hre = require("hardhat");
const path = require("path");
const fs   = require("fs");

async function main() {
  const addrFile = path.join(__dirname, "..", "deployed_addresses.json");
  const { CountableCoin: cncAddr } =
    JSON.parse(fs.readFileSync(addrFile, "utf8"));

  const signers = await hre.ethers.getSigners();
  const alice = signers[1];
  const bob   = signers[2];

  const CountableCoin = await hre.ethers.getContractFactory("CountableCoin");
  const cnc = CountableCoin.attach(cncAddr);

  const amount = hre.ethers.parseUnits("100", 18);

  console.log("Emitting 5 × TransferWithCD events …");

  for (let i = 1; i <= 5; i++) {
    // Pack a simple counter into a bytes32 countable-data field
    const cd = hre.ethers.zeroPadValue(hre.ethers.toBeHex(i), 32);
    const tx = await cnc.connect(alice).transferWithCD(bob.address, amount, cd);
    const receipt = await tx.wait();
    console.log(`  [${i}/5] tx=${receipt.hash.slice(0,12)}… block=${receipt.blockNumber} gasUsed=${receipt.gasUsed.toString()}`);
  }

  console.log("\nDone. Check watcher.log and GET http://localhost:3000/transfers");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
