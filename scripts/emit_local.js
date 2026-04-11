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
    // Pack a 44-byte countable-data payload
    const accountCode = 1001;
    const bookingDate = 20250101;
    const taxCode = 10;
    const documentHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`doc${i}`));
    const cd = hre.ethers.concat([
      hre.ethers.zeroPadValue(hre.ethers.toBeHex(accountCode), 4),
      hre.ethers.zeroPadValue(hre.ethers.toBeHex(bookingDate), 4),
      hre.ethers.zeroPadValue(hre.ethers.toBeHex(taxCode), 4),
      documentHash,
    ]);
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
