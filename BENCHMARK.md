# Benchmark Notes

This document describes the purpose, path definitions, methodology, and result interpretation for the five-path gas benchmark included in this repository.

---

## Purpose

The benchmark compares the gas cost of five transfer execution paths to quantify the incremental overhead introduced by:

1. carrying the 44-byte Countable Data payload in calldata (wrapper path),
2. performing execution-time semantic validation and emitting a structured event (minimal semantic path),
3. adding on-chain policy enforcement via an allowlist and per-code checks (enterprise path), and
4. adding EIP-712 typed-data signature verification with nonce-based replay protection (signed enterprise path).

The goal is not to optimise for minimum gas, but to measure the cost of each semantic layer component so that deployment decisions can be made based on auditability and security requirements.

---

## Path definitions

| Path | Label | Contract | Method | What it measures |
|------|-------|---------|--------|-----------------|
| **A** | ERC-20 Baseline | `StandardToken` | `transfer()` | Bare ERC-20 transfer cost — the comparison baseline |
| **B** | Lightweight Carriage | `CountableCoinWrapper` | `transferWithCD()` | Cost of accepting a 44-byte payload in calldata with no validation or event |
| **C** | Observable Semantic | `MinimalCountableCoin` | `transferWithCD()` | Execution-time semantic validation + seven-field `TransferWithCD` event |
| **D** | Allowlist Path | `CountableCoin` | `transferWithCD()` | Path C plus on-chain allowlist and `accountCode`/`taxCode` policy checks |
| **E** | Signed Enterprise Path | `CountableCoin` | `transferWithCDSigned()` | Path D plus EIP-712 `ecrecover` and per-signer nonce SSTORE |

### Path semantics

- **Path A** is the cost floor. All overhead percentages are expressed relative to it.
- **Path B** establishes the minimum cost of the Countable Data carriage mechanism, isolating calldata encoding from any validation logic.
- **Path C** adds execution-time semantic validation: payload-length check, non-zero field checks, calendar-date validation, and a seven-field on-chain event. This path enables direct ERP event consumption without off-chain parsing.
- **Path D** adds allowlist enforcement and per-code policy gates. It has slightly lower gas than Path C because the allowlist check short-circuits some validation branches.
- **Path E** adds cryptographic accountability: a typed signature is verified with `ecrecover`, and the signer's nonce is incremented in contract storage. This enables delegated, auditable, replay-protected transfers.

---

## Overhead decomposition (C − B = +6,260 gas)

| Source | Gas | Share |
|--------|-----|-------|
| Seven-field `TransferWithCD` event | +2,780 | 44.4% |
| 44-byte calldata ABI encoding | +992 | 15.8% |
| Validation logic (four checks) | +430 | 6.9% |
| Dispatch / stack / memory | +2,058 | 32.9% |
| **Total** | **+6,260** | **100%** |

The B→C step (+18 percentage points) represents the cost of on-chain event indexing quality. The C→E step (+37 pp) represents the cost of cryptographic accountability.

---

## Interpretation

### Cold vs. warm runs

Each path is measured over 10 consecutive transactions. Run 1 is a **cold run**: the recipient's ERC-20 balance slot transitions from zero to non-zero, triggering a cold SSTORE that adds approximately +17,100 gas. Runs 2–10 are **warm runs** where the slot is already initialised.

The paper reports **warm averages = mean(runs 2–10), n = 9**. Cold-run figures are included in the raw data for completeness but are excluded from the paper's Table II.

### Path E variance

Warm runs of Path E show ±6 gas variance caused by odd/even storage-slot alignment of the signer nonce across successive calls. This is within the stated tolerance.

### Research-demo scope

This benchmark is a research-demo comparison on a local Hardhat network. It is not a production gas study. Exact figures can differ from other EVM environments due to differences in:
- EVM version and compiler optimisation settings
- Block base fee and gas price model
- Network congestion and transaction ordering

---

## Running the benchmark

**Prerequisites:** a local Hardhat node must be running (see [REPRODUCIBILITY.md §4](REPRODUCIBILITY.md#4-start-a-local-node)).

```bash
# Five-path measurement (reproduces paper Table II)
npm run benchmark
# or: npx hardhat run scripts/benchmark_table2.js --network localhost

# Simplified two-path comparison (ERC-20 vs transferWithCD)
npm run gas:compare
```

---

## Results

Pre-generated results are stored in `results/benchmark_raw.json` (timestamp: 2026-03-22T01:30:29Z).

### Warm averages (paper Table II)

| Path | Method | Warm avg (gas) | vs ERC-20 | Overhead |
|------|--------|---------------|-----------|---------|
| A | `transfer()` | 35,098 | — | 0.00% |
| B | `transferWithCD()` — passthrough | 36,217 | +1,119 | +3.19% |
| C | `MinimalCountableCoin.transferWithCD()` | 42,477 | +7,379 | +21.02% |
| D | `CountableCoin.transferWithCD()` | 41,875 | +6,777 | +19.31% |
| E | `CountableCoin.transferWithCDSigned()` + EIP-712 | 55,614 | +20,516 | +58.45% |

### Three operating points

| Point | Path | Overhead | When to choose |
|-------|------|---------|----------------|
| Lightweight Carriage | B | +3.19% | Gas cost is the primary constraint; Countable Data is parsed off-chain |
| Observable Semantic | C | +21.02% | On-chain auditability and direct ERP event consumption; **recommended default** |
| Signed Enterprise | E | +58.45% | Delegated execution with cryptographic accountability; regulatory or internal-control context |

All paths execute in O(1) — no unbounded loops on the transfer path.

---

## Output schema (`benchmark_raw.json`)

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

> `summary.avgGas` is the mean over all 10 runs including the cold run 1.
> To compute warm averages matching the paper, filter `records` for `run >= 2` and average the `gasUsed` values.