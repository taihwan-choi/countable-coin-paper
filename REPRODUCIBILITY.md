# Reproducibility Guide

This guide provides step-by-step instructions for independently reproducing the benchmark results reported in the paper. All figures were produced in the environment described below. A verbatim reproduction should yield warm-average gas costs of ±0 (±6 gas tolerance for Path E, as noted in the paper).

---

## 1. Reference Environment

| Item | Value |
|------|-------|
| OS | Ubuntu 22.04 LTS (WSL2 on Windows 11) |
| Node.js | 22.x |
| npm | 10.x |
| Hardhat | 2.28.6 |
| @nomicfoundation/hardhat-toolbox | 6.1.0 |
| Solidity | 0.8.24 |
| Optimizer | enabled, runs = 200 |
| viaIR | true |
| ethers.js | 6.x |
| Network | Hardhat localhost (chainId 31337) |
| Block gas limit | Hardhat default (30,000,000) |
| Gas price | 1 gwei (Hardhat default) |
| Measurement runs | 10 per path |
| Warm average | runs 2–10 (n = 9); run 1 cold spike excluded |

> **Cold-spike rationale:** Run 1 triggers a zero-to-nonzero SSTORE cold write on the recipient's ERC-20 balance slot, adding approximately +17,100 gas. Paper Table II reports warm averages (runs 2–10) only.

---

## 2. Installation

```bash
git clone https://github.com/taihwan-choi/countable-coin-paper.git
cd countable-coin-paper
npm install
```

If installation fails due to peer-dependency conflicts, retry with:

```bash
npm install --legacy-peer-deps
```

---

## 3. Compile Contracts

```bash
npm run compile
# or: npx hardhat compile
```

Expected output:
```
Compiled 4 Solidity files successfully
```

---

## 4. Start a Local Node

In a dedicated terminal (keep running throughout all subsequent steps):

```bash
npx hardhat node
```

Expected first line:
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
```

---

## 5. Deploy and Initialize

In a second terminal:

```bash
npm run deploy:local
```

Contract addresses are saved to `deployed_addresses.json`.

Configure allowlist, account codes, tax codes, and authorized signer:

```bash
npm run setup:local
```

Expected output:
```
[1/4] setAllowlist(alice, true)                  ✅
[2/4] setAllowedAccountCode: [1001, 1002, 2001]  ✅
[3/4] setAllowedTaxCode: [10, 20, 0]             ✅
[4/4] setAuthorizedSigner(alice, true)            ✅
```

---

## 6. Run the Benchmark (reproduces Paper Table II)

```bash
npm run benchmark
# or: npx hardhat run scripts/benchmark_table2.js --network localhost
```

Script: `scripts/benchmark_table2.js`

This script:
1. Deploys all four contracts (`StandardToken`, `CountableCoinWrapper`, `MinimalCountableCoin`, `CountableCoin`).
2. Measures gas for paths A, C, D, and E — 10 runs each.
3. Writes timestamped raw data to `results/benchmark_raw.json`.

> **Path B (Lightweight Carriage)** is measured separately:
> ```bash
> npm run gas:compare
> ```

---

## 7. Result Files

| File | Contents |
|------|----------|
| `results/benchmark_raw.json` | 10-run raw gas data per path + summary statistics |

---

## 8. Computing the Warm Average

Paper Table II warm averages are computed from runs 2–10 only:

```js
const records = require('./results/benchmark_raw.json').records;
const warm = records.filter(r => r.path === 'A' && r.run >= 2);
const warmAvg = Math.round(warm.reduce((s, r) => s + r.gasUsed, 0) / warm.length);
```

Apply the same filter for paths B–E by changing the `path` selector.

---

## 9. Mapping to Paper Table II

| Paper label | Repository path | Script | Warm avg (gas) | Overhead |
|-------------|----------------|--------|---------------|---------|
| ERC-20 baseline | Path A | benchmark_table2.js | 35,098 | 0.00% |
| Lightweight Carriage | Path B | gas_compare.js | 36,217 | +3.19% |
| Observable Semantic | Path C | benchmark_table2.js | 42,477 | +21.02% |
| Allowlist Path | Path D | benchmark_table2.js | 41,875 | +19.31% |
| Signed Enterprise | Path E | benchmark_table2.js | 55,614 | +58.45% |

> Figures above correspond to `results/benchmark_raw.json` (timestamp: 2026-03-22T01:30:29Z).  
> Warm averages should be ±0 on an identical environment; Path E allows ±6 gas due to nonce-slot alignment variance (stated in the paper).

---

## 10. Common Issues

| Symptom | Cause | Resolution |
|---------|-------|------------|
| `HardFail: signer not authorized` | `setup:local` not run | Run `npm run setup:local` |
| `HardFail: accountCode not in allowlist` | Allowlist not configured | Check code list in `scripts/setup_local.js` |
| Gas figures differ significantly | Hardhat version mismatch | Run `npm list hardhat` — expect 2.28.6 |
| Run 1 is ~17,000 gas higher than runs 2–10 | Expected cold SSTORE spike | Use warm avg (runs 2–10 only) |
| Path E shows ±6 gas variance across warm runs | Expected nonce-slot alignment difference | Within the stated tolerance |