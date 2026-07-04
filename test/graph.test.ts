import { describe, expect, it } from 'vitest';
import { canonicalizeState, isDynamicSegment } from '../src/graph/state.js';
import { buildGraph } from '../src/graph/graph.js';

const TARGET = 'https://shop.example.com';

describe('isDynamicSegment', () => {
  it('flags ids, uuids, hashes, and opaque tokens', () => {
    expect(isDynamicSegment('42')).toBe(true);
    expect(isDynamicSegment('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isDynamicSegment('a1b2c3d4e5f6')).toBe(true);
    expect(isDynamicSegment('aGVsbG8x_dG9rZW4')).toBe(true);
  });

  it('keeps real route names', () => {
    expect(isDynamicSegment('pricing')).toBe(false);
    expect(isDynamicSegment('about')).toBe(false);
    expect(isDynamicSegment('checkout')).toBe(false);
  });
});

describe('canonicalizeState', () => {
  it('collapses dynamic path segments to the same node', () => {
    const a = canonicalizeState('https://shop.example.com/product/1');
    const b = canonicalizeState('https://shop.example.com/product/9987');
    expect(a.id).toBe('/product/:id');
    expect(a.id).toBe(b.id);
    expect(a.label).toBe('product');
  });

  it('ignores volatile query strings for node identity', () => {
    const a = canonicalizeState('https://shop.example.com/search?q=shoes');
    const b = canonicalizeState('https://shop.example.com/search?q=hats&page=2');
    expect(a.id).toBe('/search');
    expect(a.id).toBe(b.id);
  });

  it('maps the root to a single home node', () => {
    expect(canonicalizeState('https://shop.example.com/').id).toBe('/');
    expect(canonicalizeState('https://shop.example.com/').label).toBe('home');
  });

  it('resolves relative URLs against the target', () => {
    expect(canonicalizeState('/cart', TARGET).id).toBe('/cart');
  });

  it('treats hash routes (SPA) as part of the state but ignores plain anchors', () => {
    expect(canonicalizeState('https://app.example.com/#/settings').id).toBe('/#/settings');
    expect(canonicalizeState('https://app.example.com/pricing#features').id).toBe('/pricing');
  });
});

describe('buildGraph', () => {
  it('clusters transitions into deduped nodes and counted edges', () => {
    const graph = buildGraph(
      [
        { fromUrl: '/', action: 'click Product 1', toUrl: '/product/1' },
        { fromUrl: '/', action: 'click Product 1', toUrl: '/product/2' },
        { fromUrl: '/product/1', action: 'click Add to cart', toUrl: '/cart' },
      ],
      TARGET,
    );

    // '/product/1' and '/product/2' collapse into one node.
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(['/', '/cart', '/product/:id']);

    // The two identical home -> product transitions dedupe into one edge, count 2.
    const homeToProduct = graph.edges.find((e) => e.from === '/' && e.to === '/product/:id');
    expect(homeToProduct?.count).toBe(2);
    expect(graph.edges).toHaveLength(2);
  });

  it('keeps a bounded sample of raw urls per node', () => {
    const transitions = Array.from({ length: 10 }, (_, i) => ({
      fromUrl: '/',
      action: 'open',
      toUrl: `/product/${i}`,
    }));
    const graph = buildGraph(transitions, TARGET);
    const product = graph.nodes.find((n) => n.id === '/product/:id');
    expect(product?.sampleUrls.length).toBeLessThanOrEqual(5);
  });
});
