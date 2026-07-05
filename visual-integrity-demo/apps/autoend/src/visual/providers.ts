import { readFile } from 'node:fs/promises';
import type { VisualClassifierResult, VisualOverlay } from '../report/types.js';
import type {
  RegionDetectionInput,
  VisualModelEffort,
  VisualModelProvider,
  ViolationReviewInput,
} from './types.js';

/**
 * Provider interface + implementations (Visual Integrity plan: Provider
 * Interface, Model Stack > Tier 1/Tier 2). Nothing outside this file knows
 * whether a provider is NVIDIA/NIM, a future track service, or `none` — the
 * orchestrator only calls the three optional methods on VisualModelProvider.
 */

const DEFAULT_NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_REASONING_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';

/** Bump when the Nemotron review prompt or attachment semantics change — included in model cache keys. */
export const PROMPT_VERSION = 2;

export function providerCacheSalt(): string {
  return `prompt-v${PROMPT_VERSION}`;
}

/** No provider — the default. The deterministic rule/diff pipeline works fully without this. */
export const noProvider: VisualModelProvider = { id: 'none' };

async function toDataUri(path: string): Promise<string> {
  const bytes = await readFile(path);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

async function postJson(url: string, apiKey: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`NVIDIA NIM request failed (${res.status} ${res.statusText}): ${text.slice(0, 300)}`);
    }
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/** Collect balanced `{...}` substrings, respecting string literals and escapes. */
function findBalancedJsonObjects(text: string): string[] {
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
      continue;
    }
    if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return candidates;
}

export function extractJsonObject(text: string): Record<string, unknown> {
  // Reasoning models often wrap JSON in markdown fences or put it after a thinking block.
  const stripped = text
    .replace(/<think[\s\S]*?<\/think>/gi, '')
    .replace(/<redacted_thinking[\s\S]*?<\/redacted_thinking>/gi, '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();
  const matches = findBalancedJsonObjects(stripped);
  for (let i = matches.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(matches[i]) as Record<string, unknown>;
    } catch {
      // try an earlier candidate
    }
  }
  throw new Error('model response did not contain a JSON object');
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 50;
  const scaled = value > 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function buildReviewPrompt(input: ViolationReviewInput): string {
  const rules = input.violations
    .map((v) => `- ${v.ruleId} (${v.standard}): expected "${v.expected}" — actual "${v.actual}"`)
    .join('\n');
  return [
    'You are a design-QA reviewer for a government website.',
    '',
    'IMAGE 1 is the ACTUAL captured top region of the live page — judge only this image.',
    'IMAGE 2 (if present) is the EXPECTED reference render produced from the design spec. It shows what SHOULD appear.',
    'It is NOT the live page. Do not treat its contents as evidence about the page.',
    '',
    'The deterministic rule engine has already confirmed these violations via DOM/text inspection;',
    'your job is to corroborate, refine severity, and propose bounding boxes — not to re-decide from scratch.',
    'If you believe the deterministic verdict is wrong, say so with classification `needs-human`, never `likely-intentional`.',
    '',
    `Flagged rule violations:\n${rules}`,
    '',
    `Visible page text (truncated): ${input.domText.slice(0, 1500)}`,
    '',
    'Respond with STRICT JSON only, no prose, matching exactly:',
    '{"classification":"rule-violation"|"likely-intentional"|"likely-regression"|"needs-human",',
    '"confidence":0-100,"summary":"one sentence","ruleIds":["..."],"rationale":"short reasoning",',
    '"recommendedFix":"short suggestion"}',
  ].join('\n');
}

/** Tolerant box extraction: NIM detection schemas vary by deployed model, so this tries common shapes. */
function coerceDetectedBoxes(payload: unknown): Array<{ x: number; y: number; width: number; height: number; label?: string; confidence?: number }> {
  const root = payload as Record<string, unknown>;
  const candidates =
    (root?.data as unknown[]) ??
    (root?.boxes as unknown[]) ??
    (root?.detections as unknown[]) ??
    (Array.isArray(root) ? (root as unknown[]) : undefined) ??
    [];
  const boxes: Array<{ x: number; y: number; width: number; height: number; label?: string; confidence?: number }> = [];
  for (const raw of candidates) {
    const item = raw as Record<string, unknown>;
    const boxSource = (item.box ?? item.bbox ?? item) as Record<string, unknown>;
    const x = Number(boxSource.x ?? boxSource.x0 ?? boxSource.xmin);
    const y = Number(boxSource.y ?? boxSource.y0 ?? boxSource.ymin);
    const width = Number(boxSource.width ?? (Number(boxSource.x1 ?? boxSource.xmax) - x));
    const height = Number(boxSource.height ?? (Number(boxSource.y1 ?? boxSource.ymax) - y));
    if ([x, y, width, height].every((n) => Number.isFinite(n) && n >= 0)) {
      boxes.push({
        x,
        y,
        width,
        height,
        label: typeof item.label === 'string' ? item.label : typeof item.class_name === 'string' ? item.class_name : undefined,
        confidence: typeof item.confidence === 'number' ? item.confidence : typeof item.score === 'number' ? item.score : undefined,
      });
    }
  }
  return boxes;
}

export interface NvidiaProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  reasoningModel?: string;
  objectDetectionUrl?: string;
  timeoutMs?: number;
}

