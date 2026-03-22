#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
# check_repo.sh — GitHub 공개 전 안전 점검 스크립트
# 실행: bash check_repo.sh
# 또는: npm run check:repo
# ══════════════════════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
WARN=0
FAIL=0

pass() { echo -e "  ${GREEN}✅ PASS${NC}  $1"; ((PASS++)); }
warn() { echo -e "  ${YELLOW}⚠️  WARN${NC}  $1"; ((WARN++)); }
fail() { echo -e "  ${RED}❌ FAIL${NC}  $1"; ((FAIL++)); }

echo ""
echo -e "${BLUE}══════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Countable Coin — GitHub 공개 전 점검 도구  ${NC}"
echo -e "${BLUE}══════════════════════════════════════════════${NC}"
echo ""

# ──────────────────────────────────────────────
# 1. .env 파일 존재 여부
# ──────────────────────────────────────────────
echo -e "${BLUE}[1] 민감 파일 점검${NC}"

if [ -f ".env" ]; then
  warn ".env 파일이 존재합니다. git add 시 포함되지 않도록 주의하세요."
else
  pass ".env 파일 없음 (정상)"
fi

if [ -f ".env.local" ] || [ -f ".env.production" ]; then
  fail ".env.local 또는 .env.production 파일 발견 — 커밋 금지"
else
  pass ".env.local / .env.production 없음"
fi

# ──────────────────────────────────────────────
# 2. .gitignore에 필수 항목 존재 여부
# ──────────────────────────────────────────────
echo ""
echo -e "${BLUE}[2] .gitignore 항목 점검${NC}"

REQUIRED_IGNORES=(".env" "node_modules" "artifacts" "cache" "logs" "data" "*.db")
if [ -f ".gitignore" ]; then
  for item in "${REQUIRED_IGNORES[@]}"; do
    if grep -q "$item" .gitignore 2>/dev/null; then
      pass ".gitignore에 '$item' 포함"
    else
      fail ".gitignore에 '$item' 누락 — 추가 필요"
    fi
  done
else
  fail ".gitignore 파일이 없습니다."
fi

# ──────────────────────────────────────────────
# 3. node_modules 포함 여부 (git tracking)
# ──────────────────────────────────────────────
echo ""
echo -e "${BLUE}[3] node_modules git 추적 여부${NC}"

if git rev-parse --git-dir > /dev/null 2>&1; then
  if git ls-files --error-unmatch node_modules/ > /dev/null 2>&1; then
    fail "node_modules/가 git에 추적되고 있습니다. git rm -r --cached node_modules/ 실행 필요"
  else
    pass "node_modules/는 git 추적 대상 아님"
  fi
else
  warn "git 저장소가 초기화되지 않았습니다. (git init 필요)"
fi

# ──────────────────────────────────────────────
# 4. 개인키 / 시크릿 흔적 스캔
# ──────────────────────────────────────────────
echo ""
echo -e "${BLUE}[4] 개인키 / 시드 흔적 스캔${NC}"

# 스캔에서 제외할 경로
EXCLUDE_DIRS="--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=artifacts --exclude-dir=cache"

PRIVATE_KEY_PATTERNS=(
  "PRIVATE_KEY\s*=\s*0x[0-9a-fA-F]{64}"
  "privateKey\s*[:=]\s*['\"]0x[0-9a-fA-F]"
  "mnemonic\s*[:=]\s*['\"]"
  "seed phrase"
  "secret_key"
  "0x[0-9a-fA-F]{64}"
)

FOUND_SECRETS=0
for pattern in "${PRIVATE_KEY_PATTERNS[@]}"; do
  RESULT=$(grep -rE "$pattern" $EXCLUDE_DIRS \
    --exclude="*.json" --exclude="check_repo.sh" \
    --include="*.js" --include="*.ts" --include="*.env*" \
    --include="*.sol" --include="*.md" . 2>/dev/null || true)
  if [ -n "$RESULT" ]; then
    fail "개인키 패턴 발견: '$pattern'"
    echo "     → $RESULT" | head -3
    FOUND_SECRETS=1
  fi
done

if [ $FOUND_SECRETS -eq 0 ]; then
  pass "개인키 / 시드 패턴 미발견"
fi

