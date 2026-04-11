# Reproducibility Guide

> 이 문서는 논문 결과를 독립적으로 재현하기 위한 절차를 단계별로 설명합니다.  
> 모든 수치는 아래 환경에서 생성되었으며, 동일 환경에서 재현 시 ±0 (warm run 기준) 결과가 나와야 합니다.

---

## 1. 실험 환경

| 항목 | 값 |
|------|----|
| OS | Ubuntu 22.04 LTS (WSL2 on Windows 11) |
| Node.js | 22.x |
| npm | 10.x |
| Hardhat | 2.28.6 |
| @nomicfoundation/hardhat-toolbox | 6.1.0 |
| Solidity | 0.8.24 |
| optimizer | enabled, runs=200 |
| viaIR | true |
| ethers.js | 6.x |
| 네트워크 | Hardhat localhost (chainId 31337) |
| 블록 가스 한도 | Hardhat 기본값 (30,000,000) |
| 가스 가격 | 1 gwei (Hardhat 기본) |
| 측정 반복 횟수 | 10회 (RUNS=10) |
| warm avg 산정 | Run 2~10 (n=9) — Run 1 cold spike 제외 |

> **Cold spike 이유:** Run 1에서 수신자(Bob)의 ERC-20 잔액 슬롯이 zero→nonzero로 바뀌는 SSTORE cold write가 발생해 +17,100 gas가 추가됩니다. 논문 Table II는 warm 평균(Run 2~10)을 기준으로 합니다.

---

## 2. 저장소 설치

```bash
git clone https://github.com/taihwan-choi/countable-coin-paper.git
cd countable-coin-paper
npm install
```

의존성 설치 시 반드시 `--legacy-peer-deps`가 필요합니다. `package.json`의 `preinstall` 스크립트가 자동 처리하거나, 수동으로:

```bash
npm i -D hardhat@^2.28.6 @nomicfoundation/hardhat-toolbox@^6.1.0 --legacy-peer-deps
npm i ethers@^6 dotenv express better-sqlite3 node-fetch
```

---

## 3. 컴파일

```bash
npm run compile
# 또는
npx hardhat compile
```

기대 출력:
```
Compiled 2 Solidity files successfully
  - CountableCoin
  - MinimalCountableCoin
```

---

## 4. 로컬 노드 실행

```bash
# 터미널 A — 계속 켜 둠
npx hardhat node
```

기대 출력 (첫 줄):
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
```

---

## 5. 배포 및 초기 설정

```bash
# 터미널 B
npm run deploy:local
```

출력에서 주소 확인 (deployed_addresses.json에 저장됨).

초기 설정 (allowlist + account/tax codes + signer 등록):

```bash
npm run setup:local
```

기대 출력:
```
[1/4] setAllowlist(alice, true) ✅
[2/4] setAllowedAccountCode: [1001, 1002, 2001] ✅
[3/4] setAllowedTaxCode: [10, 20, 0] ✅
[4/4] setAuthorizedSigner(alice, true) ✅
```

---

## 6. 벤치마크 실행 (논문 Table II 재현)

```bash
npm run benchmark
```

스크립트: `scripts/benchmark_table2.js`

이 스크립트는:
1. `StandardToken`, `CountableCoinWrapper`, `MinimalCountableCoin`, `CountableCoin` 네 컨트랙트를 배포합니다.
2. A/C/D/E 경로를 각 10회 측정합니다.
3. `results/benchmark_raw.json`에 타임스탬프 포함 raw 데이터를 저장합니다.

> **Path B (Wrapper passthrough)**는 별도 Wrapper 컨트랙트를 사용하는 경로로,  
> `scripts/gas_compare.js`에서 간략히 측정됩니다.

---

## 7. 결과 파일 위치

| 파일 | 내용 |
|------|------|
| `results/benchmark_raw.json` | 10회 raw gas 데이터 + summary |

---

## 8. Warm Average 산정 방법

```
warmAvg(path) = average(run[2], run[3], ..., run[10])
              = sum(run[2..10]) / 9
```

`benchmark_raw.json`의 `records` 배열에서 `run >= 2`인 항목만 필터링해 평균을 구합니다.

```js
const warm = records.filter(r => r.path === 'A' && r.run >= 2);
const warmAvg = Math.round(warm.reduce((s, r) => s + r.gasUsed, 0) / warm.length);
```

---

## 9. 논문 Table II와 결과 연결

| 논문 표기 | 이 저장소 경로 | 측정 스크립트 | warm avg (gas) | 오버헤드 |
|-----------|--------------|--------------|---------------|---------|
| ERC-20 baseline | Path A | benchmark_table2.js | 35,098 | 0.00% |
| Lightweight Carriage | Path B | gas_compare.js | 36,217 | +3.19% |
| Observable Semantic | Path C | benchmark_table2.js | 42,477 | +21.02% |
| Allowlist Path | Path D | benchmark_table2.js | 41,875 | +19.31% |
| Signed Enterprise | Path E | benchmark_table2.js | 55,614 | +58.45% |

> 위 수치는 `results/benchmark_raw.json`에 저장된 2026-03-22T01:30:29Z 측정값입니다.  
> 동일 환경 재현 시 warm avg는 ±0이어야 하며, Path E는 nonce slot 정렬 차이로 ±6 gas 허용됩니다.

---

## 10. 자주 발생하는 재현 오류

| 증상 | 원인 | 해결 |
|------|------|------|
| `HardFail: signer not authorized` | setup_local.js 미실행 | `npm run setup:local` 실행 |
| `HardFail: accountCode not in allowlist` | allowlist 미설정 | setup_local.js의 코드 목록 확인 |
| 가스 수치가 크게 다름 | Hardhat 버전 불일치 | `npm list hardhat` → 2.28.6 확인 |
| Run 1 수치가 ~17,000 높음 | 정상 — cold SSTORE spike | warm avg(run 2~10)만 사용 |
| Path E ±6 차이 | 정상 — nonce slot 홀짝 정렬 차이 | 허용 범위 |
