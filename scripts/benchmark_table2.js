/**
 * benchmark_table2.js  –  Table II: Gas cost by transfer path
 *
 * Deploys fresh instances of each contract variant and measures
 * average gas over RUNS iterations.
 *
 * Paths:
 *   (A) StandardToken.transfer()            – plain ERC-20 baseline
 *   (B) CountableCoinWrapper.transferWithCD()  – calldata passthrough, no semantic
 *   (C) MinimalCountableCoin.transferWithCD()  – semantic validation + event, no allowlist/EIP-712
 *   (D) CountableCoin.transferWithCD()         – semantic + allowlist check
 *   (E) CountableCoin.transferWithCDSigned()   – semantic + allowlist + EIP-712 ecrecover + nonce
 *
 * Payload: 44-byte countable-data (accountCode|bookingDate|taxCode|documentHash)
 */
const hre  = require("hardhat");
const fs   = require("fs");
const path = require("path");

const RUNS       = 10;
const RESULTS_DIR = path.join(__dirname, "..", "results");
const RAW_JSON    = path.join(RESULTS_DIR, "benchmark_raw.json");

// ── 44-byte rawCD payload ─────────────────────────────────────────────────────
// Layout for MinimalCountableCoin / CountableCoin:
//   [0: 4]  accountCode  = 1       (0x00000001)
//   [4: 8]  bookingDate  = 20250101 (0x0134FDF5) — YYYYMMDD, passes _isValidDate
//   [8:12]  taxCode      = 1       (0x00000001)
//  [12:44]  documentHash = 32 non-zero bytes
const RAW_CD = "0x" +
  "00000001" +          // accountCode  (4 B)
  "0134fdf5" +          // bookingDate  (4 B) — 20250101
  "00000001" +          // taxCode      (4 B)
  "abcdef01".repeat(8); // documentHash (32 B)

// ── Helpers ───────────────────────────────────────────────────────────────────
function avg(arr) {
  return Number(arr.reduce((a, b) => BigInt(a) + BigInt(b), 0n)) / arr.length;
}
function lpad(v, w) { return String(v).padStart(w); }
function rpad(v, w) { return String(v).padEnd(w); }

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
  return signer.signTypedData(domain, types, {
    from: signer.address, to, value, rawCD, nonce, deadline,
  });
}

