# Countable Coin — On-Chain Accounting Semantic Layer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-orange)](contracts/CountableCoin.sol)
[![Hardhat](https://img.shields.io/badge/Hardhat-v2-yellow)](hardhat.config.js)

> **논문 보조 저장소** — IEEE ICBC / BCCA 제출 논문  
> *"Semantic Finality: Enforcing Accounting Meaning in ERC-20 Token Transfers"*  
> 재현 가능한 스마트컨트랙트 구현체 및 가스 벤치마크 코드를 제공합니다.

---

## 🔍 이 저장소가 무엇인가요?

일반 ERC-20 토큰은 **금액·송수신자**만 기록합니다.  
Countable Coin은 여기에 **44바이트 Countable Data** 페이로드를 결합해, 전송 실행 시점에 회계 의미(계정코드·날짜·세금코드·문서해시)를 온체인에서 검증·기록합니다.

이를 통해 ERP 시스템이 수동 대사(reconciliation) 없이 온체인 이벤트만으로 분개 처리를 자동화할 수 있습니다.

### Countable Data Schema (Table I, 44 bytes fixed)

| Offset | Field | Type | Size | Description |
|--------|-------|------|------|-------------|
| 0–3 | `accountCode` | uint32 | 4 B | IAS 1 원장 계정 코드 |
| 4–7 | `bookingDate` | uint32 | 4 B | YYYYMMDD 보고 기간 |
| 8–11 | `taxCode` | uint32 | 4 B | VAT/GST 세금 코드 |
| 12–43 | `documentHash` | bytes32 | 32 B | IAS 8 / SOX 증빙 문서 해시 |

---

## 🏗️ 시스템 아키텍처

```
① 스마트컨트랙트          ② 워처(Watcher)           ③ SQLite DB
┌──────────────┐  이벤트  ┌──────────────────┐  저장  ┌──────────────┐
│ CountableCoin│ ──────► │ watcher/index.js │ ─────► │ events.db    │
│ .sol         │          │ 이벤트 리스닝    │        │ (로컬 저장)  │
└──────────────┘          └──────────────────┘        └──────────────┘
  transferWithCD()          실시간 수집·파싱
  TransferWithCD 이벤트     이벤트 필드 저장
```

**데이터 흐름:**
1. 클라이언트가 `transferWithCD()`를 호출 → 컨트랙트가 의미 검증 후 `TransferWithCD` 이벤트 방출
2. 워처가 2초마다 폴링 → JSONL 파일 + SQLite DB에 저장 + 웹훅 POST (선택)
3. 대시보드가 JSONL을 읽어 브라우저에서 이벤트 목록·집계를 표시

---

## 📁 폴더 구조

```
countable-coin-paper/
├── contracts/
│   ├── StandardToken.sol          # ERC-20 baseline
│   ├── CountableCoinWrapper.sol   # Wrapper path (no semantic validation)
│   ├── MinimalCountableCoin.sol   # Minimal semantic path
│   └── CountableCoin.sol          # Enterprise path (allowlist + EIP-712)
├── scripts/
│   ├── deploy_local.js            # Deploy all contracts
│   ├── setup_local.js             # Initialize DB and controls
│   ├── emit_local.js              # Emit test events
│   ├── benchmark_table2.js        # Gas benchmark (Table II)
│   └── gas_compare.js             # Simple gas comparison
├── watcher/
│   └── index.js                   # Event listener and SQLite storage
├── dashboard/
│   ├── server.js                  # REST API for transfers/gas stats
│   └── public/index.html          # Simple HTML dashboard
├── test/
│   └── CountableCoin.test.js      # Unit tests
├── results/
│   └── benchmark_raw.json         # Benchmark results
├── hardhat.config.js
├── package.json
├── README.md
├── REPRODUCIBILITY.md
├── BENCHMARK.md
└── LICENSE
```

---

## ⚙️ 사전 준비사항

| 도구 | 필요 버전 | 확인 명령어 |
|------|----------|------------|
| Node.js | 18.x 이상 (20.x 권장) | `node --version` |
| npm | 9.x 이상 | `npm --version` |
| Git | 아무 버전 | `git --version` |

> **Windows 사용자:** WSL2 (Ubuntu 22.04+) 환경을 권장합니다.

---

## 🚀 빠른 시작 (Quick Start)

### 1단계 — 저장소 클론 및 의존성 설치

```bash
git clone https://github.com/countable-coin-research/countable-coin-paper.git
cd countable-coin-paper

npm install
```

### 2단계 — 환경 변수 설정

```bash
cp .env.example .env
# .env 파일은 배포 후 COIN_ADDR 값만 채우면 됩니다
# (아래 3단계 참고)
```

### 3단계 — 로컬 블록체인 실행 및 배포

**터미널 A** (계속 켜 둠):
```bash
npx hardhat node
```

**터미널 B**:
```bash
# 컴파일
npm run compile

# 배포
npm run deploy:local
# → 출력된 COIN_ADDR를 .env에 붙여넣기

# allowlist + signer 초기 설정 (필수!)
npm run setup:local
```

### 4단계 — 워처 + 대시보드 실행

**터미널 C**:
```bash
npm run watcher
```

**터미널 D**:
```bash
npm run dashboard
# → 브라우저: http://localhost:8088
```

### 5단계 — 이벤트 발행 테스트

**터미널 B**:
```bash
npm run emit:local
# → 터미널 C에 TransferWithCD 이벤트 로그 확인
```

---

## 📊 벤치마크 실행

5경로(A~E) 가스 측정 → `results/benchmark_raw.json` 자동 생성:

```bash
npm run benchmark
```

간단 비교 (ERC-20 vs transferWithCD):

```bash
npm run gas:compare
```

자세한 내용은 [BENCHMARK.md](BENCHMARK.md)를 참고하세요.

---

## 📈 기대 결과 예시

```
✅ results/benchmark_raw.json 저장 완료

 Path A (ERC-20 baseline)    : 35,098 gas   +0.00%
 Path B (wrapper passthrough): 36,217 gas   +3.19%
 Path C (minimal semantic)   : 42,477 gas  +21.02%
 Path D (allowlist)          : 41,875 gas  +19.31%
 Path E (EIP-712 + nonce)    : 55,614 gas  +58.45%
```

3 Operating Points:

| 경로 | 명칭 | 오버헤드 | 적합 시나리오 |
|------|------|----------|--------------|
| B | Lightweight Carriage | +3.19% | 가스 최우선, 오프체인 파싱 |
| C | Observable Semantic | +21.02% | ERP 직접 소비, 권장 배포 |
| E | Signed Enterprise | +58.45% | 내부통제 서명, 프로덕션 |

---

## ⚠️ 주의사항

- `.env` 파일에는 실제 개인키나 메인넷 RPC URL을 넣지 마세요.
- 이 저장소는 **로컬 Hardhat 네트워크** 기준으로 작성되었습니다.
- Sepolia 등 테스트넷 배포 시에는 `.env`에 적절한 `PRIVATE_KEY`와 `RPC_URL`을 설정하세요.
- `node_modules/`, `.env`, `logs/`, `data/`, `artifacts/`, `cache/`는 절대 커밋하지 마세요.

---

## 📄 라이선스

[MIT License](LICENSE) — © 2026 Countable Coin Research
