# Reproducibility Guide

This document explains how to reproduce the main local workflow for the Countable Coin research-demo repository.

## 1. Environment

Recommended environment:

- Node.js
- npm
- local Hardhat network

This repository is intended to be run locally for research-demo purposes.

## 2. Clone and install

```bash
git clone https://github.com/taihwan-choi/countable-coin-paper.git
cd countable-coin-paper
npm install
```

## 3. Compile and test

```bash
npx hardhat compile
npx hardhat test
```

The test suite covers the four contract paths and includes semantic validation, policy enforcement, and signed transfer checks.

## 4. Start a local Hardhat node

```bash
npx hardhat node
```

Keep this process running in a separate terminal.

## 5. Deploy locally

In another terminal:

```bash
npm run deploy:local
```

This deploys the local demo contracts and writes deployed addresses for subsequent local scripts.

## 6. Configure local policies

Run the local setup script:

```bash
npm run setup:local
```

This script configures the local demo environment for the enterprise path, including the relevant policy state used by the repository, such as:

- allowlist entries
- allowed account codes
- allowed tax codes
- authorized signer configuration

Use the script output as the source of truth for the local setup state.

## 7. Emit a local semantic transfer

Run:

```bash
npm run emit:local
```

This demonstrates a semantic transfer flow that emits a structured `TransferWithCD` event.

## 8. Run the watcher

Run the watcher in a separate terminal:

```bash
node watcher/index.js
```

The watcher is a minimal local research-demo consumer. It:

- listens to `TransferWithCD`
- parses semantic event fields
- stores them in SQLite

## 9. Benchmark

See `BENCHMARK.md` for benchmark interpretation and path definitions.

If benchmark scripts are present in the repository, run them using the documented local script flow or the benchmark script names currently included in the repo.

## 10. Expected outcomes

A successful local reproduction should give you the following:

- contracts compile successfully
- tests pass successfully
- local semantic transfer emits a structured event
- watcher records semantic event fields into SQLite

## Notes

This repository is intentionally scoped as a reproducible research-demo artifact. It is not a production deployment package.
