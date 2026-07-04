import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extractJsonObject, runAgentJob } from '../agents/harness.js';
import { ARCHETYPES, ARCHETYPE_PROFILES } from '../explore/personas.js';
import { isSensitiveEnvName } from '../run/sensitive-env.js';
import { isBriefStale, loadBrief, saveBrief, validateBrief, type ProductBrief } from './brief.js';

const exec = promisify(execFile);

/**
 * Recon (ADR-0007): reads the Target's checkout and product docs — never the
 * live app — and produces the Product Brief that seeds every Persona. Recon
 * is the only fleet role with repo access and it never holds a browser: the
 * capability boundary that keeps untrusted web content and source apart.
 */

const RECON_TIMEOUT_MS = 300_000;

export interface ReconOptions {
  repoRoot: string;
  target: URL;
  model: string;
  apiKey: string;
}

/**
 * Return a fresh-enough Product Brief: the cached one when staleness rules
 * pass, otherwise regenerate via the Recon agent. Undefined when recon fails
 * — the fleet then runs on fallback Missions (personas.ts), a worse Run, not
 * a dead one.
 */
export async function ensureBrief(opts: ReconOptions): Promise<ProductBrief | undefined> {
  const currentHead = await gitHead(opts.repoRoot);
  const cached = await loadBrief(opts.repoRoot);
  if (cached) {
    const headDistance = await gitDistance(opts.repoRoot, cached.gitHead, currentHead);
    if (!isBriefStale(cached, { now: new Date(), currentHead, headDistance })) return cached;
    console.warn('product brief is stale — recon will regenerate it');
  }

  const text = await runAgentJob({
    name: 'autoend-recon',
    prompt: reconPrompt(opts.target),
    cwd: opts.repoRoot,
    model: opts.model,
    apiKey: opts.apiKey,
    timeoutMs: RECON_TIMEOUT_MS,
  });
  if (!text) return cached;

  const parsed = extractJsonObject(text);
  const brief = validateBrief({ ...parsed, generatedAt: new Date().toISOString(), gitHead: currentHead });
  if (!brief) {
    console.warn('recon returned an unusable brief; continuing without one');
    return cached;
  }
  if (containsSecretValue(JSON.stringify(brief))) {
    console.warn('recon brief contained a secret-looking value and was discarded (ADR-0007 capability boundary)');
    return cached;
  }
  await saveBrief(opts.repoRoot, brief);
  return brief;
}

function reconPrompt(target: URL): string {
  const archetypes = ARCHETYPES.map((a) => `- "${a}": ${ARCHETYPE_PROFILES[a]}`).join('\n');
  return `You are autoend's Recon agent. Your job: read THIS repository (the codebase of the web app deployed at ${target.href}) and produce a Product Brief that will seed a fleet of browser-testing Personas. You do NOT have a browser and must not try to fetch the app.

Study the repo: README and docs first, then routing/pages/navigation code, changelogs, and package manifests. Work out what the product is, who uses it, and which UI surfaces exist.

## Hard rules
- READ ONLY. Never modify, create, or delete any file.
- Never read .env files, secret stores, key material, or CI credentials. Never include a credential, token, or key in your output.
- Do not run the app, install dependencies, or make network requests.

## What to produce
For each archetype below, write 1-2 MISSIONS grounded in THIS product — a concrete goal on a specific surface plus bug hypotheses a tester with deep product understanding would probe. Missions must not overlap: divide the app's surfaces between them.

Archetypes:
${archetypes}

## Final message — STRICT
Reply with ONLY one JSON object, no prose, no markdown fences:
{
  "product": "one paragraph: what this product is and does",
  "users": "who uses it and for what",
  "surfaces": ["major UI surface", "..."],
  "missions": [
    {
      "archetype": "one of: ${ARCHETYPES.join(' | ')}",
      "goal": "what this persona is trying to accomplish, in the product's own terms",
      "surface": "the specific surface this mission owns",
      "hypotheses": ["a concrete way this surface could be broken", "..."]
    }
  ]
}
An honest thin brief beats an invented rich one.`;
}

/**
 * Defense-in-depth twin of withoutSensitiveEnv: if any secret-looking env
 * value leaked into the brief text, refuse to persist it. Exported for tests.
 */
export function containsSecretValue(
  text: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  for (const [name, value] of Object.entries(env)) {
    if (!value || value.length < 8 || !isSensitiveEnvName(name)) continue;
    if (text.includes(value)) return true;
  }
  return false;
}

async function gitHead(repoRoot: string): Promise<string | undefined> {
  try {
    const { stdout } = await exec('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
    return stdout.trim();
  } catch {
    return undefined; // not a git repo — staleness falls back to age alone
  }
}

async function gitDistance(
  repoRoot: string,
  from: string | undefined,
  to: string | undefined,
): Promise<number | undefined> {
  if (!from || !to || from === to) return from === to ? 0 : undefined;
  try {
    // Symmetric difference (three dots): moving HEAD backwards or to a mostly
    // diverged branch must count as distance too, or a stale brief survives.
    const { stdout } = await exec('git', ['rev-list', '--count', `${from}...${to}`], { cwd: repoRoot });
    const count = Number(stdout.trim());
    return Number.isFinite(count) ? count : undefined;
  } catch {
    return undefined; // unreachable ref (e.g. rebase) — treat as moved
  }
}
