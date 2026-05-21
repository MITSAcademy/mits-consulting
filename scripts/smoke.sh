#!/usr/bin/env bash
# Regression smoke-test. Run after every feature/change.
# Usage:  ./scripts/smoke.sh
# Returns non-zero if any check fails.

set -uo pipefail
BASE="${BASE:-http://localhost:4000/api}"
COOKIE_DIR=$(mktemp -d)
trap 'rm -rf "$COOKIE_DIR"' EXIT

PASS=0
FAIL=0

ok() { echo "  ✓ $*"; PASS=$((PASS+1)); }
ko() { echo "  ✗ $*"; FAIL=$((FAIL+1)); }

# ─────────────────────────────────────────────────────────
section() { echo ""; echo "▸ $*"; }

login() {
  local who="$1" email="$2"
  local body=$(curl -sS -c "$COOKIE_DIR/$who.cookies" -X POST "$BASE/auth/login" \
       -H 'Content-Type: application/json' \
       --data "{\"email\":\"$email\",\"password\":\"password123\"}")
  echo "$body" | grep -q '"user"' && ok "login $who" || ko "login $who: $body"
}

GET() {
  local who="$1" path="$2" expected="${3:-200}"
  local code=$(curl -sS -b "$COOKIE_DIR/$who.cookies" -o /tmp/smoke.out -w "%{http_code}" "$BASE$path")
  if [ "$code" = "$expected" ]; then ok "GET $path as $who → $code"
  else ko "GET $path as $who → $code (expected $expected) :: $(head -c 200 /tmp/smoke.out)"
  fi
}

POST() {
  local who="$1" path="$2" data="$3" expected="${4:-200}"
  local code=$(curl -sS -b "$COOKIE_DIR/$who.cookies" -X POST -H 'Content-Type: application/json' \
       --data "$data" -o /tmp/smoke.out -w "%{http_code}" "$BASE$path")
  if [ "$code" = "$expected" ]; then ok "POST $path as $who → $code"
  else ko "POST $path as $who → $code (expected $expected) :: $(head -c 200 /tmp/smoke.out)"
  fi
}

PATCHr() {
  local who="$1" path="$2" data="$3" expected="${4:-200}"
  local code=$(curl -sS -b "$COOKIE_DIR/$who.cookies" -X PATCH -H 'Content-Type: application/json' \
       --data "$data" -o /tmp/smoke.out -w "%{http_code}" "$BASE$path")
  if [ "$code" = "$expected" ]; then ok "PATCH $path as $who → $code"
  else ko "PATCH $path as $who → $code (expected $expected) :: $(head -c 200 /tmp/smoke.out)"
  fi
}

# ─────────────────────────────────────────────────────────
section "Health"
code=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/health")
[ "$code" = "200" ] && ok "health 200" || { ko "health → $code"; echo "Backend is down. Start it first."; exit 1; }

section "Logins for every role"
login vaibhav  vaibhav@mits.local
login samita   samita@mits.local
login anjali   anjali@mits.local
login aman     aman@mits.local
login roshni   roshni@mits.local
login mitali   mitali@mits.local
login areena   areena@mits.local
login malika   malika@mits.local

section "Public reads (every role can list core entities)"
GET vaibhav /clients
GET anjali  /clients
GET aman    /clients
GET vaibhav /trainers
GET anjali  /trainers
GET aman    /trainers
GET vaibhav /sourcing
GET anjali  /sourcing
GET aman    /sourcing
GET anjali  /metrics/home
GET vaibhav /metrics/pipeline
GET aman    /metrics/money-flow

section "Daily report endpoints"
GET anjali /audit/mine
GET vaibhav /audit "200"

section "Messages"
GET anjali /messages/health
POST anjali /messages/whatsapp '{"toPhone":"+919876543210","toName":"smoke","body":"hi"}' 201
POST anjali /messages/email    '{"to":"smoke@example.com","subject":"S","body":"hi"}' 503

section "Stage transition guards (RBAC)"
# Pick a Lead client and try to push it past what Anjali is allowed
CID=$(curl -sS -b "$COOKIE_DIR/anjali.cookies" "$BASE/clients?lifecycle=Lead" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')")
if [ -n "$CID" ]; then
  POST anjali "/clients/$CID/stage" '{"lifecycle":"Active"}' 403         # demo_intake → Active is forbidden
  POST anjali "/clients/$CID/stage" '{"lifecycle":"IntakeSent"}' 200      # allowed
  POST anjali "/clients/$CID/stage" '{"lifecycle":"Lead"}' 200            # roll back
else
  echo "  ⚠ no Lead client to test stage guard"
fi

section "Permission matrix on PATCH"
# Anjali cannot touch financial fields
if [ -n "$CID" ]; then
  PATCHr anjali "/clients/$CID" '{"cycleAmount":999}' 403          # financial blocked
  PATCHr anjali "/clients/$CID" '{"intakeData":{"detailed_skill_set":"smoke test"}}' 200  # workflow allowed
fi

section "Verification flow (Pass endpoint)"
PROP_ID=$(curl -sS -b "$COOKIE_DIR/anjali.cookies" "$BASE/sourcing?status=Proposed" \
  | python3 -c "import sys, json; d=json.load(sys.stdin); print(d[0]['proposals'][0]['id'] if d and d[0]['proposals'] else '')")
if [ -n "$PROP_ID" ]; then
  # Don't actually pass it — just check the endpoint exists and accepts
  code=$(curl -sS -b "$COOKIE_DIR/anjali.cookies" -X POST -o /tmp/smoke.out -w '%{http_code}' "$BASE/sourcing/proposal/$PROP_ID/pass")
  if [ "$code" = "200" ] || [ "$code" = "201" ] || [ "$code" = "409" ]; then ok "pass endpoint reachable → $code"
  else ko "pass endpoint → $code :: $(head -c 200 /tmp/smoke.out)"; fi
else
  echo "  ⚠ no proposed sourcing request to test"
fi

section "Sourcing: append more proposals"
OPEN_REQ=$(curl -sS -b "$COOKIE_DIR/aman.cookies" "$BASE/sourcing?status=Open" \
  | python3 -c "import sys, json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')")
if [ -n "$OPEN_REQ" ]; then
  # Missing confirmation should fail
  POST aman "/sourcing/$OPEN_REQ/proposals" '{"proposals":[{"trainerName":"Smoke","rateInr":500}]}' 400
  # With confirmation should succeed
  POST aman "/sourcing/$OPEN_REQ/proposals" '{"proposals":[{"trainerName":"Smoke","rateInr":500,"confirmationKind":"Audio","confirmationUrl":"/uploads/fake.mp3"}]}' 201
fi

section "Founder-only routes"
GET areena /flags 200
GET areena /audit 403
GET vaibhav /audit 200

section "Trainer pool: search + toggle"
T_ID=$(curl -sS -b "$COOKIE_DIR/aman.cookies" "$BASE/trainers" \
  | python3 -c "import sys, json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')")
if [ -n "$T_ID" ]; then
  PATCHr aman "/trainers/$T_ID" '{"active":false}' 200
  PATCHr aman "/trainers/$T_ID" '{"active":true}' 200
fi

# ─────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────"
echo "  ✓ $PASS passed   ✗ $FAIL failed"
echo "────────────────────────────────"
[ "$FAIL" -eq 0 ]
