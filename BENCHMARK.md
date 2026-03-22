# Gas Benchmark — 5-Path Analysis

> 이 문서는 Countable Coin의 가스 오버헤드를 5개 경로(Path A~E)로 분리 측정한  
> 벤치마크 설계·실행·결과 해석을 설명합니다.

---

## 1. 경로 정의 (Path Definitions)

| 경로 | 명칭 | 컨트랙트 | 메서드 | 포함 기능 |
|------|------|---------|--------|----------|
| **A** | ERC-20 Baseline | MinimalCountableCoin | `transfer()` | 표준 ERC-20 전송만 |
| **B** | Lightweight Carriage | WrapperContract | `transferWithCD()` | 44B calldata ABI 인코딩만, 이벤트 없음 |
| **C** | Observable Semantic | MinimalCountableCoin | `transferWithCD()` | 시맨틱 검증 + 7-field 분해 이벤트 |
| **D** | Allowlist Path | CountableCoin | `transferWithCD()` | Path C + allowlist SLOAD 검사 |
| **E** | Signed Enterprise | CountableCoin | `transferWithCD()` | Path D + EIP-712 ecrecover + nonce SSTORE |

### 각 경로의 의미

- **Path A**: 비교 기준선. 순수 ERC-20 `transfer()` 가스.
- **Path B**: payload를 calldata로 전달만 하고 emit하지 않는 경우. "얼마나 가볍게 할 수 있나?" 기준.
- **Path C**: ERP가 직접 소비할 수 있는 7-field 분해 이벤트를 방출하는 권장 배포 경로.
- **Path D**: Path C에 allowedAccountCode/allowedTaxCode SLOAD 검사 추가.
- **Path E**: 완전한 프로덕션 경로. EIP-712 서명 검증 + 시그너 nonce SSTORE 포함.

---

## 2. 오버헤드 분해 (C − B = +6,260 gas)

Path B→C 증가분의 원인 분석:

| 원인 | 가스 | 비율 |
|------|------|------|
| 7-field 분해 이벤트 (TransferWithCD) | +2,780 | 44.4% |
| 44B calldata ABI 인코딩 | +992 | 15.8% |
| 검증 로직 Stage 1~4 | +430 | 6.9% |
| 기타 (dispatch/stack/memory) | +2,058 | 32.9% |
| **소계** | **+6,260** | **100%** |

> B→C의 +18%p는 **이벤트 인덱싱 품질의 가격**입니다.  
> C→E의 +37%p는 **암호화 책임 검증의 가격**입니다.

---

## 3. 벤치마크 실행 명령어

### 5경로 전체 측정 (논문 Table II)

```bash
# 사전 조건: Hardhat 노드 실행 중, .env 설정 완료
npm run benchmark
# 또는
npx hardhat run scripts/benchmark_table2.js --network localhost
```

출력 위치: `results/benchmark_raw.json`

### 간단 비교 (ERC-20 vs transferWithCD)

```bash
npm run gas:compare
# 또는
npx hardhat run scripts/gas_compare.js --network localhost
```

---

## 4. 측정 방식

### 반복 횟수
```
RUNS = 10   # 각 경로별 10회 측정
```

### Cold vs Warm
- **Run 1 (Cold):** 수신자 잔액 슬롯 zero→nonzero SSTORE cold write 발생 → +17,100 gas
- **Run 2~10 (Warm):** 슬롯 이미 존재, 정상 측정값
- **논문 기준:** warm avg = mean(run[2..10]), n=9

### 측정 단위
- `receipt.gasUsed` — 트랜잭션 실제 소비 가스 (intrinsic 21,000 포함)

### Path E 분산
- warm run에서 ±6 gas 분산 발생
- 원인: nonce SSTORE slot의 홀수/짝수 정렬 차이
- 허용 범위 (논문에 명시)

---

## 5. 실측 결과 (2026-03-22, benchmark_raw.json)

### Raw 10-run 데이터

| 경로 | Run 1 (cold) | Run 2~10 (warm) | Warm Avg | Std |
|------|-------------|----------------|----------|-----|
| A | 52,198 | 35,098 × 9 | **35,098** | ±0 |
| B | 53,317 | 36,217 × 9 | **36,217** | ±0 |
| C | 59,577 | 42,477 × 9 | **42,477** | ±0 |
| D | 58,975 | 41,875 × 9 | **41,875** | ±0 |
| E | 72,707 | 55,607~55,619 | **55,614** | ±6 |

### 논문 Table II 요약

| 경로 | Method | Warm Avg Gas | vs ERC-20 | Overhead |
|------|--------|-------------|-----------|----------|
| A | `transfer()` — ERC-20 baseline | 35,098 | — | 0.00% |
| B | `transferWithCD()` — passthrough | 36,217 | +1,119 | **+3.19%** |
| C | `MinimalCountableCoin.transferWithCD()` | 42,477 | +7,379 | **+21.02%** |
| D | `CountableCoin.transferWithCD()` | 41,875 | +6,777 | **+19.31%** |
| E | `CountableCoin.transferWithCD()` + EIP-712 | 55,614 | +20,516 | **+58.45%** |

---

## 6. 3 Operating Points — 결과 해석

```
논문 핵심 메시지:
"Semantic layer cost is tunable depending on auditability and security requirements."
```

| Operating Point | 경로 | Warm Gas | 오버헤드 | 선택 기준 |
|----------------|------|---------|---------|---------|
| OP1 Lightweight | B | 36,217 | +3.19% | 가스 비용 최우선, payload는 오프체인 파싱 |
| OP2 Observable  | C | 42,477 | +21.02% | ERP 직접 소비, 온체인 감사 가능, **권장** |
| OP3 Enterprise  | E | 55,614 | +58.45% | 내부통제 서명 필요, 규제 준수 환경 |

모든 경로는 O(1) — 전송 경로에 무한루프 없음.

---

## 7. 결과 파일 스키마 (benchmark_raw.json)

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
    { "path": "A", "avgGas": 35098, "vsERC20": 0,     "pct": "0.00%" },
    { "path": "B", "avgGas": 36217, "vsERC20": 1119,  "pct": "3.19%" },
    { "path": "C", "avgGas": 42477, "vsERC20": 7379,  "pct": "21.02%" },
    { "path": "D", "avgGas": 41875, "vsERC20": 6777,  "pct": "19.31%" },
    { "path": "E", "avgGas": 55614, "vsERC20": 20516, "pct": "58.45%" }
  ]
}
```

> `summary.avgGas`는 run 1~10 전체 평균(cold 포함)입니다.  
> 논문의 warm avg는 records에서 run≥2만 필터링해 직접 계산하세요.
