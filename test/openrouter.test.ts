import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatCompletion, listOpenRouterModels } from '../src/agents/openrouter.js';

describe('chatCompletion', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns assistant content on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
        status: 200,
      }),
    );
    const text = await chatCompletion({
      apiKey: 'sk-test',
      model: 'anthropic/claude-3.5-sonnet',
      prompt: 'Say hi',
      timeoutMs: 5_000,
    });
    expect(text).toBe('{"ok":true}');
    expect(fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns undefined on HTTP error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('bad request', { status: 400 }));
    const text = await chatCompletion({
      apiKey: 'sk-test',
      model: 'openai/gpt-4o',
      prompt: 'x',
      timeoutMs: 5_000,
    });
    expect(text).toBeUndefined();
  });

  it('returns undefined when choices are empty', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    );
    const text = await chatCompletion({
      apiKey: 'sk-test',
      model: 'openai/gpt-4o',
      prompt: 'x',
      timeoutMs: 5_000,
    });
    expect(text).toBeUndefined();
  });

  it('returns undefined when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'));
    const text = await chatCompletion({
      apiKey: 'sk-test',
      model: 'openai/gpt-4o',
      prompt: 'x',
      timeoutMs: 5_000,
    });
    expect(text).toBeUndefined();
  });
});

describe('listOpenRouterModels', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns ranked models with a default flag', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
            { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
          ],
        }),
        { status: 200 },
      ),
    );
    const models = await listOpenRouterModels('sk-test');
    expect(models).toHaveLength(2);
    expect(models[0]!.id).toBe('anthropic/claude-3.5-sonnet');
    expect(models.find((m) => m.isDefault)?.id).toBe('anthropic/claude-3.5-sonnet');
  });

  it('returns empty array on HTTP error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    const models = await listOpenRouterModels('sk-test');
    expect(models).toEqual([]);
  });
});
