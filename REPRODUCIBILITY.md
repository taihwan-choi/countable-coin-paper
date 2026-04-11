# Reproducibility Guide

This guide walks through the full local reproduction of the research demo: contract deployment, semantic transfer emission, watcher observation, and benchmark execution.

All gas figures in the paper were produced in the reference environment described in §1. A verbatim reproduction should yield identical warm-average gas costs (±6 gas tolerance for Path E; see [BENCHMARK.md](BENCHMARK.md) for details).

---

## 1. Environment

| Item | Reference value |
|------|----------------|
| OS | Ubuntu 22.04 LTS (WSL2 on Windows 11) |
| Node.js | 22.x (≥ 18.x required) |
| npm | 10.x (≥ 9.x required) |
| Hardhat | 2.28.6 |
| Solidity | 0.8.24 |
| Optimizer | enabled, runs = 200, viaIR = true |
| Network | Hardhat localhost, chainId 31337 |

---

## 2. Clone and install

```bash
git clone https://github.com/taihwan-choi/countable-coin-paper.git
cd countable-coin-paper
npm install
```

If peer-dependency conflicts occur:

```bash
npm install --legacy-peer-deps
```

---

## 3. Compile and test

```bash
npx hardhat compile
npx hardhat test
```

Expected test output: **15 passing**

The test suite covers all four contract paths and the full semantic validation logic: valid and invalid payload lengths, missing fields, invalid booking dates, allowlist enforcement, account/tax-code policy checks, EIP-712 signed transfer, and nonce replay rejection.

---

## 4. Start a local node

Open a dedicated terminal and keep it running throughout the following steps:

```bash
npx hardhat node
```

Expected first line:
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
```

---

## 5. Deploy contracts

In a second terminal:

```bash
npm run deploy:local
```

This deploys all four contracts (`StandardToken`, `CountableCoinWrapper`, `MinimalCountableCoin`, `CountableCoin`) and writes their addresses to `deployed_addresses.json`.

---

## 6. Configure local policies

```bash
npm run setup:local
```

This script:
1. Creates the SQLite database schema (`events.db`) — `transfers` and `gas_stats` tables.
2. Distributes 10,000 tokens of each contract type to the test accounts `alice` and `bob`.
3. Configures `CountableCoin` policy controls:

```
[1/4] setAllowlist(alice, true)                  ✅
[2/4] setAllowedAccountCode: [1001, 1002, 2001]  ✅
[3/4] setAllowedTaxCode: [10, 20, 0]             ✅
[4/4] setAuthorizedSigner(alice, true)            ✅
```

---

## 7. Emit a local semantic transfer

```bash
npm run emit:local
```

Sends five `transferWithCD` transactions from `alice` to `bob`, each carrying a valid 44-byte Countable Data payload (`accountCode=1001`, `bookingDate=20250101`, `taxCode=10`, `documentHash=keccak256("docN")`). Each transaction emits a structured `TransferWithCD` event.

---

## 8. Run the watcher

```bash
npm run watcher
```

The watcher (`watcher/index.js`):
- Subscribes to `TransferWithCD` events on `CountableCoin` using an ethers.js JSON-RPC event listener
- Also subscribes to standard `Transfer` events on both `CountableCoin` and `StandardToken`
- Inserts all parsed event fields into the local SQLite database (`events.db`)

It is a minimal local research-demo consumer. It does not use polling, a JSONL sink, or a webhook endpoint.

After running `npm run emit:local`, the watcher console should log five `[TransferWithCD]` lines, one per emitted event.

---

## 9. Benchmark

See [BENCHMARK.md](BENCHMARK.md) for full path definitions and result interpretation.

**Five-path measurement (reproduces paper Table II):**

Prerequisites: local node running (§4). The benchmark script deploys its own contract instances.

```bash
npm run benchmark
```

Output is written to `results/benchmark_raw.json`.

**Simplified two-path comparison:**

```bash
npm run gas:compare
```

---

## 10. Expected outcomes

| Step | Expected result |
|------|----------------|
| `npx hardhat compile` | 4 contracts compiled successfully |
| `npx hardhat test` | 15 tests passing |
| `npm run deploy:local` | addresses written to `deployed_addresses.json` |
| `npm run setup:local` | SQLite schema created; tokens distributed; CNC policies configured |
| `npm run emit:local` | 5 `TransferWithCD` transactions confirmed on-chain |
| `npm run watcher` (with emit) | 5 `[TransferWithCD]` rows inserted into `events.db` |
| `npm run benchmark` | `results/benchmark_raw.json` written with warm avg ≈ 35,098 / 36,217 / 42,477 / 41,875 / 55,614 gas |

---

## Common issues

| Symptom | Cause | Resolution |
|---------|-------|------------|
| `deployed_addresses.json not found` | `deploy:local` not run | Run `npm run deploy:local` first |
| `HardFail: signer not authorized` | `setup:local` not run | Run `npm run setup:local` |
| `HardFail: accountCode not in allowlist` | Allowlist not configured | Verify code list in `setup_local.js` |
| Gas figures differ significantly | Hardhat version mismatch | Run `npm list hardhat` — expect 2.28.6 |
| Run 1 is ~17,000 gas higher | Expected cold SSTORE on recipient slot | Use warm average (runs 2–10) |
| Path E ±6 gas variance in warm runs | Nonce slot odd/even alignment | Within stated tolerance |