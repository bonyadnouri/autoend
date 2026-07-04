import type { Finding, FindingKind } from '../src/report/types.js';

/**
 * Pure scoring for the benchmark, shared between the seeded mini-app and the
 * future Grafana real-history bench (ADR-0009). No I/O, no LLM — unit-testable.
 */

/** One row of the ground-truth manifest (bench/mini-app/truth.json). */
export interface TruthEntry {
  id: string;
  /** The seeded bug flag that turns this behavior on. */
  bug: string;
  /** A Finding counts as a rediscovery only if its kind is one of these. */
  expectKind: FindingKind[];
  /**
   * Substring matcher over lowercase(title + " " + detail): every `all` term
   * must appear, and — if `any` is present and non-empty — at least one `any`.
   * Terms are chosen to survive paraphrase.
   */
  match: { all: string[]; any?: string[] };
  description: string;
}

export interface DiscoveryScore {
  /** Truth-entry ids rediscovered by some Finding of an expected kind. */
  detected: string[];
  /** Seeded truth-entry ids that no Finding matched. */
  missed: string[];
  /** Defect Findings that match no seeded truth entry — the false-positive rate. */
  falseDefects: Finding[];
  findingsTotal: number;
}

export interface DispositionScore {
  correct: string[];
  wrong: Array<{ id: string; got: string; want: string }>;
  /** Findings that were expected but absent, or present without a Disposition. */
  missing: string[];
}

function haystack(finding: Finding): string {
  return `${finding.title} ${finding.detail}`.toLowerCase();
}

/**
 * Does a Finding match a truth entry's substring rule? Kind is not considered
 * here (scoreDiscovery layers that on for detection); this is the raw text match.
 */
export function matchesEntry(finding: Finding, entry: TruthEntry): boolean {
  const hay = haystack(finding);
  const all = entry.match.all.every((s) => hay.includes(s.toLowerCase()));
  const any =
    !entry.match.any ||
    entry.match.any.length === 0 ||
    entry.match.any.some((s) => hay.includes(s.toLowerCase()));
  return all && any;
}

/**
 * Score a discovery Run: for each seeded bug, did the fleet rediscover it (a
 * matching Finding of an expected kind), and did it invent Defects that map to
 * no seeded bug? Only truth entries whose bug is in `seededBugIds` are in play,
 * so a Defect claiming an off bug counts as a false Defect.
 */
export function scoreDiscovery(
  findings: Finding[],
  truth: TruthEntry[],
  seededBugIds: Set<string>,
): DiscoveryScore {
  const seeded = truth.filter((t) => seededBugIds.has(t.bug));
  const detected: string[] = [];
  const missed: string[] = [];
  for (const entry of seeded) {
    const hit = findings.some((f) => matchesEntry(f, entry) && entry.expectKind.includes(f.kind));
    (hit ? detected : missed).push(entry.id);
  }
  const falseDefects = findings.filter(
    (f) => f.kind === 'defect' && !seeded.some((entry) => matchesEntry(f, entry)),
  );
  return { detected, missed, falseDefects, findingsTotal: findings.length };
}

/**
 * Score Disposition accuracy (upgrade-triage mode): compare each Finding's
 * Triage verdict against what was expected, keyed by Finding id. A Finding that
 * is absent, or present without a Disposition, is `missing` — never `wrong`.
 */
export function scoreDispositions(
  findings: Finding[],
  expected: Record<string, string>,
): DispositionScore {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const correct: string[] = [];
  const wrong: Array<{ id: string; got: string; want: string }> = [];
  const missing: string[] = [];
  for (const [id, want] of Object.entries(expected)) {
    const got = byId.get(id)?.diagnosis?.disposition?.verdict;
    if (got === undefined) missing.push(id);
    else if (got === want) correct.push(id);
    else wrong.push({ id, got, want });
  }
  return { correct, wrong, missing };
}