/**
 * NVIDIA / NIM provider (Visual Integrity plan: NVIDIA / track provider
 * integration). `reviewViolation` uses the OpenAI-compatible chat.completions
 * endpoint against Nemotron 3 Nano Omni for Tier 2 multimodal judgment.
 * `detectRegions` targets a generic NIM object-detection `/v1/infer` style
 * endpoint (Tier 1); its response schema varies by deployed model, so
 * parsing is deliberately tolerant and degrades to an empty overlay list
 * rather than throwing (Failure Behavior: never break the Run).
 */
export function createNvidiaProvider(opts: NvidiaProviderOptions = {}): VisualModelProvider {
  const baseUrl = opts.baseUrl ?? process.env.NVIDIA_NIM_BASE_URL ?? DEFAULT_NIM_BASE_URL;
  const apiKey = opts.apiKey ?? process.env.NVIDIA_NIM_API_KEY;
  const reasoningModel = opts.reasoningModel ?? process.env.NVIDIA_NEMOTRON_MODEL ?? DEFAULT_REASONING_MODEL;
  const objectDetectionUrl = opts.objectDetectionUrl ?? process.env.NVIDIA_OBJECT_DETECTION_URL;
  const defaultTimeout = Number(process.env.NVIDIA_NIM_TIMEOUT_MS) || 45_000;
  const timeoutMs = opts.timeoutMs ?? defaultTimeout;

  function requireApiKey(): string {
    if (!apiKey) {
      throw new Error(
        'NVIDIA_NIM_API_KEY is not configured — set VISUAL_MODEL_PROVIDER=none or provide the key.',
      );
    }
    return apiKey;
  }

  return {
    id: 'nvidia',

    async reviewViolation(input: ViolationReviewInput): Promise<VisualClassifierResult> {
      const key = requireApiKey();
      const content: Array<Record<string, unknown>> = [{ type: 'text', text: buildReviewPrompt(input) }];
      content.push({ type: 'image_url', image_url: { url: await toDataUri(input.actualImageFile) } });
      if (input.expectedImageFile) {
        content.push({ type: 'image_url', image_url: { url: await toDataUri(input.expectedImageFile) } });
      }

      const response = (await postJson(
        `${baseUrl}/chat/completions`,
        key,
        { model: reasoningModel, messages: [{ role: 'user', content }], temperature: 0.1, max_tokens: 800 },
        timeoutMs,
      )) as { choices?: Array<{ message?: { content?: string } }> };

      const text = response.choices?.[0]?.message?.content ?? '';
      const parsed = extractJsonObject(text) as Partial<VisualClassifierResult>;
      const classification =
        parsed.classification === 'rule-violation' ||
        parsed.classification === 'likely-intentional' ||
        parsed.classification === 'likely-regression' ||
        parsed.classification === 'needs-human'
          ? parsed.classification
          : 'needs-human';
      return {
        classification,
        confidence: normalizeConfidence(parsed.confidence),
        summary: parsed.summary ?? text.slice(0, 400),
        ruleIds: Array.isArray(parsed.ruleIds) ? parsed.ruleIds : undefined,
        rationale: parsed.rationale,
        recommendedFix: parsed.recommendedFix,
        provider: `nvidia:${reasoningModel}`,
      };
    },

    async detectRegions(input: RegionDetectionInput): Promise<VisualOverlay[]> {
      if (!objectDetectionUrl) return []; // Tier 1 is optional; no endpoint configured means "skip", not "fail".
      const key = requireApiKey();
      try {
        const payload = await postJson(
          objectDetectionUrl,
          key,
          { input: [{ type: 'image_url', url: await toDataUri(input.imageFile) }] },
          timeoutMs,
        );
        return coerceDetectedBoxes(payload).map((box, i) => ({
          id: `model-region-${i + 1}`,
          source: 'model' as const,
          label: box.label ?? input.label ?? 'model-detected region',
          box: { x: box.x, y: box.y, width: box.width, height: box.height },
          confidence: box.confidence,
        }));
      } catch (error) {
        if (process.env.VISUAL_DEBUG) {
          console.warn(`[visual] NVIDIA object detection call failed: ${error instanceof Error ? error.message : error}`);
        }
        return [];
      }
    },
  };
}

export function resolveProvider(providerId: string, effort: VisualModelEffort): VisualModelProvider | undefined {
  if (providerId === 'none' || effort === 'off') return undefined;
  if (providerId === 'nvidia') return createNvidiaProvider();
  return undefined;
}
