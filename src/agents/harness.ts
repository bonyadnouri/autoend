import { Agent, Cursor } from '@cursor/sdk';

/**
 * The one place autoend spawns Cursor SDK agents (ADR-0003). Every fleet role
 * — smoke/persona explorers, Recon, Verifier, Triage — is a single prompt sent
 * to a fresh local agent, raced against a wall-clock kill. Centralized so the
 * harness stays a swappable module (ADR-0003 consequences).
 */

export interface AgentJob {
  /** Agent name, surfaced in Cursor's UI/logs. */
  name: string;
  prompt: string;
  /** Working directory the agent's tools operate in. */
  cwd: string;
  /** Model id (ADR-0009: strong pinned model, resolved once per Run). */
  model: string;
  apiKey: string;
  /** Hard wall-clock kill for the whole job. */
  timeoutMs: number;
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
    const agent = await Agent.create({
      name: job.name,
      model: { id: job.model },
      apiKey: job.apiKey,
      local: { cwd: job.cwd },
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
