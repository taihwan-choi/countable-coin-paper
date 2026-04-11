# Countable Coin — On-Chain Accounting Semantic Layer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-orange)](contracts/CountableCoin.sol)
[![Hardhat](https://img.shields.io/badge/Hardhat-v2-yellow)](hardhat.config.js)

> **Research artifact repository** — companion code for the paper  
> *"Semantic Finality: Enforcing Accounting Meaning in ERC-20 Token Transfers"*  
> (submitted to IEEE ICBC / BCCA)  
> Provides reproducible smart-contract implementations and a five-path gas benchmark.

---

## Overview

Standard ERC-20 tokens record only the transferred amount and the two counterparties. Countable Coin extends this by embedding a fixed-size **44-byte Countable Data** payload in every transfer call, enabling **execution-time semantic validation** of accounting fields — account code, booking date, tax code, and a document hash — directly on-chain.

This design allows ERP systems to consume on-chain `TransferWithCD` events for automated journal-entry generation without any manual reconciliation step.

---

## Countable Data Schema (Table I — 44 bytes, fixed)

| Offset | Field | Type | Size | Description |
|--------|-------|------|------|-------------|
| 0–3 | `accountCode` | uint32 | 4 B | IAS 1 general-ledger account code (non-zero) |
| 4–7 | `bookingDate` | uint32 | 4 B | Reporting period in YYYYMMDD format (calendar-validated) |
| 8–11 | `taxCode` | uint32 | 4 B | VAT / GST tax classification code (non-zero) |
| 12–43 | `documentHash` | bytes32 | 32 B | Source-document hash per IAS 8 / SOX (non-zero) |

---

## System Architecture

```
① Smart Contract           ② Watcher                  ③ SQLite DB
┌──────────────┐  events  ┌──────────────────┐  store  ┌──────────────┐
│ CountableCoin│ ────────►│ watcher/index.js │ ───────►│ events.db    │
│ .sol         │           │ event subscriber │         │ (local)      │
└──────────────┘           └──────────────────┘         └──────────────┘
  transferWithCD()            parse & persist
  TransferWithCD event        to SQLite
```

**Data flow:**
1. Client calls `transferWithCD()` → contract performs execution-time semantic validation, then emits a `TransferWithCD` event with all seven decoded fields.
2. Watcher subscribes to `TransferWithCD` events → stores parsed fields in SQLite (`events.db`). This is a minimal local research-demo implementation.
3. Dashboard reads SQLite and displays the event list and field-level aggregates in the browser.

---

## Repository Structure

```
countable-coin-paper/
├── contracts/
│   ├── StandardToken.sol          # ERC-20 baseline (Path A)
│   ├── CountableCoinWrapper.sol   # Passthrough wrapper — no validation (Path B)
│   ├── MinimalCountableCoin.sol   # Execution-time semantic validation only (Path C)
│   └── CountableCoin.sol          # Enterprise path: allowlist + EIP-712 (Paths D/E)
├── scripts/
│   ├── deploy_local.js            # Deploy all four contracts
│   ├── setup_local.js             # Configure allowlist, account/tax codes, signer
│   ├── emit_local.js              # Emit test events against a running local node
│   ├── benchmark_table2.js        # Five-path gas benchmark (reproduces Table II)
│   └── gas_compare.js             # Simplified ERC-20 vs transferWithCD comparison
├── watcher/
│   └── index.js                   # Event subscriber and SQLite storage
├── dashboard/
│   ├── server.js                  # REST API backed by SQLite
│   └── public/index.html          # Simple event-viewer UI
├── test/
│   └── CountableCoin.test.js      # Unit tests — 15 cases across all four contract paths
├── results/
│   └── benchmark_raw.json         # Pre-generated benchmark data for paper reproduction
├── hardhat.config.js
├── package.json
├── README.md
├── REPRODUCIBILITY.md
├── BENCHMARK.md
└── LICENSE
```

---

## Prerequisites

| Tool | Required version | Verify |
|------|-----------------|--------|
| Node.js | 18.x or later (20.x recommended) | `node --version` |
| npm | 9.x or later | `npm --version` |
| Git | any | `git --version` |

> **Windows users:** WSL2 (Ubuntu 22.04+) is strongly recommended.

---

## Quick Start

### Step 1 — Clone and install

```bash
git clone https://github.com/taihwan-choi/countable-coin-paper.git
cd countable-coin-paper
npm install
```

### Step 2 — Configure environment

```bash
cp .env.example .env
# Set COIN_ADDR after deployment (Step 3)
```

### Step 3 — Start a local blockchain and deploy

**Terminal A** (keep running):
```bash
npx hardhat node
```

**Terminal B**:
```bash
npm run compile
npm run deploy:local     # note the printed contract address; paste into .env as COIN_ADDR
npm run setup:local      # configure allowlist, account/tax codes, and authorized signer
```

### Step 4 — Start the watcher and dashboard

**Terminal C**:
```bash
npm run watcher
```

**Terminal D**:
```bash
npm run dashboard
# open http://localhost:8088 in your browser
```

### Step 5 — Emit test events

**Terminal B**:
```bash
npm run emit:local
# Terminal C should log incoming TransferWithCD events
```

---

## Unit Tests

```bash
npm test
```

All 15 test cases pass on the Hardhat in-process network. Coverage includes:

- Plain ERC-20 transfer (`StandardToken`)
- Passthrough transfer with arbitrary payload (`CountableCoinWrapper`)
- Semantic validation — valid payload, invalid length, missing fields, invalid date (`MinimalCountableCoin`)
- Allowlist enforcement, account/tax-code enforcement, valid EIP-712 signed transfer, and replay / expiry / unauthorized-signer rejection (`CountableCoin`)

---

## Benchmark

Full five-path gas measurement (reproduces Table II):

```bash
npm run benchmark
```

Quick two-path comparison (ERC-20 vs `transferWithCD`):

```bash
npm run gas:compare
```

See [BENCHMARK.md](BENCHMARK.md) for the benchmark design, warm/cold methodology, and result interpretation.

---

## Expected Results

```
Path A  ERC-20 baseline       :  35,098 gas   +0.00%
Path B  Lightweight Carriage  :  36,217 gas   +3.19%
Path C  Observable Semantic   :  42,477 gas  +21.02%
Path D  Allowlist Path        :  41,875 gas  +19.31%
Path E  Signed Enterprise     :  55,614 gas  +58.45%
```

Three operating points identified in the paper:

| Path | Label | Overhead | Recommended when |
|------|-------|----------|-----------------|
| B | Lightweight Carriage | +3.19% | Gas cost is the primary constraint; payload parsed off-chain |
| C | Observable Semantic | +21.02% | Direct ERP consumption; **recommended default** |
| E | Signed Enterprise | +58.45% | Internal-control signature required; regulatory environments |

All paths execute in O(1) — no unbounded loops on the transfer path.

---

## Security Notes

- Do **not** commit `.env` or any file containing real private keys or mainnet RPC URLs.
- This repository targets **local Hardhat networks** only.
- For testnet deployment, set `PRIVATE_KEY` and `RPC_URL` in `.env` appropriately.
- `node_modules/`, `.env`, `artifacts/`, and `cache/` must never be committed.

---

## License

[MIT License](LICENSE) — © 2026 Countable Coin Research