async function bench(label, runs, fn, rawData) {
  const arr = [];
  for (let i = 0; i < runs; i++) {
    const gas = await fn(i);
    arr.push(gas);
    rawData.push({ path: label.trim(), run: i + 1, gasUsed: Number(gas) });
    process.stdout.write(`  [${String(i + 1).padStart(2)}/${runs}] ${label}  gas=${gas}\n`);
  }
  return avg(arr);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const signers  = await hre.ethers.getSigners();
  const [deployer, alice, bob] = signers;
  const xferAmt  = hre.ethers.parseUnits("1", 18);
  const topUp    = hre.ethers.parseUnits("50000", 18);

  console.log(`Deployer : ${deployer.address}`);
  console.log(`Alice    : ${alice.address}`);
  console.log(`Bob      : ${bob.address}`);
  console.log(`Payload  : ${RAW_CD.slice(0, 20)}… (44 B)\n`);

  // ── Deploy fresh instances ────────────────────────────────────────────────
  console.log("Deploying contracts …");

  const STDf     = await hre.ethers.getContractFactory("StandardToken");
  const std      = await STDf.deploy(1_000_000);
  await std.waitForDeployment();
  console.log(`  StandardToken          → ${await std.getAddress()}`);

  const WRAPf    = await hre.ethers.getContractFactory("CountableCoinWrapper");
  const wrapper  = await WRAPf.deploy();
  await wrapper.waitForDeployment();
  console.log(`  CountableCoinWrapper   → ${await wrapper.getAddress()}`);

  const MINf     = await hre.ethers.getContractFactory("MinimalCountableCoin");
  const minimal  = await MINf.deploy();
  await minimal.waitForDeployment();
  console.log(`  MinimalCountableCoin   → ${await minimal.getAddress()}`);

  const CNCf     = await hre.ethers.getContractFactory("CountableCoin");
  const cnc      = await CNCf.deploy(1_000_000);
  await cnc.waitForDeployment();
  const cncAddr  = await cnc.getAddress();
  console.log(`  CountableCoin (full)   → ${cncAddr}\n`);

  // ── Fund alice ────────────────────────────────────────────────────────────
  await (await std.connect(deployer).transfer(alice.address, topUp)).wait();
  await (await wrapper.connect(deployer).transfer(alice.address, topUp)).wait();
  await (await minimal.connect(deployer).transfer(alice.address, topUp)).wait();
  await (await cnc.connect(deployer).transfer(alice.address, topUp)).wait();
  console.log("Alice funded on all contracts ✓");

  // Allowlist alice for CountableCoin (Paths D/E)
  await (await cnc.connect(deployer).setAllowlist(alice.address, true)).wait();
  console.log("Alice allowlisted on CountableCoin ✓\n");

  // ── EIP-712 domain ────────────────────────────────────────────────────────
  const network = await hre.ethers.provider.getNetwork();
  const domain  = {
    name:              "CountableCoin",
    version:           "1",
    chainId:           Number(network.chainId),
    verifyingContract: cncAddr,
  };

  // ── Benchmarks ────────────────────────────────────────────────────────────
  console.log(`=== Table II: Gas by Transfer Path (${RUNS} runs each) ===\n`);

  const rawData = [];

  // (A) STD.transfer
  const avgA = await bench("(A) STD.transfer           ", RUNS, async () => {
    const tx = await std.connect(alice).transfer(bob.address, xferAmt);
    return (await tx.wait()).gasUsed;
  }, rawData);

  // (B) Wrapper.transferWithCD — no semantic checks
  const avgB = await bench("(B) Wrapper.transferWithCD ", RUNS, async () => {
    const tx = await wrapper.connect(alice).transferWithCD(bob.address, xferAmt, RAW_CD);
    return (await tx.wait()).gasUsed;
  }, rawData);

  // (C) Minimal.transferWithCD — semantic validation + event
  const avgC = await bench("(C) Minimal.transferWithCD ", RUNS, async () => {
    const tx = await minimal.connect(alice).transferWithCD(bob.address, xferAmt, RAW_CD);
    return (await tx.wait()).gasUsed;
  }, rawData);

  // (D) CNC.transferWithCD — allowlist + semantic
  const avgD = await bench("(D) CNC.transferWithCD     ", RUNS, async () => {
    const tx = await cnc.connect(alice).transferWithCD(bob.address, xferAmt, RAW_CD);
    return (await tx.wait()).gasUsed;
  }, rawData);

  // (E) CNC.transferWithCDSigned — EIP-712 + nonce + ecrecover
  const avgE = await bench("(E) CNC.transferWithCDSigned", RUNS, async (i) => {
    const nonce    = await cnc.nonces(alice.address);
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const sig      = await sign712(alice, domain, cnc, bob.address, xferAmt, RAW_CD, nonce, deadline);
    const tx       = await cnc.connect(deployer).transferWithCDSigned(
      alice.address, bob.address, xferAmt, RAW_CD, deadline, sig
    );
    return (await tx.wait()).gasUsed;
  }, rawData);

  // ── Results table ─────────────────────────────────────────────────────────
  const baseline = avgA;
  const rows = [
    { label: "(A) STD.transfer",             path: "ERC-20 baseline",          avg: avgA },
    { label: "(B) Wrapper.transferWithCD",   path: "Passthrough, no semantic", avg: avgB },
    { label: "(C) Minimal.transferWithCD",   path: "Semantic+Event",           avg: avgC },
    { label: "(D) CNC.transferWithCD",       path: "Semantic+Allowlist",       avg: avgD },
    { label: "(E) CNC.transferWithCDSigned", path: "Semantic+Allowlist+EIP712",avg: avgE },
  ];

  const W = { label: 30, path: 28, avg: 10, oh: 14, pct: 12 };
  const DIV = "─".repeat(W.label + W.path + W.avg + W.oh + W.pct + 12);

  console.log("\n" + DIV);
  console.log(" TABLE II: Transfer Gas Cost by Path");
  console.log(DIV);
  console.log(
    " " +
    rpad("Method",         W.label) + "  " +
    rpad("Features",       W.path)  + "  " +
    lpad("Avg Gas",        W.avg)   + "  " +
    lpad("vs ERC-20",      W.oh)    + "  " +
    lpad("Overhead %",     W.pct)
  );
  console.log(DIV);

  for (const r of rows) {
    const oh  = r.avg - baseline;
    const pct = (oh / baseline) * 100;
    const sign = oh >= 0 ? "+" : "";
    console.log(
      " " +
      rpad(r.label,                W.label) + "  " +
      rpad(r.path,                 W.path)  + "  " +
      lpad(r.avg.toFixed(0),       W.avg)   + "  " +
      lpad(sign + oh.toFixed(0),   W.oh)    + "  " +
      lpad(sign + pct.toFixed(2) + "%", W.pct)
    );
  }
  console.log(DIV);

  // ── Derived overhead breakdown ────────────────────────────────────────────
  const wrapperOverhead  = avgB - avgA;
  const semanticOverhead = avgC - avgB;
  const allowlistExtra   = avgD - avgC;
  const eip712Extra      = avgE - avgD;

  console.log("\n  Overhead breakdown:");
  console.log(`    Calldata passthrough (B-A)       : ${wrapperOverhead >= 0 ? "+" : ""}${wrapperOverhead.toFixed(0)} gas`);
  console.log(`    Semantic validation + event (C-B): +${semanticOverhead.toFixed(0)} gas`);
  console.log(`    Allowlist SLOAD check (D-C)      : +${allowlistExtra.toFixed(0)} gas`);
  console.log(`    EIP-712 ecrecover + nonce (E-D)  : +${eip712Extra.toFixed(0)} gas`);
  console.log(`    Total CD overhead vs ERC-20 (E-A): +${(avgE - avgA).toFixed(0)} gas\n`);

  // ── Save raw JSON ─────────────────────────────────────────────────────────
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const output = {
    timestamp: new Date().toISOString(),
    runs: RUNS,
    rawCD: RAW_CD,
    records: rawData,
    summary: rows.map(r => ({
      path:    r.label,
      avgGas:  Math.round(r.avg),
      vsERC20: Math.round(r.avg - avgA),
      pct:     +((r.avg - avgA) / avgA * 100).toFixed(2),
    })),
  };
  fs.writeFileSync(RAW_JSON, JSON.stringify(output, null, 2));
  console.log(`  Raw data saved → ${RAW_JSON}\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });
