# Gas Benchmark — Five-Path Analysis

This document describes the benchmark design, execution procedure, and result interpretation for the five-path gas overhead analysis of Countable Coin.

---

## 1. Path Definitions

| Path | Label | Contract | Method | Features included |
|------|-------|---------|--------|------------------|
| **A** | ERC-20 Baseline | `StandardToken` | `transfer()` | Standard ERC-20 transfer only |
| **B** | Lightweight Carriage | `CountableCoinWrapper` | `transferWithCD()` | 44-byte calldata ABI encoding; no validation, no event |
| **C** | Observable Semantic | `MinimalCountableCoin` | `transferWithCD()` | Execution-time semantic validation + seven-field decomposed event |
| **D** | Allowlist Path | `CountableCoin` | `transferWithCD()` | Path C + allowlist + `accountCode`/`taxCode` enforcement |
| **E** | Signed Enterprise Path | `CountableCoin` | `transferWithCDSigned()` | Path D + EIP-712 `ecrecover` + per-signer nonce SSTORE |

### Path semantics

- **Path A** — Pure ERC-20 transfer cost. The comparison baseline for all overhead calculations.
- **Path B** — Forwards the 44-byte Countable Data payload as calldata without any validation or event emission. Establishes the minimum overhead of carrying the payload.
- **Path C** — Recommended deployment path. Performs execution-time semantic validation and emits a fully-decomposed seven-field `TransferWithCD` event that an ERP system can consume directly, without off-chain parsing.
- **Path D** — Adds on-chain allowlist and per-code (`accountCode`, `taxCode`) enforcement to Path C.
- **Path E** — Full enterprise (signed) path. Extends Path D with EIP-712 typed-data signature verification and a per-signer nonce stored in contract state (SSTORE), enabling delegated execution with replay protection.

---

## 2. Overhead Decomposition (C − B = +6,260 gas)

| Source | Gas delta | Share |
|--------|-----------|-------|
| Seven-field `TransferWithCD` event | +2,780 | 44.4% |
| 44-byte calldata ABI encoding | +992 | 15.8% |
| Validation logic (four stages) | +430 | 6.9% |
| Dispatch / stack / memory | +2,058 | 32.9% |
| **Total** | **+6,260** | **100%** |

> The B→C transition (+18 pp overhead) is the **cost of on-chain event indexing quality**.  
> The C→E transition (+37 pp overhead) is the **cost of cryptographic accountability**.

---

## 3. Running the Benchmark

**Prerequisites:** a Hardhat local node must be running (see [REPRODUCIBILITY.md](REPRODUCIBILITY.md) §4).

**Five-path measurement (reproduces Paper Table II):**

```bash
npm run benchmark
# or: npx hardhat run scripts/benchmark_table2.js --network localhost
```

Output written to `results/benchmark_raw.json`.

**Simplified two-path comparison (ERC-20 vs `transferWithCD`):**

```bash
npm run gas:compare
# or: npx hardhat run scripts/gas_compare.js --network localhost
```

---

## 4. Measurement Methodology

### Runs per path

```
RUNS = 10  (10 independent transactions per path)
```

### Cold vs. warm runs

| Run | Classification | Notes |
|-----|---------------|-------|
| Run 1 | Cold | Recipient balance slot: zero → nonzero SSTORE cold write (+17,100 gas) |
| Runs 2–10 | Warm | Slot already initialized; results reflect steady-state execution cost |

The paper reports **warm average = mean(runs 2–10), n = 9**.

### Gas unit

`receipt.gasUsed` — actual gas consumed by the transaction, inclusive of the 21,000-gas intrinsic cost.

### Path E variance

Warm runs of Path E exhibit ±6 gas variance. The cause is odd/even slot-alignment of the nonce SSTORE across successive calls. This variance is within the tolerance stated in the paper.

---

## 5. Measured Results (2026-03-22, benchmark_raw.json)

### Raw 10-run data

| Path | Run 1 (cold) | Runs 2–10 (warm) | Warm avg | Std dev |
|------|-------------|-----------------|---------|---------|
| A | 52,198 | 35,098 × 9 | **35,098** | ±0 |
| B | 53,317 | 36,217 × 9 | **36,217** | ±0 |
| C | 59,577 | 42,477 × 9 | **42,477** | ±0 |
| D | 58,975 | 41,875 × 9 | **41,875** | ±0 |
| E | 72,707 | 55,607–55,619 | **55,614** | ±6 |

### Paper Table II

| Path | Method | Warm avg (gas) | vs ERC-20 | Overhead |
|------|--------|---------------|-----------|---------|
| A | `transfer()` — ERC-20 baseline | 35,098 | — | 0.00% |
| B | `transferWithCD()` — passthrough | 36,217 | +1,119 | **+3.19%** |
| C | `MinimalCountableCoin.transferWithCD()` | 42,477 | +7,379 | **+21.02%** |
| D | `CountableCoin.transferWithCD()` | 41,875 | +6,777 | **+19.31%** |
| E | `CountableCoin.transferWithCDSigned()` + EIP-712 | 55,614 | +20,516 | **+58.45%** |

---

## 6. Three Operating Points

> *"Semantic layer cost is tunable depending on auditability and security requirements."*

| Operating point | Path | Warm gas | Overhead | Recommended when |
|----------------|------|---------|---------|-----------------|
| OP1 — Lightweight | B | 36,217 | +3.19% | Gas cost is the primary constraint; Countable Data parsed off-chain |
| OP2 — Observable | C | 42,477 | +21.02% | Direct ERP event consumption; on-chain auditability; **recommended default** |
| OP3 — Enterprise | E | 55,614 | +58.45% | Internal-control signature required; regulatory compliance context |

All paths execute in O(1) — there are no unbounded loops on the transfer path.

---

## 7. Output Schema (benchmark_raw.json)

```json
{
  "timestamp": "2026-03-22T01:30:29Z",
  "runs": 10,
  "records": [
    { "path": "A", "run": 1, "gasUsed": 52198 },
    { "path": "A", "run": 2, "gasUsed": 35098 },
    ...
  ],
  "summary": [
    { "path": "A", "avgGas": 35098, "vsERC20": 0,     "pct": "0.00%"  },
    { "path": "B", "avgGas": 36217, "vsERC20": 1119,  "pct": "3.19%"  },
    { "path": "C", "avgGas": 42477, "vsERC20": 7379,  "pct": "21.02%" },
    { "path": "D", "avgGas": 41875, "vsERC20": 6777,  "pct": "19.31%" },
    { "path": "E", "avgGas": 55614, "vsERC20": 20516, "pct": "58.45%" }
  ]
}
```

> `summary.avgGas` in the generated file is the mean over all 10 runs (inclusive of the cold run 1).  
> To replicate the paper's warm averages, filter `records` for `run >= 2` and compute the mean — see [REPRODUCIBILITY.md §8](REPRODUCIBILITY.md#8-computing-the-warm-average).