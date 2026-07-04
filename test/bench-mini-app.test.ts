import { afterEach, describe, expect, it } from 'vitest';
import { PRODUCTS, startMiniApp } from '../bench/mini-app/app.mjs';

// Fast, no LLM, no Playwright: drive the Gearloop mini-app over fetch and assert
// each seeded bug's behavior with the flag on vs off. The server binds port 0,
// so every case gets its own instance.

interface App {
  url: string;
  close: () => Promise<void>;
}

const running: App[] = [];

async function launch(opts: Parameters<typeof startMiniApp>[0]): Promise<App> {
  const app = (await startMiniApp(opts)) as App;
  running.push(app);
  return app;
}

afterEach(async () => {
  while (running.length) await running.pop()!.close();
});

const PRODUCT_NAMES: string[] = (PRODUCTS as Array<{ name: string }>).map((p) => p.name);
const countProducts = (html: string): number => PRODUCT_NAMES.filter((n) => html.includes(n)).length;

const text = async (url: string | URL): Promise<string> => (await fetch(url)).text();

/** Manual cookie jar: POST an add, return the `cart=...` cookie to chain into the next request. */
async function postAdd(base: string, id: string, cookie: string): Promise<string> {
  const res = await fetch(new URL('/cart/add', base), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) },
    body: new URLSearchParams({ id }).toString(),
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const cart = setCookies.map((c) => c.split(';')[0]).find((c) => c.startsWith('cart='));
  return cart ?? cookie;
}

async function addTwice(base: string): Promise<string> {
  const first = await postAdd(base, 'aether', '');
  return postAdd(base, 'volt', first);
}

describe('Gearloop mini-app: sort-lexicographic', () => {
  it('sorts by price numerically when off, lexicographically when on', async () => {
    const clean = await launch({ variant: 'v1' });
    const buggy = await launch({ bugs: new Set(['sort-lexicographic']) });
    const okHtml = await text(new URL('/products?sort=price', clean.url));
    const bugHtml = await text(new URL('/products?sort=price', buggy.url));
    // Numeric: $89 Aether before $1,099 Orbit. Lexicographic: "1099.00" floats Orbit up.
    expect(okHtml.indexOf('Aether')).toBeLessThan(okHtml.indexOf('Orbit'));
    expect(bugHtml.indexOf('Orbit')).toBeLessThan(bugHtml.indexOf('Aether'));
  });
});

describe('Gearloop mini-app: search-ignored', () => {
  it('filters by name when off, returns the whole catalog when on', async () => {
    const clean = await launch({});
    const buggy = await launch({ bugs: new Set(['search-ignored']) });
    const okHtml = await text(new URL('/search?q=keyboard', clean.url));
    const bugHtml = await text(new URL('/search?q=keyboard', buggy.url));
    expect(okHtml).toContain('Results for "keyboard"');
    expect(countProducts(okHtml)).toBe(1);
    expect(bugHtml).toContain('Results for "keyboard"');
    expect(countProducts(bugHtml)).toBe(PRODUCT_NAMES.length);
  });
});

describe('Gearloop mini-app: deals-500', () => {
  it('returns 200 JSON when off and 500 when on', async () => {
    const clean = await launch({});
    const buggy = await launch({ bugs: new Set(['deals-500']) });
    const ok = await fetch(new URL('/api/deals', clean.url));
    expect(ok.status).toBe(200);
    expect(Array.isArray(await ok.json())).toBe(true);
    const bug = await fetch(new URL('/api/deals', buggy.url));
    expect(bug.status).toBe(500);
  });
});

describe('Gearloop mini-app: broken-docs-link', () => {
  it('footer Docs link resolves when off and 404s when on', async () => {
    const clean = await launch({});
    const buggy = await launch({ bugs: new Set(['broken-docs-link']) });
    const okHome = await text(clean.url);
    expect(okHome).toContain('href="/docs"');
    expect((await fetch(new URL('/docs', clean.url))).status).toBe(200);
    const bugHome = await text(buggy.url);
    expect(bugHome).toContain('href="/documentation"');
    expect((await fetch(new URL('/documentation', buggy.url))).status).toBe(404);
  });
});

describe('Gearloop mini-app: cart-badge-stale', () => {
  it('badge counts every item when off', async () => {
    const clean = await launch({});
    const jar = await addTwice(clean.url);
    const nav = await (await fetch(clean.url, { headers: { cookie: jar } })).text();
    expect(nav).toContain('Cart (2)');
    const cart = await (await fetch(new URL('/cart', clean.url), { headers: { cookie: jar } })).text();
    expect(cart).toContain('Aether Laptop Stand');
    expect(cart).toContain('Volt Power Bank');
  });

  it('badge sticks at 1 when on, though the cart page still lists both items', async () => {
    const buggy = await launch({ bugs: new Set(['cart-badge-stale']) });
    const jar = await addTwice(buggy.url);
    const nav = await (await fetch(buggy.url, { headers: { cookie: jar } })).text();
    expect(nav).toContain('Cart (1)');
    const cart = await (await fetch(new URL('/cart', buggy.url), { headers: { cookie: jar } })).text();
    expect(cart).toContain('2 item(s)');
    expect(cart).toContain('Aether Laptop Stand');
    expect(cart).toContain('Volt Power Bank');
  });
});

describe('Gearloop mini-app: v2 button rename', () => {
  it('renames Add to cart to Add to basket on v2', async () => {
    const v1 = await launch({ variant: 'v1' });
    const v2 = await launch({ variant: 'v2' });
    const h1 = await text(new URL('/products', v1.url));
    const h2 = await text(new URL('/products', v2.url));
    expect(h1).toContain('Add to cart');
    expect(h1).not.toContain('Add to basket');
    expect(h2).toContain('Add to basket');
    expect(h2).not.toContain('Add to cart');
  });
});
