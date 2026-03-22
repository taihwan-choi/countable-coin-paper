/**
 * gas_compare.js  –  Full-spec gas comparison
 *
 * Measures 10-run average gas for:
 *   (A) STD.transfer()              – plain ERC-20 baseline
 *   (B) CNC.transfer()              – CountableCoin plain transfer
 *   (C) CNC.transferWithCD()        – direct call, allowlisted, 44B rawCD
 *   (D) CNC.transferWithCDSigned()  – EIP-712 meta-tx, 44B rawCD
 *
 * CountableCoin features exercised:
 *   • allowlist check
 *   • 44-byte rawCD length validation
 *   • nonce increment (D only)
 *   • EIP-712 DOMAIN_SEPARATOR + struct hash + ecrecover (D only)
 */
const hre = require("hardhat");
const { ethers } = require("ethers");
const path  = require("path");
const fs    = require("fs");
const Database = require("better-sqlite3");

const RUNS = 10;
// Exactly 44 bytes of realistic countable-data payload
// Layout (example): [4B schemaVer][20B issuer][8B timestamp][12B metadata]
const RAW_CD = "0x" +
  "00000001" +                          // schemaVersion (4 B)
  "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" + // issuer addr (20 B)
  "0000000067e1a980" +                  // unix timestamp (8 B)
  "010203040506070809101112";           // metadata      (12 B)
// total: 4+20+8+12 = 44 bytes ✓

// ── Helpers ───────────────────────────────────────────────────────────────
function avg(arr) {
  return Number(arr.reduce((a, b) => BigInt(a) + BigInt(b), 0n)) / arr.length;
}
function lpad(v, w)  { return String(v).padStart(w); }
function rpad(v, w)  { return String(v).padEnd(w); }

