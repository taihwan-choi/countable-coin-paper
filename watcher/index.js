/**
 * watcher/index.js
 * Listens for Transfer and TransferWithCD events on localhost
 * and writes them to the SQLite DB (events.db).
 */
require("dotenv").config();
const { ethers } = require("ethers");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const ADDR_FILE = path.join(__dirname, "..", "deployed_addresses.json");
const DB_FILE   = path.join(__dirname, "..", "events.db");
const ABI_DIR   = path.join(__dirname, "..", "artifacts", "contracts");

function loadABI(contractName) {
  const file = path.join(ABI_DIR, `${contractName}.sol`, `${contractName}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8")).abi;
}

async function main() {
  if (!fs.existsSync(ADDR_FILE)) {
    console.error("deployed_addresses.json not found");
    process.exit(1);
  }

  const { CountableCoin: cncAddr, StandardToken: stdAddr } =
    JSON.parse(fs.readFileSync(ADDR_FILE, "utf8"));

  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const db = new Database(DB_FILE);

  const insertTx = db.prepare(`
    INSERT INTO transfers (
      tx_hash, block_num, source_contract, event_type,
      from_addr, to_addr, amount,
      account_code, booking_date, tax_code, document_hash, raw_cd
    ) VALUES (
      @tx_hash, @block_num, @source_contract, @event_type,
      @from_addr, @to_addr, @amount,
      @account_code, @booking_date, @tax_code, @document_hash, @raw_cd
    )
  `);

  // ── CountableCoin – TransferWithCD ────────────────────────────────────────
  const cncAbi = loadABI("CountableCoin");
  const cnc = new ethers.Contract(cncAddr, cncAbi, provider);

  cnc.on(
    "TransferWithCD",
    (from, to, value, accountCode, bookingDate, taxCode, documentHash, event) => {
      const row = {
        tx_hash: event.log.transactionHash,
        block_num: event.log.blockNumber,
        source_contract: "CountableCoin",
        event_type: "TransferWithCD",
        from_addr: from,
        to_addr: to,
        amount: value.toString(),
        account_code: Number(accountCode),
        booking_date: Number(bookingDate),
        tax_code: Number(taxCode),
        document_hash: documentHash,
        raw_cd: null,
      };
      insertTx.run(row);
      console.log(
        `[TransferWithCD] block=${row.block_num} acct=${row.account_code} date=${row.booking_date} tax=${row.tax_code}`
      );
    }
  );

  // ── CountableCoin – standard Transfer ────────────────────────────────────
  cnc.on("Transfer", (from, to, value, event) => {
    const row = {
      tx_hash: event.log.transactionHash,
      block_num: event.log.blockNumber,
      source_contract: "CountableCoin",
      event_type: "Transfer",
      from_addr: from,
      to_addr: to,
      amount: value.toString(),
      account_code: null,
      booking_date: null,
      tax_code: null,
      document_hash: null,
      raw_cd: null,
    };
    insertTx.run(row);
    console.log(`[Transfer/CNC] block=${row.block_num} from=${from.slice(0,8)}… to=${to.slice(0,8)}… amt=${ethers.formatUnits(value,18)}`);
  });

  // ── StandardToken – Transfer ──────────────────────────────────────────────
  const stdAbi = loadABI("StandardToken");
  const std = new ethers.Contract(stdAddr, stdAbi, provider);

  std.on("Transfer", (from, to, value, event) => {
    const row = {
      tx_hash: event.log.transactionHash,
      block_num: event.log.blockNumber,
      source_contract: "StandardToken",
      event_type: "Transfer",
      from_addr: from,
      to_addr: to,
      amount: value.toString(),
      account_code: null,
      booking_date: null,
      tax_code: null,
      document_hash: null,
      raw_cd: null,
    };
    insertTx.run(row);
    console.log(`[Transfer/STD] block=${row.block_num} from=${from.slice(0,8)}… to=${to.slice(0,8)}… amt=${ethers.formatUnits(value,18)}`);
  });

  console.log("Watcher started. Listening on http://127.0.0.1:8545 …");
  console.log("  CountableCoin :", cncAddr);
  console.log("  StandardToken :", stdAddr);
}

main().catch((err) => {
  console.error("Watcher error:", err);
  process.exit(1);
});
