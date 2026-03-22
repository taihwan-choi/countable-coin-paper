# GitHub 업로드 직전 체크리스트

이 파일은 `git push` 전 마지막으로 확인할 항목들입니다.  
**모든 항목에 체크한 후 push하세요.**

---

## 1단계 — 안전 점검 스크립트 실행

```bash
bash check_repo.sh
# 또는
npm run check:repo
```

모든 항목이 ✅ PASS 또는 ⚠️ WARN이면 진행합니다.  
❌ FAIL이 있으면 반드시 수정 후 재실행합니다.

---

## 2단계 — 수동 확인 체크리스트

### 🔒 민감 정보

- [ ] `.env` 파일이 커밋 대상에 **없는지** 확인 (`git status`로 확인)
- [ ] `scripts/` 폴더의 어떤 파일에도 실제 개인키(0x + 64 hex)가 없는지 확인
- [ ] `hardhat.config.js`에 하드코딩된 개인키가 없는지 확인
- [ ] `watcher/config.js` 또는 `dashboard/server.js`에 외부 API 키가 없는지 확인
- [ ] `.env.example`에 실제 비밀값이 **없는지** 확인 (템플릿 값만 있어야 함)

### 📁 불필요한 파일

- [ ] `node_modules/` 폴더가 `git status`에 보이지 않는지 확인
- [ ] `artifacts/`, `cache/` 폴더가 커밋 대상이 아닌지 확인
- [ ] `logs/` 폴더가 커밋 대상이 아닌지 확인
- [ ] `data/`, `*.db` 파일이 커밋 대상이 아닌지 확인

### 📄 필수 파일

- [ ] `README.md` 존재 및 YOUR_USERNAME 자리에 실제 GitHub 사용자명 교체
- [ ] `LICENSE` 존재
- [ ] `.gitignore` 존재
- [ ] `.env.example` 존재
- [ ] `REPRODUCIBILITY.md` 존재
- [ ] `BENCHMARK.md` 존재
- [ ] `contracts/CountableCoin.sol` 존재
- [ ] `contracts/MinimalCountableCoin.sol` 존재
- [ ] `results/benchmark_raw.json` 존재 (논문 재현용 결과 파일)

### 🔧 설정 확인

- [ ] `package.json`의 `repository.url`에 실제 GitHub URL 입력
- [ ] `README.md`의 `git clone` URL에 실제 저장소 주소 입력
- [ ] `hardhat.config.js`가 올바른지 확인 (`node -e "require('./hardhat.config.js')"`)

---

## 3단계 — GitHub 업로드 명령어

```bash
# git 초기화 (처음 한 번만)
git init
git branch -M main

# 원격 저장소 연결 (GitHub에서 새 저장소 생성 후)
git remote add origin https://github.com/YOUR_USERNAME/countable-coin-paper.git

# 커밋 전 최종 확인
git status
git diff --cached

# 스테이징
git add .

# .env가 포함되지 않았는지 다시 확인
git status | grep -E "\.env$" && echo "⚠️ .env가 포함되어 있습니다! git rm --cached .env 실행 후 재시도" || echo "✅ .env 미포함 확인"

# 첫 커밋
git commit -m "feat: initial release — Countable Coin semantic ERC-20 with gas benchmark

- CountableCoin.sol: EIP-712 + allowlist + nonce semantic transfer
- MinimalCountableCoin.sol: benchmark Path C reference implementation  
- 5-path gas benchmark (A/B/C/D/E): results/benchmark_raw.json
- Watcher pipeline: event collection → JSONL + SQLite
- Dashboard: real-time event viewer
- Full reproducibility documentation"

# 푸시
git push -u origin main
```

---

## 4단계 — 업로드 후 확인

```bash
# GitHub에서 아래 파일들이 보이는지 확인
# - README.md (렌더링 확인)
# - contracts/CountableCoin.sol
# - results/benchmark_raw.json
# - .env 파일이 없는지 확인
# - node_modules/ 폴더가 없는지 확인
```

---

## 자주 하는 실수와 해결법

| 실수 | 해결법 |
|------|--------|
| `.env`를 커밋했을 때 | `git rm --cached .env && git commit -m "remove .env"` |
| `node_modules`를 커밋했을 때 | `git rm -r --cached node_modules/ && git commit -m "remove node_modules"` |
| `artifacts`를 커밋했을 때 | `git rm -r --cached artifacts/ && git commit -m "remove artifacts"` |
| 개인키를 코드에 직접 넣었을 때 | 해당 개인키를 즉시 폐기하고 새 키 생성. git history 정리 필요 (BFG Repo Cleaner 사용) |
