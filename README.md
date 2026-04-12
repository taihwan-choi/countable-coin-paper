# Countable Coin Paper

 **Research-Demo Artifact**
This repository is a paper-aligned PoC for Countable Coin.
It demonstrates execution-time semantic validation and structured on-chain semantic event emission.
It is **not** a production-ready enterprise payment platform.

## Scope

### What this repo demonstrates
- 44-byte Countable Data payload parsing and execution-time semantic validation
- Structured on-chain semantic event emission (`accountCode`, `bookingDate`, `taxCode`, `documentHash`)
- Baseline, wrapper-only, minimal semantic, and enterprise signed paths
- Benchmark comparisons across transfer paths
- A local watcher pipeline with SQLite-backed storage

### What this repo does not include
- Production-grade custody or key management
- Full ERP integration
- Privacy-preserving deployment
- Admin platform or management UI
- Mainnet deployment

### Current limitations
- Local Hardhat network only
- Research-demo admin/governance model
- Minimal local watcher scope

This repository is a reproducible research-demo artifact for **Countable Coin**, a token-layer framework that brings **execution-time semantic validation** to blockchain token transfers.

Conventional ERC-20 transfers provide value transfer and ownership finality, but they do not express transaction meaning in a machine-verifiable way at execution time. Countable Coin extends this model by attaching a fixed-length **Countable Data** payload to token transfers and validating that payload during execution. The result is a structured on-chain event that can be consumed by downstream systems such as accounting, compliance, or audit-oriented processing pipelines.

## What this repository demonstrates

This repository includes a minimal but reproducible implementation of:

- a baseline ERC-20 transfer path
- a wrapper-only transfer path without semantic validation
- a minimal semantic validation path
- an enterprise path with policy controls and signed transfer support
- a SQLite-backed local watcher that consumes semantic transfer events

## Core concept

Countable Coin introduces a fixed-length 44-byte semantic payload called **Countable Data**.

Payload layout:

- `accountCode` — 4 bytes
- `bookingDate` — 4 bytes
- `taxCode` — 4 bytes
- `documentHash` — 32 bytes

This payload is validated at execution time in the semantic transfer paths. Instead of treating a token transfer as pure value movement, the system treats it as a structured business event with machine-readable meaning.

## Repository layout

- `contracts/StandardToken.sol` — baseline ERC-20 path
- `contracts/CountableCoinWrapper.sol` — wrapper-only path without semantic validation
- `contracts/MinimalCountableCoin.sol` — minimal semantic validation path
- `contracts/CountableCoin.sol` — enterprise path with semantic validation, policy checks, and signed transfer support
- `scripts/` — local deployment, setup, and emission helpers
- `test/CountableCoin.test.js` — unit tests for the contract paths
- `watcher/index.js` — SQLite-backed watcher for `TransferWithCD`
- `REPRODUCIBILITY.md` — reproducibility and execution guide
- `BENCHMARK.md` — benchmark notes and interpretation

## System architecture

The current repository demonstrates the following flow:

1. A semantic transfer is executed on-chain.
2. The contract emits a structured `TransferWithCD` event.
3. The local watcher listens to that event.
4. The watcher stores parsed event fields in SQLite.

This repository intentionally keeps the watcher minimal and local. It is designed as a research-demo consumer of on-chain semantic events.

## Contract paths

### 1. StandardToken

`StandardToken` is the plain ERC-20 baseline path. It is included to provide a simple comparison point for gas and behavior.

### 2. CountableCoinWrapper

`CountableCoinWrapper` is a wrapper-only path. It demonstrates the cost of a wrapper-style interface without semantic validation.

### 3. MinimalCountableCoin

`MinimalCountableCoin` performs basic execution-time validation of the 44-byte Countable Data payload. It validates:

- payload length
- required non-zero fields
- basic booking date validity

It then emits a structured semantic event.

### 4. CountableCoin

`CountableCoin` is the enterprise-oriented path. In addition to semantic validation, it supports:

- sender allowlisting
- allowed account code checks
- allowed tax code checks
- authorized signer checks
- signed transfer flow with nonce and deadline protection

## Execution-time validation

The semantic paths in this repository validate the Countable Data payload during transfer execution.

Validation includes:

- exact 44-byte payload length
- non-zero required fields
- simple `YYYYMMDD`-style booking date checks
- enterprise policy checks for allowed account codes and tax codes
- signer authorization and replay protection in the signed path

This is the key research-demo property of the repository: the semantic layer is enforced during execution rather than added only as off-chain interpretation after settlement.

## Quick start

```bash
git clone https://github.com/taihwan-choi/countable-coin-paper.git
cd countable-coin-paper
npm install
npx hardhat compile
npx hardhat test
```

## Reproducibility

For a step-by-step local workflow, see:

* `REPRODUCIBILITY.md`

## Benchmark notes

For benchmark interpretation and path descriptions, see:

* `BENCHMARK.md`

## Current scope and limitations

This repository is a **research-demo artifact**, not a production-ready payment system.

Current limitations include:

* minimal local watcher scope
* no production-grade privacy layer
* no end-to-end enterprise integration stack
* no production hardening beyond the demo paths included here

Privacy-preserving extensions, broader interoperability, and richer enterprise integrations are future work.

## License

MIT
