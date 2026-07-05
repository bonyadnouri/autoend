#!/usr/bin/env bash
# Thin cloud scenario runner — deps should already be installed via environment.json snapshot.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SCENARIO="${HACK_RAISE_SCENARIO_ID:-}"
RUN_ID="${HACK_RAISE_RUN_ID:-}"

if [[ -z "$SCENARIO" ]]; then
  echo "ERROR: HACK_RAISE_SCENARIO_ID is not set" >&2
  exit 1
fi

echo "=== Hack Raise cloud scenario ==="
echo "Scenario:  $SCENARIO"
echo "Run ID:    ${RUN_ID:-<runner-generated>}"
echo ""

ARGS=(--scenario "$SCENARIO")
if [[ -n "$RUN_ID" ]]; then
  ARGS+=(--run-id "$RUN_ID")
fi

set +e
pnpm test:e2e -- "${ARGS[@]}"
EXIT_CODE=$?
set -e

ARTIFACT_DIR="${HACK_RAISE_ARTIFACT_DIR:-.hack-raise/runs}"
if [[ -n "$RUN_ID" ]]; then
  MANIFEST="$ROOT/$ARTIFACT_DIR/$RUN_ID/run-manifest.json"
else
  MANIFEST="$(find "$ROOT/$ARTIFACT_DIR" -name run-manifest.json -type f 2>/dev/null | sort -r | head -1)"
fi

echo ""
echo "Exit code: $EXIT_CODE (1 = seeded bugs reproduced, expected)"
if [[ -f "${MANIFEST:-}" ]]; then
  echo "Manifest:  $MANIFEST"
  node -e "
    const fs = require('fs');
    const m = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const bugs = (m.scenarioRuns || []).flatMap(r => (r.findings || []).map(f => f.bugId));
    console.log('Findings:', bugs.length ? bugs.join(', ') : 'none');
    for (const run of m.scenarioRuns || []) {
      for (const a of run.artifacts || []) {
        if (a.kind === 'screenshot' || a.kind === 'trace') console.log('Artifact:', a.path);
      }
    }
  " "$MANIFEST"
else
  echo "Manifest:  not found under $ARTIFACT_DIR"
fi

exit "$EXIT_CODE"
