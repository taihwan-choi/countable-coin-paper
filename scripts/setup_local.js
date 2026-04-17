/**
 * setup_local.js
 * - Initialises the SQLite database (events.db)
 * - Distributes some CNC/STD tokens to test accounts
 * - Configures CountableCoin demo policy state
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
  const { CountableCoin: cncAddr, StandardToken: stdAddr, MinimalCountableCoin: minAddr, CountableCoinWrapper: wrapAddr } =
    JSON.parse(fs.readFileSync(addrFile, "utf8"));

  // ── Setup SQLite DB ───────────────────────────────────────────────────────
  const dbPath = path.join(__dirname, "..", "events.db");
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS transfers (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_hash         TEXT    NOT NULL,
      block_num       INTEGER NOT NULL,
      source_contract TEXT    NOT NULL,
      event_type      TEXT    NOT NULL,
      from_addr       TEXT    NOT NULL,
      to_addr         TEXT    NOT NULL,
      amount          TEXT    NOT NULL,
      account_code    INTEGER,
      booking_date    INTEGER,
      tax_code        INTEGER,
      document_hash   TEXT,
      raw_cd          TEXT,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gas_stats (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      label       TEXT    NOT NULL,
      gas_used    INTEGER NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const transferColumns = db.prepare("PRAGMA table_info(transfers)").all().map((col) => col.name);
  const addColumn = (name, ddl) => {
    if (!transferColumns.includes(name)) {
      db.exec(`ALTER TABLE transfers ADD COLUMN ${name} ${ddl}`);
    }
  };
  addColumn("source_contract", "TEXT NOT NULL DEFAULT 'Unknown'");
  addColumn("event_type", "TEXT NOT NULL DEFAULT 'Transfer'");
  addColumn("account_code", "INTEGER");
  addColumn("booking_date", "INTEGER");
  addColumn("tax_code", "INTEGER");
  addColumn("document_hash", "TEXT");
  addColumn("raw_cd", "TEXT");

  console.log("SQLite DB initialised:", dbPath);
  db.close();

  // ── Distribute tokens to test accounts ───────────────────────────────────
  const signers = await hre.ethers.getSigners();
  const [deployer, alice, bob] = signers;

  const CountableCoin = await hre.ethers.getContractFactory("CountableCoin");
  const cnc = CountableCoin.attach(cncAddr);

  const MinimalCountableCoin = await hre.ethers.getContractFactory("MinimalCountableCoin");
  const min = MinimalCountableCoin.attach(minAddr);

  const CountableCoinWrapper = await hre.ethers.getContractFactory("CountableCoinWrapper");
  const wrap = CountableCoinWrapper.attach(wrapAddr);

  const StandardToken = await hre.ethers.getContractFactory("StandardToken");
  const std = StandardToken.attach(stdAddr);

  const amount = hre.ethers.parseUnits("10000", 18);

  // Send CNC to alice and bob
  await (await cnc.connect(deployer).transfer(alice.address, amount)).wait();
  await (await cnc.connect(deployer).transfer(bob.address, amount)).wait();
  console.log(`Transferred 10,000 CNC → alice (${alice.address})`);
  console.log(`Transferred 10,000 CNC → bob   (${bob.address})`);

  // Send MIN to alice and bob
  await (await min.connect(deployer).transfer(alice.address, amount)).wait();
  await (await min.connect(deployer).transfer(bob.address, amount)).wait();
  console.log(`Transferred 10,000 MIN → alice (${alice.address})`);
  console.log(`Transferred 10,000 MIN → bob   (${bob.address})`);

  // Send WRAP to alice and bob
  await (await wrap.connect(deployer).transfer(alice.address, amount)).wait();
  await (await wrap.connect(deployer).transfer(bob.address, amount)).wait();
  console.log(`Transferred 10,000 WRAP → alice (${alice.address})`);
  console.log(`Transferred 10,000 WRAP → bob   (${bob.address})`);

  // Send STD to alice and bob
  await (await std.connect(deployer).transfer(alice.address, amount)).wait();
  await (await std.connect(deployer).transfer(bob.address, amount)).wait();
  console.log(`Transferred 10,000 STD → alice (${alice.address})`);
  console.log(`Transferred 10,000 STD → bob   (${bob.address})`);

  // ── Policy setup for CountableCoin demo ─────────────────────────────────
  console.log("\nSetting up CountableCoin demo policy...");

  await (await cnc.connect(deployer).setAllowlist(alice.address, true)).wait();
  await (await cnc.connect(deployer).setAllowlist(bob.address, true)).wait();
  console.log("Allowlist configured: alice, bob");

  await (await cnc.connect(deployer).setAllowedAccountCode(1001, true)).wait();
  console.log("Allowed account code configured: 1001");

  await (await cnc.connect(deployer).setAllowedTaxCode(10, true)).wait();
  console.log("Allowed tax code configured: 10");

  await (await cnc.connect(deployer).setAuthorizedSigner(alice.address, true)).wait();
  console.log("Authorized signer configured: alice");

  const addresses = {
    CountableCoin: cncAddr,
    StandardToken: stdAddr,
    CountableCoinWrapper: wrapAddr,
    MinimalCountableCoin: minAddr,
    deployer: deployer.address,
    network: hre.network.name,
    demoPolicy: {
      allowlisted: [alice.address, bob.address],
      accountCode: 1001,
      taxCode: 10,
      authorizedSigner: alice.address,
    },
  };
  fs.writeFileSync(addrFile, JSON.stringify(addresses, null, 2));
  console.log("Demo policy defaults saved to deployed_addresses.json");

  console.log("\nSetup complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
