#!/usr/bin/env bash
# Run autoend against the local testpad (http://127.0.0.1:3100).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${AUTOEND_TARGET:-http://127.0.0.1:3100}"
EFFORT="${AUTOEND_EFFORT:-low}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if ! curl -sf "${TARGET}/__testbed/contract.json" >/dev/null 2>&1; then
  echo "ERROR: testpad not reachable at ${TARGET}" >&2
  echo "Start it with: pnpm dev:testpad" >&2
  exit 1
fi

if [[ ! -f .autoend/config.json ]]; then
  mkdir -p .autoend
  cat > .autoend/config.json <<EOF
{
  "target": "${TARGET}",
  "effort": "${EFFORT}"
}
EOF
fi

EXTRA=()
if [[ "${AUTOEND_NO_OPEN:-}" == "1" ]]; then EXTRA+=(--no-open); fi
if [[ "${AUTOEND_NO_SERVE:-}" == "1" ]]; then EXTRA+=(--no-serve); fi

pnpm --filter @hack-raise/autoend build >/dev/null
exec node "${ROOT}/apps/autoend/dist/cli.js" "${TARGET}" -e "${EFFORT}" "${EXTRA[@]}" "$@"
