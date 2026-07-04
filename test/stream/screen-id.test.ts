import { describe, expect, it } from 'vitest';
import { edgeId, screenId, screenTitle } from '../src/stream/screen-id.js';

describe('screenId', () => {
  it('normalizes root', () => {
    expect(screenId('https://shop.example/')).toBe('/');
  });

  it('lowercases static segments', () => {
    expect(screenId('https://shop.example/Products')).toBe('/products');
  });

  it('collapses numeric ids', () => {
    expect(screenId('https://shop.example/products/42')).toBe('/products/:id');
  });

  it('builds stable edge ids', () => {
    expect(edgeId('/cart', '/checkout')).toBe('/cart→/checkout');
  });

  it('titles paths', () => {
    expect(screenTitle('/checkout')).toBe('Checkout');
  });
});
