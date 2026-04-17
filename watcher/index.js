/**
 * watcher/index.js
 * Listens for Transfer and TransferWithCD events on localhost
 * and writes them to the SQLite DB (events.db).
 *
 * Minimal local watcher for research-demo purposes.
 * Not intended as a production event ingestion pipeline.
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_meta (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_transfers_txlog
    ON transfers (tx_hash, log_index);
  `);

  const insertTx = db.prepare(`
    INSERT OR IGNORE INTO transfers (
      tx_hash, block_num, log_index, source_contract, event_type,
      from_addr, to_addr, amount,
      account_code, booking_date, tax_code, document_hash, raw_cd
    ) VALUES (
      @tx_hash, @block_num, @log_index, @source_contract, @event_type,
      @from_addr, @to_addr, @amount,
      @account_code, @booking_date, @tax_code, @document_hash, @raw_cd
    )
  `);

  const updateLastProcessedBlock = db.prepare(`
    INSERT INTO sync_meta (key, value, updated_at)
    VALUES ('last_processed_block', @block_num, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `);

  const lastProcessedBlock = db
    .prepare("SELECT value FROM sync_meta WHERE key = 'last_processed_block'")
    .get();

  function logIndex(event) {
    return Number(event.log.index ?? event.log.logIndex ?? 0);
  }

  function insertEvent(row) {
    const result = insertTx.run(row);
    if (result.changes > 0) {
      updateLastProcessedBlock.run({ block_num: String(row.block_num) });
    }
    return result.changes > 0;
  }

  // ── CountableCoin – TransferWithCD ────────────────────────────────────────
  const cncAbi = loadABI("CountableCoin");
  const cnc = new ethers.Contract(cncAddr, cncAbi, provider);

  cnc.on(
    "TransferWithCD",
    (from, to, value, accountCode, bookingDate, taxCode, documentHash, event) => {
      const row = {
        tx_hash: event.log.transactionHash,
        block_num: event.log.blockNumber,
        log_index: logIndex(event),
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
      if (insertEvent(row)) {
        console.log(
          `[TransferWithCD] block=${row.block_num} log=${row.log_index} acct=${row.account_code} date=${row.booking_date} tax=${row.tax_code}`
        );
      }
    }
  );

  // ── CountableCoin – standard Transfer ────────────────────────────────────
  cnc.on("Transfer", (from, to, value, event) => {
    const row = {
      tx_hash: event.log.transactionHash,
      block_num: event.log.blockNumber,
      log_index: logIndex(event),
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
    if (insertEvent(row)) {
      console.log(`[Transfer/CNC] block=${row.block_num} log=${row.log_index} from=${from.slice(0,8)}… to=${to.slice(0,8)}… amt=${ethers.formatUnits(value,18)}`);
    }
  });

  // ── StandardToken – Transfer ──────────────────────────────────────────────
  const stdAbi = loadABI("StandardToken");
  const std = new ethers.Contract(stdAddr, stdAbi, provider);

  std.on("Transfer", (from, to, value, event) => {
    const row = {
      tx_hash: event.log.transactionHash,
      block_num: event.log.blockNumber,
      log_index: logIndex(event),
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
    if (insertEvent(row)) {
      console.log(`[Transfer/STD] block=${row.block_num} log=${row.log_index} from=${from.slice(0,8)}… to=${to.slice(0,8)}… amt=${ethers.formatUnits(value,18)}`);
    }
  });

  console.log("Watcher started. Listening on http://127.0.0.1:8545 …");
  console.log("  CountableCoin :", cncAddr);
  console.log("  StandardToken :", stdAddr);
  console.log("  Last processed block :", lastProcessedBlock?.value ?? "none");
}

main().catch((err) => {
  console.error("Watcher error:", err);
  process.exit(1);
});
