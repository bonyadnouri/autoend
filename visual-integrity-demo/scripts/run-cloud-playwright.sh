#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

SCENARIO="${1:-user-dashboard-next}"
TIMING_LOG="${HACK_RAISE_TIMING_LOG:-$ROOT/docs/cloud-timing.log}"

: "${CURSOR_API_KEY:?Set CURSOR_API_KEY in .env or environment}"

if [[ -n "${CURSOR_CLOUD_ENV_NAME:-}" ]]; then
  PROFILE="cloud-env"
  TARGET="env: $CURSOR_CLOUD_ENV_NAME"
else
  : "${CURSOR_REPO_URL:?Set CURSOR_REPO_URL or CURSOR_CLOUD_ENV_NAME in .env}"
  export CURSOR_STARTING_REF="${CURSOR_STARTING_REF:-main}"
  PROFILE="cloud-repo"
  TARGET="$CURSOR_REPO_URL @ $CURSOR_STARTING_REF"
fi

START_EPOCH="$(date +%s)"
START_ISO="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

echo "=== Hack Raise Cloud Playwright ==="
echo "Scenario:  $SCENARIO"
echo "Profile:   $PROFILE"
echo "Target:    $TARGET"
echo "Started:   $(date)"
echo "Stream logs below (warm snapshot ~2-5 min; cold cloud-repo ~10-15 min)..."
echo ""

set +e
pnpm agents:playwright -- --scenario "$SCENARIO"
EXIT_CODE=$?
set -e

END_EPOCH="$(date +%s)"
END_ISO="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
WALL_SEC=$((END_EPOCH - START_EPOCH))

echo ""
echo "=== Timing ==="
echo "Wall time: ${WALL_SEC}s (~$((WALL_SEC / 60)) min)"
echo "Exit:      $EXIT_CODE"

mkdir -p "$(dirname "$TIMING_LOG")"
{
  echo "${START_ISO} | ${END_ISO} | ${WALL_SEC}s | profile=${PROFILE} | scenario=${SCENARIO} | exit=${EXIT_CODE}"
} >> "$TIMING_LOG"
echo "Logged to: $TIMING_LOG"

exit "$EXIT_CODE"
