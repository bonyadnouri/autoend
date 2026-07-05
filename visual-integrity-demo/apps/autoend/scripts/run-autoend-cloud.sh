#!/usr/bin/env bash
# Runs one autoend Run non-interactively on a Cursor Cloud VM. Never opens a
# browser, never starts the viewer server, never prompts. See
# docs/autoend-cloud-adapter-design.md for the full design.
set -euo pipefail

# apps/autoend/scripts/.. is apps/autoend; one more level up is the monorepo root.
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

: "${AUTOEND_RUN_ID:?AUTOEND_RUN_ID is required}"
: "${AUTOEND_TARGET:?AUTOEND_TARGET is required}"
: "${AUTOEND_EFFORT:?AUTOEND_EFFORT is required}"

case "${AUTOEND_TARGET}" in
  http://localhost*|http://127.0.0.1*|https://localhost*|https://127.0.0.1*)
    echo "ERROR: AUTOEND_TARGET (${AUTOEND_TARGET}) is a localhost address." >&2
    echo "Cloud runs cannot reach the developer's machine. Use a staging/preview/tunnel URL." >&2
    exit 2
    ;;
esac

if ! curl -sf --max-time 10 "${AUTOEND_TARGET}" >/dev/null 2>&1; then
  echo "ERROR: AUTOEND_TARGET (${AUTOEND_TARGET}) is not reachable from this VM." >&2
  exit 2
fi

echo "=== autoend cloud run ==="
echo "Target:     ${AUTOEND_TARGET}"
echo "Effort:     ${AUTOEND_EFFORT}"
echo "Run ID:     ${AUTOEND_RUN_ID}"
echo "Artifacts:  ${AUTOEND_ARTIFACT_DIR:-.autoend/runs}/${AUTOEND_RUN_ID}"
echo ""

# The in-VM explore phase needs its own Cursor SDK credential; map the
# Cloud Secret (never passed through cloud.envVars, see
# docs/autoend-cloud-adapter-design.md#cursor_api_key-handling) onto the name
# the exploration code actually reads.
if [[ -z "${CURSOR_API_KEY:-}" && -n "${AUTOEND_CURSOR_API_KEY:-}" ]]; then
  export CURSOR_API_KEY="${AUTOEND_CURSOR_API_KEY}"
fi

pnpm --filter @hack-raise/autoend build

# --no-open is implied by --no-serve (no viewer process = nothing to open),
# kept explicit for readers.
node apps/autoend/dist/cli.js "${AUTOEND_TARGET}" -e "${AUTOEND_EFFORT}" --no-serve --no-open
