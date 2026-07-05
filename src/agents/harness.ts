import { Agent, Cursor } from '@cursor/sdk';

/**
 * The one place autoend spawns Cursor SDK agents (ADR-0003). Every fleet role
 * — smoke/persona explorers, Recon, Verifier, Triage — is a single prompt sent
 * to a fresh agent (local machine or Cursor-hosted cloud VM), raced against a
 * wall-clock kill. Centralized so the harness stays a swappable module
 * (ADR-0003 consequences).
 */

export type AgentRuntime = 'local' | 'cloud';

export interface AgentJob {
  /** Agent name, surfaced in Cursor's UI/logs. */
  name: string;
  prompt: string;
  /** Working directory the agent's tools operate in (local runtime). */
  cwd: string;
  /** Model id (ADR-0009: strong pinned model, resolved once per Run). */
  model: string;
  apiKey: string;
  /** Hard wall-clock kill for the whole job. */
  timeoutMs: number;
  /** Where the agent executes; default 'local'. Cloud = Cursor-hosted Linux VM. */
  runtime?: AgentRuntime;
  /**
   * Optional repo a cloud agent clones into its VM. Autoend explorers only need
   * the VM's shell + browser, so cloud runs are repo-less by default. Supply
   * this ONLY to clone a repo the Cursor account has connected via its GitHub
   * App — an unconnected/arbitrary URL fails with "Failed to determine
   * repository default branch". Ignored for local runtime.
   */
  cloudRepo?: string;
}

/**
 * Run one agent job to completion. Returns the agent's final message text, or
 * undefined when the job timed out or errored — callers degrade, never throw,
 * because a lost agent must not sink the Run (issue #1). The catch-all is what
 * makes that contract true: fleets await whole Waves with Promise.all, so a
 * single rejected SDK call would otherwise erase every sibling's finished work.
 */
export async function runAgentJob(job: AgentJob): Promise<string | undefined> {
  try {
    // Always set local or cloud explicitly — the SDK silently defaults to
    // local when neither is present, which would mask a misconfigured runtime.
    // Cloud is repo-less unless a connected repo is explicitly configured:
    // explorers just need the VM's shell + browser, and passing an unconnected
    // repo URL fails the whole job at send() (default-branch lookup).
    const placement =
      job.runtime === 'cloud'
        ? { cloud: job.cloudRepo ? { repos: [{ url: job.cloudRepo }] } : {} }
        : { local: { cwd: job.cwd } };
    const agent = await Agent.create({
      name: job.name,
      model: { id: job.model },
      apiKey: job.apiKey,
      ...placement,
    });
    try {
      const run = await agent.send(job.prompt);
      const outcome = (await Promise.race([
        run.wait(),
        sleep(job.timeoutMs).then(() => 'timeout' as const),
      ])) as 'timeout' | { status: string; result?: string; error?: { message?: string } };

      if (outcome === 'timeout') {
        await run.cancel().catch(() => {});
        console.warn(`${job.name} hit its time budget before reporting`);
        return undefined;
      }
      if (outcome.status !== 'finished' || typeof outcome.result !== 'string') {
        console.warn(
          `${job.name} ended with status "${outcome.status}"${outcome.error?.message ? `: ${outcome.error.message}` : ''}`,
        );
        return undefined;
      }
      return outcome.result;
    } finally {
      agent.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`${job.name} errored and was lost: ${message}`);
    return undefined;
  }
}

/**
 * Strong-first model ranking (ADR-0009: strong model everywhere — failures
 * must attribute to architecture or prompts, never to cheap routing). Matched
 * against `Cursor.models.list()` ids and aliases; first hit wins.
 */
const STRONG_MODEL_PREFERENCE: RegExp[] = [/opus/i, /gpt-?5/i, /sonnet/i, /gemini.*pro/i, /grok/i];

/** Rank a model id/aliases against the strong-first preference; lower = stronger. */
function modelRank(id: string, aliases: string[] = []): number {
  for (let i = 0; i < STRONG_MODEL_PREFERENCE.length; i++) {
    const p = STRONG_MODEL_PREFERENCE[i]!;
    if (p.test(id) || aliases.some((a) => p.test(a))) return i;
  }
  return STRONG_MODEL_PREFERENCE.length;
}

export interface AvailableModel {
  id: string;
  label: string;
  /** True for the model resolveModel would pick by default (strongest available). */
  isDefault: boolean;
}

/**
 * List the Cursor models available to this account, strong-first, flagging the
 * one autoend would pick by default. Powers the UI model picker (the daemon
 * publishes this to Supabase so Lumen can offer a real, live choice). Returns []
 * when the SDK can't be reached — callers degrade to auto-resolution.
 */
export async function listAvailableModels(apiKey: string): Promise<AvailableModel[]> {
  let models: Array<{ id: string; aliases?: string[] }> = [];
  try {
    models = await Cursor.models.list({ apiKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`could not list Cursor models (${message})`);
    return [];
  }
  const ranked = [...models].sort(
    (a, b) => modelRank(a.id, a.aliases) - modelRank(b.id, b.aliases),
  );
  const defaultId = ranked.find((m) => modelRank(m.id, m.aliases) < STRONG_MODEL_PREFERENCE.length)?.id
    ?? ranked[0]?.id;
  return ranked.map((m) => ({ id: m.id, label: m.id, isDefault: m.id === defaultId }));
}

/**
 * Resolve the model every role runs this Run. Order: explicit override
 * (AUTOEND_MODEL / config "model") → strongest available per the preference
 * ranking → 'auto' with a warning (the one case ADR-0009 tolerates routing).
 */
export async function resolveModel(apiKey: string, override?: string): Promise<string> {
  if (override) return override;
  try {
    const models = await Cursor.models.list({ apiKey });
    for (const preference of STRONG_MODEL_PREFERENCE) {
      const hit = models.find(
        (m) => preference.test(m.id) || (m.aliases ?? []).some((a) => preference.test(a)),
      );
      if (hit) return hit.id;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`could not list Cursor models (${message}); falling back to 'auto'`);
  }
  console.warn("no strong model matched the preference ranking; falling back to 'auto' (ADR-0009)");
  return 'auto';
}

/**
 * Pull the first top-level JSON object out of an agent's final message,
 * tolerating prose and markdown fences around it. Undefined when no object
 * parses — callers treat that as an unusable report, never a crash.
 */
export function extractJsonObject(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
