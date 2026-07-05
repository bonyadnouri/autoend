const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const APP_REFERER = 'https://github.com/bonyadnouri/autoend';

/** Keep in sync with harness.ts STRONG_MODEL_PREFERENCE (ADR-0009). */
const STRONG_MODEL_PREFERENCE: RegExp[] = [/opus/i, /gpt-?5/i, /sonnet/i, /gemini.*pro/i, /grok/i];

function modelRank(id: string): number {
  for (let i = 0; i < STRONG_MODEL_PREFERENCE.length; i++) {
    if (STRONG_MODEL_PREFERENCE[i]!.test(id)) return i;
  }
  return STRONG_MODEL_PREFERENCE.length;
}

function openRouterHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': APP_REFERER,
    'X-Title': 'autoend',
  };
}

export interface ChatCompletionOptions {
  apiKey: string;
  model: string;
  prompt: string;
  timeoutMs: number;
}

/**
 * Single-turn chat completion via OpenRouter. Returns assistant text or
 * undefined on timeout/error — same degrade contract as runAgentJob.
 */
export async function chatCompletion(opts: ChatCompletionOptions): Promise<string | undefined> {
  try {
    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: openRouterHeaders(opts.apiKey),
      body: JSON.stringify({
        model: opts.model,
        messages: [{ role: 'user', content: opts.prompt }],
      }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.warn(`OpenRouter chat failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ''}`);
      return undefined;
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      console.warn('OpenRouter chat returned no assistant content');
      return undefined;
    }
    return content;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`OpenRouter chat errored: ${message}`);
    return undefined;
  }
}

/**
 * List models available to this OpenRouter account, strong-first, flagging the
 * default autoend would pick. Returns [] when the API can't be reached.
 */
export async function listOpenRouterModels(apiKey: string): Promise<
  Array<{ id: string; label: string; isDefault: boolean }>
> {
  try {
    const response = await fetch(`${OPENROUTER_BASE}/models`, {
      headers: openRouterHeaders(apiKey),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.warn(`could not list OpenRouter models (${response.status})${body ? `: ${body.slice(0, 200)}` : ''}`);
      return [];
    }
    const payload = (await response.json()) as {
      data?: Array<{ id?: string; name?: string }>;
    };
    const raw = (payload.data ?? []).filter((m): m is { id: string; name?: string } => typeof m.id === 'string');
    if (raw.length === 0) return [];
    const ranked = [...raw].sort((a, b) => modelRank(a.id) - modelRank(b.id));
    const defaultId =
      ranked.find((m) => modelRank(m.id) < STRONG_MODEL_PREFERENCE.length)?.id ?? ranked[0]!.id;
    return ranked.map((m) => ({
      id: m.id,
      label: m.name ?? m.id,
      isDefault: m.id === defaultId,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`could not list OpenRouter models (${message})`);
    return [];
  }
}
