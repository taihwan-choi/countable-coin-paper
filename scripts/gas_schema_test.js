/**
 * gas_schema_test.js
 *
 * Deploys a fresh FlexibleEmitter contract for each schema size,
 * measures gas over RUNS iterations, then prints a comparison table
 * against a plain ERC-20 transfer baseline.
 *
 * Schema sizes tested (bytes): 12, 28, 44, 60, 76, 108, 172
 * Runs per size: 5
 */
const hre = require("hardhat");
const path = require("path");
const fs   = require("fs");

// ── Config ────────────────────────────────────────────────────────────────
const SCHEMA_SIZES = [12, 28, 44, 60, 76, 108, 172]; // bytes
const RUNS         = 5;

// ── Helpers ───────────────────────────────────────────────────────────────
/** Build a zero-filled Buffer of `n` bytes (represents a schema payload). */
function makePayload(n) {
  return "0x" + "ab".repeat(n); // non-zero bytes (cold-storage worst-case)
}

/** Average an array of BigInt/number values → Number. */
function avg(arr) {
  return Number(arr.reduce((a, b) => BigInt(a) + BigInt(b), 0n)) / arr.length;
}

/** Right-pad a string to `w` characters. */
function pad(s, w) {
  return String(s).padEnd(w);
}
/** Left-pad a string to `w` characters. */
function lpad(s, w) {
  return String(s).padStart(w);
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const addrFile = path.join(__dirname, "..", "deployed_addresses.json");
  if (!fs.existsSync(addrFile)) {
    throw new Error("deployed_addresses.json not found – run deploy_local.js first");
  }
  const { StandardToken: stdAddr } = JSON.parse(fs.readFileSync(addrFile, "utf8"));

  const signers = await hre.ethers.getSigners();
  const [deployer, alice, carol] = signers;

  // ── Baseline: plain ERC-20 transfer (10 runs, take avg) ──────────────────
  console.log("Measuring ERC-20 baseline …");
  const StandardToken  = await hre.ethers.getContractFactory("StandardToken");
  const std            = StandardToken.attach(stdAddr);

  // top up alice with STD if needed
  const topUp = hre.ethers.parseUnits("5000", 18);
  await (await std.connect(deployer).transfer(alice.address, topUp)).wait();

  const erc20Gas = [];
  const xferAmt  = hre.ethers.parseUnits("1", 18);
  for (let i = 0; i < RUNS; i++) {
    const tx = await std.connect(alice).transfer(carol.address, xferAmt);
    const r  = await tx.wait();
    erc20Gas.push(r.gasUsed);
    process.stdout.write(`  ERC-20 transfer [${i + 1}/${RUNS}] gas=${r.gasUsed}\n`);
  }
  const erc20Avg = avg(erc20Gas);
  console.log(`  → ERC-20 avg: ${erc20Avg.toFixed(0)} gas\n`);

  // ── Per-schema-size benchmarks ────────────────────────────────────────────
  const FlexibleEmitter = await hre.ethers.getContractFactory("FlexibleEmitter");

  const results = [];

  for (const size of SCHEMA_SIZES) {
    console.log(`Deploying FlexibleEmitter for schema size = ${size} B …`);
    const emitter = await FlexibleEmitter.deploy();
    await emitter.waitForDeployment();
    const addr = await emitter.getAddress();
    console.log(`  deployed → ${addr}`);

    const payload  = makePayload(size);
    const gasArr   = [];

    for (let i = 0; i < RUNS; i++) {
      const tx = await emitter.connect(alice).emitSchema(42, payload);
      const r  = await tx.wait();
      gasArr.push(r.gasUsed);
      process.stdout.write(`  [${i + 1}/${RUNS}] gas=${r.gasUsed}\n`);
    }

    const avgGas     = avg(gasArr);
    const overhead   = avgGas - erc20Avg;
    const overheadPct = (overhead / erc20Avg) * 100;

    results.push({ size, avgGas, overhead, overheadPct });
    console.log();
  }

  // ── Print table ───────────────────────────────────────────────────────────
  const DIV  = "─".repeat(70);
  const HDR  = [
    pad("Schema Size (B)", 18),
    lpad("Avg Gas",    12),
    lpad("vs ERC-20 (gas)", 18),
    lpad("Overhead (%)", 14),
  ].join("  ");

  console.log("\n" + DIV);
  console.log(" Gas by Schema Size  (baseline ERC-20 avg = " + erc20Avg.toFixed(0) + " gas)");
  console.log(DIV);
  console.log(" " + HDR);
  console.log(DIV);

  for (const r of results) {
    const sign = r.overhead >= 0 ? "+" : "";
    const row  = [
      pad(r.size,          18),
      lpad(r.avgGas.toFixed(0),        12),
      lpad(sign + r.overhead.toFixed(0), 18),
      lpad(sign + r.overheadPct.toFixed(2) + "%", 14),
    ].join("  ");
    console.log(" " + row);
  }

  console.log(DIV + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
