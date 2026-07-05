import { describe, expect, it } from 'vitest';
import { extractJsonObject } from '../src/visual/providers.js';

describe('extractJsonObject', () => {
  it('parses plain JSON', () => {
    expect(extractJsonObject('{"classification":"rule-violation","confidence":90}')).toEqual({
      classification: 'rule-violation',
      confidence: 90,
    });
  });

  it('parses JSON inside a ```json fence', () => {
    const text = 'Here is the result:\n```json\n{"classification":"needs-human","confidence":50}\n```';
    expect(extractJsonObject(text)).toEqual({ classification: 'needs-human', confidence: 50 });
  });

  it('parses JSON after a redacted thinking block with braces', () => {
    const text =
      '<think>reasoning with {braces} inside</think>\n{"classification":"likely-regression","confidence":80}';
    expect(extractJsonObject(text)).toEqual({ classification: 'likely-regression', confidence: 80 });
  });

  it('takes the last parseable object when two are present', () => {
    const text = '{"bad": unclosed}\n{"classification":"rule-violation","confidence":70}';
    expect(extractJsonObject(text)).toEqual({ classification: 'rule-violation', confidence: 70 });
  });

  it('parses JSON after prose containing a stray brace', () => {
    const text = 'Note: the {banner} region looks wrong.\n{"classification":"rule-violation","confidence":60}';
    expect(extractJsonObject(text)).toEqual({ classification: 'rule-violation', confidence: 60 });
  });

  it('throws when no JSON object is present', () => {
    expect(() => extractJsonObject('no structured output here')).toThrow(/did not contain a JSON object/);
  });
});
