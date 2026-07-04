import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { extractJsonObject, runAgentJob } from '../agents/harness.js';
import { closeSession } from '../explore/hands.js';
import { browserProtocol, hardRules, type CandidateDefect } from '../explore/explorer.js';
import type { Finding } from '../report/types.js';

/**
 * The Verifier (ADR-0008): reproduce-to-file. An independent agent re-executes
 * each candidate's repro in a fresh browser session; only reproduced
 * violations become Defects, with the Verifier's video as Evidence.
 * Not reproduced → discarded. Verifier itself failed → the candidate survives
 * as an Advisory marked unverified, so a flaky Verifier can't bury a real bug
 * silently.
 */

/** Per-candidate wall clock; repro steps are scripted, not exploratory. */
const VERIFY_TIMEOUT_MS = 240_000;
/** Bound the stage's cost; drops are logged, never silent (ADR-0009). */
const CANDIDATE_CAP = 8;

export interface VerifierOptions {
  target: URL;
  runDir: string;
  evidenceDir: string;
  model: string;
  apiKey: string;
}

interface Verdict {
  reproduced: boolean;
  observed: string;
  confidence: number;
}

export async function verifyCandidates(
  candidates: CandidateDefect[],
  opts: VerifierOptions,
): Promise<Finding[]> {
  if (candidates.length === 0) return [];
  const capped = candidates.slice(0, CANDIDATE_CAP);
  if (capped.length < candidates.length) {
    console.warn(
      `verifier capped at ${CANDIDATE_CAP} candidates; ${candidates.length - capped.length} dropped: ${candidates
        .slice(CANDIDATE_CAP)
        .map((c) => `"${c.title}"`)
        .join(', ')}`,
    );
  }

  const findings = await Promise.all(capped.map((candidate, i) => verifyOne(candidate, i, opts)));
  return findings.filter((f): f is Finding => f !== undefined);
}

async function verifyOne(
  candidate: CandidateDefect,
  index: number,
  opts: VerifierOptions,
): Promise<Finding | undefined> {
  const session = `autoend-verify-${index}`;
  const evidence = `defect-${index}.webm`;
  let text: string | undefined;
  try {
    text = await runAgentJob({
      name: `autoend-verifier-${index}`,
      prompt: verifierPrompt(candidate, session, join(opts.evidenceDir, evidence), opts.target),
      cwd: opts.runDir,
      model: opts.model,
      apiKey: opts.apiKey,
      timeoutMs: VERIFY_TIMEOUT_MS,
    });
  } finally {
    await closeSession(session);
  }

  const verdict = parseVerdict(text);
  if (!verdict) {
    // The Verifier failed, not the candidate: keep it visible, one tier down.
    console.warn(`verifier for "${candidate.title}" did not return a verdict; filing as unverified advisory`);
    return {
      id: `candidate-${index}`,
      kind: 'advisory',
      title: `Unverified: ${candidate.title}`,
      detail: unverifiedDetail(candidate),
    };
  }
  if (!verdict.reproduced) {
    console.warn(`candidate "${candidate.title}" did not reproduce and was discarded (ADR-0008)`);
    return undefined;
  }

  const recorded = await access(join(opts.evidenceDir, evidence)).then(
    () => true,
    () => false,
  );
  // Drops are logged, never silent: a Defect without its video is still a
  // reproduced Defect, but the user should know the Evidence went missing.
  if (!recorded) console.warn(`defect "${candidate.title}" reproduced but its video Evidence was not recorded`);
  return {
    id: `defect-${index}`,
    kind: 'defect',
    title: candidate.title,
    detail: [
      `Expected: ${candidate.expectation}`,
      `Observed: ${verdict.observed}`,
      '',
      'Repro:',
      ...candidate.repro.map((step, n) => `${n + 1}. ${step.replace(/^\d+[.)]\s*/, '')}`),
    ].join('\n'),
    evidence: recorded ? evidence : undefined,
    expectation: { statement: candidate.expectation, source: candidate.source },
  };
}

function unverifiedDetail(candidate: CandidateDefect): string {
  return [
    `An explorer suspected this semantic bug but the Verifier could not complete a verdict.`,
    `Expected: ${candidate.expectation} (source: ${candidate.source})`,
    '',
    'Repro to try by hand:',
    ...candidate.repro.map((step, n) => `${n + 1}. ${step.replace(/^\d+[.)]\s*/, '')}`),
  ].join('\n');
}

function verifierPrompt(
  candidate: CandidateDefect,
  session: string,
  videoPath: string,
  target: URL,
): string {
  return `You are autoend's Verifier. An explorer suspects a semantic bug. Your ONLY job: re-execute the repro steps below in a fresh browser session, exactly as written, and judge whether the violation actually reproduces. You are a skeptic — when the observed behavior is ambiguous or matches the expectation, the candidate does NOT reproduce.

TARGET: ${target.href}
${candidate.url ? `Observation point: ${candidate.url}` : ''}

CLAIM: ${candidate.title}
EXPECTED BEHAVIOR (source: ${candidate.source}): ${candidate.expectation}

REPRO STEPS:
${candidate.repro.map((step, n) => `${n + 1}. ${step.replace(/^\d+[.)]\s*/, '')}`).join('\n')}

${browserProtocol(session, target, videoPath)}

${hardRules(target.origin)}
- Follow the repro steps verbatim; do not improvise beyond what a step requires.
- Record the video from your FIRST action — it becomes the user-facing Evidence.

## Final message — STRICT
Reply with ONLY one JSON object, no prose, no markdown fences:
{
  "reproduced": true or false,
  "observed": "exactly what you saw at the decisive step (values, order, text)",
  "confidence": 0-100
}`;
}

/** Parse the Verifier's verdict. Exported for tests. */
export function parseVerdict(text: string | undefined): Verdict | undefined {
  if (!text) return undefined;
  const raw = extractJsonObject(text);
  if (!raw || typeof raw.reproduced !== 'boolean') return undefined;
  return {
    reproduced: raw.reproduced,
    observed: typeof raw.observed === 'string' ? raw.observed : '',
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0,
  };
}
