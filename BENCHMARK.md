
# Benchmark Notes

This document explains the purpose and interpretation of the benchmark paths in the Countable Coin research-demo repository.

## Purpose

The benchmark is intended to compare the relative gas overhead of different transfer paths, including:

* a baseline ERC-20 path
* a wrapper-only path
* a minimal semantic validation path
* an enterprise semantic validation path
* a signed enterprise path, where applicable

The goal is not to claim a production gas model, but to show how semantic validation and policy enforcement affect execution cost in a controlled research-demo setting.

## Path definitions

### Baseline ERC-20 path

This is the plain token transfer path provided by `StandardToken`. It is the reference point for comparison.

### Wrapper-only path

This path is provided by `CountableCoinWrapper`. It introduces wrapper-level transfer handling without semantic validation.

### Minimal semantic path

This path is provided by `MinimalCountableCoin`. It validates the fixed-length Countable Data payload and emits a structured semantic event.

### Enterprise semantic path

This path is provided by `CountableCoin`. It includes semantic validation plus enterprise policy checks such as sender allowlisting and allowed code validation.

### Signed enterprise path

Where measured separately, this path includes signed transfer support with signer authorization, nonce handling, and deadline enforcement in addition to semantic validation and policy checks.

## Interpretation

Benchmark results should be interpreted carefully.

* The first run may include cold-access effects.
* Later runs may better represent warm execution.
* Exact gas values can vary depending on environment, compiler settings, and benchmark setup.

For this reason, the benchmark should be read as a comparative research-demo measurement rather than a definitive production gas study.

## Result artifacts and scripts

Use the benchmark scripts and result files currently included in the repository as the source of truth for benchmark execution and recorded outputs.

## Caveat

The benchmark demonstrates relative overhead trends for the paths implemented in this repository. It is not intended to serve as a universal performance claim for all deployment environments.