// Build EIP-712 signature for transferWithCDSigned
async function sign712(signer, domain, cnc, to, value, rawCD, nonce, deadline) {
  const types = {
    TransferWithCD: [
      { name: "from",     type: "address" },
      { name: "to",       type: "address" },
      { name: "value",    type: "uint256" },
      { name: "rawCD",    type: "bytes"   },
      { name: "nonce",    type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const message = {
    from:     signer.address,
    to,
    value,
    rawCD,
    nonce,
    deadline,
  };
  return signer.signTypedData(domain, types, message);
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const addrFile = path.join(__dirname, "..", "deployed_addresses.json");
  if (!fs.existsSync(addrFile)) throw new Error("Run deploy_local.js first");
  const { CountableCoin: cncAddr, StandardToken: stdAddr } =
    JSON.parse(fs.readFileSync(addrFile, "utf8"));

  const signers = await hre.ethers.getSigners();
  const [deployer, alice, bob, carol] = signers;

  // ── Attach contracts ──────────────────────────────────────────────────
  const CNC = await hre.ethers.getContractFactory("CountableCoin");
  const cnc = CNC.attach(cncAddr);

  const STD = await hre.ethers.getContractFactory("StandardToken");
  const std = STD.attach(stdAddr);

  // ── Allowlist alice (deployer already allowlisted) ────────────────────
  console.log("Registering alice on allowlist …");
  await (await cnc.connect(deployer).setAllowlist(alice.address, true)).wait();
  console.log("  alice allowlisted ✓\n");

  // Top up balances
  const topUp = hre.ethers.parseUnits("50000", 18);
  await (await cnc.connect(deployer).transfer(alice.address, topUp)).wait();
  await (await std.connect(deployer).transfer(alice.address, topUp)).wait();

  // ── EIP-712 domain (mirrors contract constructor) ─────────────────────
  const network = await hre.ethers.provider.getNetwork();
  const domain = {
    name:              "CountableCoin",
    version:           "1",
    chainId:           Number(network.chainId),
    verifyingContract: cncAddr,
  };

  const xferAmt  = hre.ethers.parseUnits("1", 18);
  const db       = new Database(path.join(__dirname, "..", "events.db"));
  const insGas   = db.prepare("INSERT INTO gas_stats (label, gas_used) VALUES (?, ?)");

  async function bench(label, fn) {
    const arr = [];
    for (let i = 0; i < RUNS; i++) {
      const gas = await fn(i);
      arr.push(gas);
      insGas.run(label, Number(gas));
      process.stdout.write(`  [${String(i+1).padStart(2)}/${RUNS}] ${label}  gas=${gas}\n`);
    }
    return avg(arr);
  }

  console.log(`=== Gas Comparison (${RUNS} runs each) ===\n`);

  // ── (A) STD.transfer ──────────────────────────────────────────────────
  const avgA = await bench("STD.transfer", async () => {
    const tx = await std.connect(alice).transfer(carol.address, xferAmt);
    return (await tx.wait()).gasUsed;
  });

  // ── (B) CNC.transfer (plain) ──────────────────────────────────────────
  const avgB = await bench("CNC.transfer", async () => {
    const tx = await cnc.connect(alice).transfer(carol.address, xferAmt);
    return (await tx.wait()).gasUsed;
  });

  // ── (C) CNC.transferWithCD (direct, 44B rawCD) ────────────────────────
  const avgC = await bench("CNC.transferWithCD", async () => {
    const tx = await cnc.connect(alice).transferWithCD(
      carol.address, xferAmt, RAW_CD
    );
    return (await tx.wait()).gasUsed;
  });

  // ── (D) CNC.transferWithCDSigned (EIP-712, 44B rawCD) ─────────────────
  const avgD = await bench("CNC.transferWithCDSigned", async (i) => {
    const nonce    = await cnc.nonces(alice.address);
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const sig      = await sign712(
      alice, domain, cnc,
      carol.address, xferAmt, RAW_CD, nonce, deadline
    );
    // relayer = deployer (anyone can relay)
    const tx = await cnc.connect(deployer).transferWithCDSigned(
      alice.address, carol.address, xferAmt, RAW_CD, deadline, sig
    );
    return (await tx.wait()).gasUsed;
  });

  db.close();

  // ── Results table ─────────────────────────────────────────────────────
  const baseline = avgA; // ERC-20 baseline
  const rows = [
    { label: "STD.transfer",             avg: avgA },
    { label: "CNC.transfer",             avg: avgB },
    { label: "CNC.transferWithCD",       avg: avgC },
    { label: "CNC.transferWithCDSigned", avg: avgD },
  ];

  const W = { label: 28, avg: 12, oh: 16, pct: 12 };
  const DIV = "─".repeat(W.label + W.avg + W.oh + W.pct + 10);

  console.log("\n" + DIV);
  console.log(
    " " +
    rpad("Method",               W.label) + "  " +
    lpad("Avg Gas",              W.avg)   + "  " +
    lpad("vs ERC-20 (gas)",      W.oh)    + "  " +
    lpad("Overhead (%)",         W.pct)
  );
  console.log(DIV);
  for (const r of rows) {
    const oh    = r.avg - baseline;
    const pct   = (oh / baseline) * 100;
    const sign  = oh >= 0 ? "+" : "";
    console.log(
      " " +
      rpad(r.label,               W.label) + "  " +
      lpad(r.avg.toFixed(0),      W.avg)   + "  " +
      lpad(sign + oh.toFixed(0),  W.oh)    + "  " +
      lpad(sign + pct.toFixed(2) + "%", W.pct)
    );
  }
  console.log(DIV);

  // Extras
  const cdOverhead     = avgC - avgA;
  const signedOverhead = avgD - avgA;
  const eip712Extra    = avgD - avgC;
  console.log(`\n  44B rawCD overhead vs plain ERC-20 : +${cdOverhead.toFixed(0)} gas`);
  console.log(`  EIP-712 signed overhead vs plain   : +${signedOverhead.toFixed(0)} gas`);
  console.log(`  EIP-712 extra on top of direct CD  : +${eip712Extra.toFixed(0)} gas`);
  console.log(`  (ecrecover + nonce SSTORE cost)\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });
