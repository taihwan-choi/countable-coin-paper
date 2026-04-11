# Countable Coin Paper

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-orange)](contracts/CountableCoin.sol)
[![Hardhat](https://img.shields.io/badge/Hardhat-v2-yellow)](hardhat.config.js)

This repository is a reproducible research-demo artifact for the paper *"Semantic Finality: Enforcing Accounting Meaning in ERC-20 Token Transfers"* (IEEE ICBC / BCCA). It provides four Solidity contract implementations that demonstrate **execution-time semantic validation** of token transfers using a fixed-length **Countable Data** payload, together with a five-path gas benchmark, a SQLite-backed event watcher, and a full unit-test suite.

---

## What this repository demonstrates

- **Baseline ERC-20 transfer** — a plain `transfer()` call with no additional semantics (Path A)
- **Wrapper-only path** — a `transferWithCD()` call that accepts the 44-byte payload but performs no validation (Path B)
- **Minimal semantic validation path** — payload length, field presence, and booking-date validity are enforced on-chain at execution time (Path C)
- **Enterprise path** — adds an allowlist, per-code policy checks, and EIP-712 signed transfer support to the semantic validation path (Paths D/E)
- **Event consumption via a SQLite-backed watcher** — a minimal local subscriber that persists structured `TransferWithCD` event fields to a local SQLite database

---

## Core concept

Standard ERC-20 transfers provide value transfer and ownership finality: they record an amount and two addresses, and nothing else. Countable Coin adds **structured transaction meaning** at execution time by requiring callers to supply a **Countable Data** payload with every transfer.

The payload is exactly **44 bytes**, packed as:

| Offset | Field | Type | Size | Description |
|--------|-------|------|------|-------------|
| 0–3 | `accountCode` | uint32 | 4 B | General-ledger account code (IAS 1); must be non-zero |
| 4–7 | `bookingDate` | uint32 | 4 B | Reporting period in YYYYMMDD format; calendar-validated |
| 8–11 | `taxCode` | uint32 | 4 B | VAT/GST tax classification code; must be non-zero |
| 12–43 | `documentHash` | bytes32 | 32 B | Source-document hash (IAS 8 / SOX); must be non-zero |

The semantic paths validate this payload on-chain at the point of execution. If any field is missing or invalid, the transaction reverts before any balance change occurs. This property — that the token transfer cannot complete without valid accounting metadata — is what the paper terms **semantic finality**.

---

## Repository layout

```
contracts/
  StandardToken.sol          — baseline ERC-20 path (Path A)
  CountableCoinWrapper.sol   — wrapper-only path, no semantic validation (Path B)
  MinimalCountableCoin.sol   — minimal semantic validation path (Path C)
  CountableCoin.sol          — enterprise path: semantic validation, policy checks,
                               and signed transfer support (Paths D/E)

scripts/
  deploy_local.js            — deploy all four contracts to a local Hardhat node
  setup_local.js             — initialise SQLite schema, distribute test tokens,
                               configure allowlist / account codes / tax codes / signer
  emit_local.js              — send five test TransferWithCD transactions
  benchmark_table2.js        — five-path gas benchmark (reproduces paper Table II)
  gas_compare.js             — simplified two-path gas comparison

test/
  CountableCoin.test.js      — 15 unit tests covering all four contract paths

watcher/
  index.js                   — SQLite-backed event subscriber for TransferWithCD

dashboard/
  server.js                  — REST API backed by the SQLite database
  public/index.html          — simple browser event viewer

results/
  benchmark_raw.json         — pre-generated benchmark data for paper reproduction

REPRODUCIBILITY.md           — step-by-step reproduction guide
BENCHMARK.md                 — benchmark design and result interpretation
```

---

## System architecture

The repository demonstrates the following local data flow:

1. A client calls `transferWithCD()` on the contract.
2. The contract validates the 44-byte Countable Data payload at execution time, then emits a structured `TransferWithCD` event containing all decoded accounting fields.
3. The watcher (`watcher/index.js`) subscribes to `TransferWithCD` events using an ethers.js JSON-RPC provider.
4. The watcher inserts the parsed event fields into a local SQLite database (`events.db`).

The watcher is a minimal local research-demo consumer. It does not use polling, a JSONL sink, or a webhook.

---

## Contract paths

### `StandardToken` (Path A)
A plain OpenZeppelin ERC-20 token. Used as the gas-cost baseline. Transfers carry no accounting metadata.

### `CountableCoinWrapper` (Path B)
Accepts a `bytes calldata` payload in `transferWithCD()` but ignores it entirely — no parsing, no validation, no event emission. Isolates the cost of carrying the 44-byte calldata field.

### `MinimalCountableCoin` (Path C)
Performs **execution-time semantic validation**: verifies payload length, checks that all required fields are non-zero, and validates the booking date against a calendar rule. Emits a seven-field `TransferWithCD` event on success. No allowlist or signature mechanism.

### `CountableCoin` (Paths D/E)
The **enterprise path**. Extends `MinimalCountableCoin` with:
- An allowlist (`setAllowlist`) restricting which addresses may call `transferWithCD`
- Per-code policy enforcement (`setAllowedAccountCode`, `setAllowedTaxCode`)
- EIP-712 typed-data signed transfer (`transferWithCDSigned`) with per-signer nonces and a deadline, enabling delegated execution with replay protection

---

## Execution-time validation

The semantic paths enforce the following checks before any token balance changes:

- **Payload length** — exactly 44 bytes; reverts otherwise
- **Non-zero required fields** — `accountCode`, `bookingDate`, `taxCode`, and `documentHash` must all be non-zero
- **Date validity** — `bookingDate` must parse as a valid calendar date (YYYYMMDD) within the year range 2000–2100
- **Policy checks** (enterprise path only) — `accountCode` and `taxCode` must appear in the on-chain allowlists configured by the contract owner
- **Authorization and replay protection** (signed path only) — the EIP-712 signature must be from an authorized signer, the deadline must not have passed, and the nonce must not have been used before

---

## Quick start

```bash
git clone https://github.com/taihwan-choi/countable-coin-paper.git
cd countable-coin-paper
npm install
npx hardhat compile
npx hardhat test
```

For the full local demo (watcher + event emission), see [REPRODUCIBILITY.md](REPRODUCIBILITY.md).

For the gas benchmark, see [BENCHMARK.md](BENCHMARK.md).

---

## Current scope and limitations

- This is a **research-demo artifact**, not a production-ready payment or accounting system.
- The repository targets local Hardhat networks. Mainnet or testnet deployment requires additional security review and key management.
- The Countable Data schema is a fixed research prototype; production use would require schema versioning and governance mechanisms.
- Privacy-preserving extensions (e.g., commitment schemes, ZK proofs over accounting fields) and broader ERP integration patterns are identified as future work in the paper.

---

## License

[MIT License](LICENSE) — © 2026 Countable Coin Research

---

> **Korean note (한국어 요약):** 이 저장소는 *"Semantic Finality"* 논문의 재현 코드입니다. `npm install && npx hardhat test`로 즉시 실행 가능합니다.