/**
 * setup_local.js
 * - Initialises the SQLite database (events.db)
 * - Distributes some CNC/STD tokens to test accounts
 */
const hre = require("hardhat");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

async function main() {
  // ── Load deployed addresses ───────────────────────────────────────────────
  const addrFile = path.join(__dirname, "..", "deployed_addresses.json");
  if (!fs.existsSync(addrFile)) {
    throw new Error("deployed_addresses.json not found – run deploy_local.js first");
  }
  const { CountableCoin: cncAddr, StandardToken: stdAddr } =
    JSON.parse(fs.readFileSync(addrFile, "utf8"));

  // ── Setup SQLite DB ───────────────────────────────────────────────────────
  const dbPath = path.join(__dirname, "..", "events.db");
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS transfers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_hash     TEXT    NOT NULL,
      block_num   INTEGER NOT NULL,
      from_addr   TEXT    NOT NULL,
      to_addr     TEXT    NOT NULL,
      amount      TEXT    NOT NULL,
      cd          TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gas_stats (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      label       TEXT    NOT NULL,
      gas_used    INTEGER NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log("SQLite DB initialised:", dbPath);
  db.close();

  // ── Distribute tokens to test accounts ───────────────────────────────────
  const signers = await hre.ethers.getSigners();
  const [deployer, alice, bob] = signers;

  const CountableCoin = await hre.ethers.getContractFactory("CountableCoin");
  const cnc = CountableCoin.attach(cncAddr);

  const StandardToken = await hre.ethers.getContractFactory("StandardToken");
  const std = StandardToken.attach(stdAddr);

  const amount = hre.ethers.parseUnits("10000", 18);

  // Send CNC to alice and bob
  await (await cnc.connect(deployer).transfer(alice.address, amount)).wait();
  await (await cnc.connect(deployer).transfer(bob.address, amount)).wait();
  console.log(`Transferred 10,000 CNC → alice (${alice.address})`);
  console.log(`Transferred 10,000 CNC → bob   (${bob.address})`);

  // Send STD to alice and bob
  await (await std.connect(deployer).transfer(alice.address, amount)).wait();
  await (await std.connect(deployer).transfer(bob.address, amount)).wait();
  console.log(`Transferred 10,000 STD → alice (${alice.address})`);
  console.log(`Transferred 10,000 STD → bob   (${bob.address})`);

  console.log("\nSetup complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