# ──────────────────────────────────────────────
# 5. 대용량 파일 점검 (> 5MB)
# ──────────────────────────────────────────────
echo ""
echo -e "${BLUE}[5] 대용량 파일 점검 (> 5MB)${NC}"

LARGE_FILES=$(find . \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/artifacts/*" \
  -not -path "*/cache/*" \
  -size +5M -type f 2>/dev/null || true)

if [ -n "$LARGE_FILES" ]; then
  while IFS= read -r f; do
    SIZE=$(du -sh "$f" 2>/dev/null | cut -f1)
    fail "대용량 파일: $f ($SIZE) — .gitignore 추가 검토 필요"
  done <<< "$LARGE_FILES"
else
  pass "5MB 초과 파일 없음"
fi

# ──────────────────────────────────────────────
# 6. 필수 공개 파일 존재 여부
# ──────────────────────────────────────────────
echo ""
echo -e "${BLUE}[6] 필수 공개 파일 점검${NC}"

REQUIRED_FILES=("README.md" "LICENSE" ".gitignore" ".env.example" "REPRODUCIBILITY.md" "BENCHMARK.md" "hardhat.config.js" "package.json")
for f in "${REQUIRED_FILES[@]}"; do
  if [ -f "$f" ]; then
    pass "$f 존재"
  else
    fail "$f 없음 — 생성 필요"
  fi
done

# ──────────────────────────────────────────────
# 7. 컨트랙트 파일 존재 여부
# ──────────────────────────────────────────────
echo ""
echo -e "${BLUE}[7] 컨트랙트 파일 점검${NC}"

CONTRACT_FILES=("contracts/CountableCoin.sol" "contracts/MinimalCountableCoin.sol")
for f in "${CONTRACT_FILES[@]}"; do
  if [ -f "$f" ]; then
    pass "$f 존재"
  else
    warn "$f 없음"
  fi
done

# ──────────────────────────────────────────────
# 8. scripts 폴더 점검
# ──────────────────────────────────────────────
echo ""
echo -e "${BLUE}[8] 스크립트 파일 점검${NC}"

SCRIPT_FILES=(
  "scripts/deploy_local.js"
  "scripts/setup_local.js"
  "scripts/emit_local.js"
  "scripts/benchmark_table2.js"
  "scripts/gas_compare.js"
)
for f in "${SCRIPT_FILES[@]}"; do
  if [ -f "$f" ]; then
    pass "$f 존재"
  else
    warn "$f 없음"
  fi
done

# ──────────────────────────────────────────────
# 9. artifacts / cache 추적 여부
# ──────────────────────────────────────────────
echo ""
echo -e "${BLUE}[9] 빌드 산출물 git 추적 여부${NC}"

if git rev-parse --git-dir > /dev/null 2>&1; then
  for dir in "artifacts" "cache"; do
    if [ -d "$dir" ]; then
      TRACKED=$(git ls-files "$dir/" 2>/dev/null | head -1)
      if [ -n "$TRACKED" ]; then
        fail "$dir/ 가 git에 추적되고 있습니다. git rm -r --cached $dir/ 실행 필요"
      else
        pass "$dir/ 는 git 추적 대상 아님"
      fi
    else
      pass "$dir/ 폴더 없음 (정상 — compile 전)"
    fi
  done
else
  warn "git 저장소 미초기화"
fi

# ──────────────────────────────────────────────
# 결과 요약
# ──────────────────────────────────────────────
echo ""
echo -e "${BLUE}══════════════════════════════════════════════${NC}"
echo -e "  점검 결과 요약"
echo -e "${BLUE}══════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}PASS${NC}: $PASS"
echo -e "  ${YELLOW}WARN${NC}: $WARN"
echo -e "  ${RED}FAIL${NC}: $FAIL"
echo ""

if [ $FAIL -gt 0 ]; then
  echo -e "  ${RED}❌ FAIL 항목이 있습니다. 공개 전 반드시 수정하세요.${NC}"
  echo ""
  exit 1
elif [ $WARN -gt 0 ]; then
  echo -e "  ${YELLOW}⚠️  WARN 항목을 확인하세요. 공개 가능하지만 주의 필요.${NC}"
  echo ""
  exit 0
else
  echo -e "  ${GREEN}✅ 모든 점검 통과! GitHub에 올릴 준비가 되었습니다.${NC}"
  echo ""
  exit 0
fi
