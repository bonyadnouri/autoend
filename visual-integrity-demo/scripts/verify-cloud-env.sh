#!/usr/bin/env bash
# Verify cloud-env profile after creating a saved environment in Cursor dashboard.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${CURSOR_API_KEY:?Set CURSOR_API_KEY in .env}"

if [[ -z "${CURSOR_CLOUD_ENV_NAME:-}" ]]; then
  echo "ERROR: CURSOR_CLOUD_ENV_NAME is not set." >&2
  echo "Create a saved environment first — see docs/cloud-env-setup.md" >&2
  exit 1
fi

if [[ -n "${CURSOR_REPO_URL:-}" ]]; then
  echo "ERROR: Unset CURSOR_REPO_URL when using cloud-env (mutually exclusive)." >&2
  exit 1
fi

echo "=== cloud-env verification ==="
echo "Environment: $CURSOR_CLOUD_ENV_NAME"
echo ""

pnpm agents:env:check

echo ""
echo "Next: run one scenario and compare timing to docs/cloud-timing-baseline.md"
echo "  pnpm agents:cloud user-dashboard-next"
echo ""
echo "Expected warm wall time: ~2-5 min (after snapshot exists)"
