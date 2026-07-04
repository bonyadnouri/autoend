// Gearloop — a fictional gadget store used as the seeded mini-app benchmark
// Target (ADR-0009). Zero dependencies: server-rendered HTML over node:http so
// the inner dev loop stays deterministic and boots in milliseconds. Bugs are
// opt-in via the `bugs` set; with none enabled every page behaves correctly.

import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

/** The catalog. Prices span $89.00–$1,299.00 and are stored in cents to dodge float drift. */
export const PRODUCTS = [
  { id: 'aether', name: 'Aether Laptop Stand', priceCents: 8900 },
  { id: 'halo', name: 'Halo Desk Lamp', priceCents: 9900 },
  { id: 'volt', name: 'Volt Power Bank', priceCents: 12900 },
  { id: 'nimbus', name: 'Nimbus Wireless Earbuds', priceCents: 19900 },
  { id: 'pulse', name: 'Pulse Smartwatch', priceCents: 24900 },
  { id: 'quantum', name: 'Quantum Mechanical Keyboard', priceCents: 89900 },
  { id: 'orbit', name: 'Orbit 4K Webcam', priceCents: 109900 },
  { id: 'titan', name: 'Titan Ultrawide Monitor', priceCents: 129900 },
];

const DEALS = [
  { title: 'Aether Laptop Stand', discount: '15%' },
  { title: 'Nimbus Wireless Earbuds', discount: '20%' },
  { title: 'Quantum Mechanical Keyboard', discount: '10%' },
];

/** Every seeded bug id, so callers can enable them all at once. */
export const KNOWN_BUGS = [
  'sort-lexicographic',
  'cart-badge-stale',
  'search-ignored',
  'deals-500',
  'broken-docs-link',
];

function formatPrice(cents) {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Price as a bare "1099.00" string — what the lexicographic sort bug wrongly compares. */
function priceStr(product) {
  return (product.priceCents / 100).toFixed(2);
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const val = part.slice(i + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

function html(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

function json(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

/**
 * Full-page shell. The header "Cart (N)" badge normally reflects the true item
 * count; the cart-badge-stale bug freezes it at 1 once anything is added. The
 * footer Docs link normally resolves to /docs; broken-docs-link points it at a
 * /documentation page that 404s.
 */
function layout({ title, body, cartCount, bugs, variant = 'v1' }) {
  void variant;
  const badge = bugs.has('cart-badge-stale') ? (cartCount > 0 ? 1 : 0) : cartCount;
  const docsHref = bugs.has('broken-docs-link') ? '/documentation' : '/docs';
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(title)} · Gearloop</title></head>
<body>
<header>
  <a href="/"><strong>Gearloop</strong></a>
  <nav>
    <a href="/products">Products</a>
    <a href="/deals">Deals</a>
    <a href="/cart">Cart (${badge})</a>
    <a href="/login">Login</a>
    <a href="/contact">Contact</a>
  </nav>
</header>
<main>
${body}
</main>
<footer>
  <a href="${docsHref}">Docs</a>
  <span>© Gearloop, a fictional gadget store.</span>
</footer>
</body>
</html>`;
}

function productRow(variant) {
  const addLabel = variant === 'v2' ? 'Add to basket' : 'Add to cart';
  return (p) => `    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${formatPrice(p.priceCents)}</td>
      <td>
        <form method="post" action="/cart/add">
          <input type="hidden" name="id" value="${p.id}">
          <button type="submit">${addLabel}</button>
        </form>
      </td>
    </tr>`;
}

function home(res, ctx) {
  const body = `
<section>
  <h1>Gearloop</h1>
  <p>Premium gadgets for people who love good hardware. Browse the catalog, grab a deal, and check out fast.</p>
  <p><a href="/products">Shop products</a> · <a href="/deals">Today's deals</a></p>
</section>`;
  return html(res, 200, layout({ title: 'Home', body, ...ctx }));
}

function products(res, url, ctx) {
  const sort = url.searchParams.get('sort');
  const list = [...PRODUCTS];
  if (sort === 'price') {
    if (ctx.bugs.has('sort-lexicographic')) {
      // Bug: compare the price strings instead of the numbers, so "1099.00" < "89.00".
      list.sort((a, b) => {
        const x = priceStr(a);
        const y = priceStr(b);
        return x < y ? -1 : x > y ? 1 : 0;
      });
    } else {
      list.sort((a, b) => a.priceCents - b.priceCents);
    }
  }
  const rows = list.map(productRow(ctx.variant)).join('\n');
  const body = `
<h1>Products</h1>
<p>Browse the Gearloop catalog. <a href="/products?sort=price">Sort by price</a>.</p>
<form method="get" action="/search">
  <input type="search" name="q" placeholder="Search products" aria-label="Search products">
  <button type="submit">Search</button>
</form>
<table>
  <thead><tr><th>Product</th><th>Price</th><th></th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>`;
  return html(res, 200, layout({ title: 'Products', body, ...ctx }));
}

function search(res, url, ctx) {
  const q = url.searchParams.get('q') ?? '';
  // Bug: ignore the query and return the whole catalog while the heading still echoes q.
  const results = ctx.bugs.has('search-ignored')
    ? [...PRODUCTS]
    : PRODUCTS.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  const rows = results.map(productRow(ctx.variant)).join('\n');
  const body = `
<h1>Search</h1>
<h2>Results for "${escapeHtml(q)}"</h2>
<p>${results.length} product(s) found.</p>
<table>
  <thead><tr><th>Product</th><th>Price</th><th></th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>`;
  return html(res, 200, layout({ title: 'Search', body, ...ctx }));
}

function cartAdd(res, form, cart, ctx) {
  const id = form.get('id') ?? '';
  const product = PRODUCTS.find((p) => p.id === id);
  const next = product ? [...cart, product.id] : cart;
  const name = product ? product.name : 'Item';
  const body = `<h1>Added to your cart</h1>
<p>${escapeHtml(name)} is now in your cart.</p>
<p><a href="/cart">Go to cart</a> · <a href="/products">Keep shopping</a></p>`;
  // 200 (not a redirect) so a manual cookie jar can read the Set-Cookie header.
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'set-cookie': `cart=${encodeURIComponent(next.join(','))}; Path=/`,
  });
  res.end(layout({ title: 'Added', body, ...ctx, cartCount: next.length }));
}

function cartView(res, cart, ctx) {
  const items = cart.map((id) => PRODUCTS.find((p) => p.id === id)).filter(Boolean);
  let body;
  if (items.length === 0) {
    body = `<h1>Your cart</h1><p>Your cart is empty.</p><p><a href="/products">Browse products</a></p>`;
  } else {
    const rows = items
      .map((p) => `    <tr><td>${escapeHtml(p.name)}</td><td>${formatPrice(p.priceCents)}</td></tr>`)
      .join('\n');
    const total = items.reduce((sum, p) => sum + p.priceCents, 0);
    body = `
<h1>Your cart</h1>
<p>${items.length} item(s) in your cart.</p>
<table>
  <thead><tr><th>Product</th><th>Price</th></tr></thead>
  <tbody>
${rows}
  </tbody>
  <tfoot><tr><td>Total</td><td>${formatPrice(total)}</td></tr></tfoot>
</table>`;
  }
  return html(res, 200, layout({ title: 'Cart', body, ...ctx }));
}

function apiDeals(res, bugs) {
  // Bug: the deals endpoint 5xxs; the page's inline JS then logs an error and shows a fallback.
  if (bugs.has('deals-500')) return json(res, 500, { error: 'internal server error' });
  return json(res, 200, DEALS);
}

function deals(res, ctx) {
  const body = `
<h1>Deals</h1>
<div id="deals">Loading deals…</div>
<script>
  fetch('/api/deals')
    .then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } return r.json(); })
    .then(function (list) {
      document.getElementById('deals').innerHTML = list
        .map(function (d) { return '<div class="deal">' + d.title + ' — ' + d.discount + ' off</div>'; })
        .join('');
    })
    .catch(function (err) {
      console.error('Failed to load deals', err);
      document.getElementById('deals').textContent = 'Failed to load deals';
    });
</script>`;
  return html(res, 200, layout({ title: 'Deals', body, ...ctx }));
}

function loginForm(res, ctx, failed) {
  const body = `
<h1>Login</h1>
${failed ? '<p role="alert">Invalid credentials. Try demo / demo123.</p>' : ''}
<form method="post" action="/login">
  <label>Username <input name="username"></label>
  <label>Password <input name="password" type="password"></label>
  <button type="submit">Sign in</button>
</form>
<p>Demo account: demo / demo123.</p>`;
  return html(res, failed ? 401 : 200, layout({ title: 'Login', body, ...ctx }));
}

function login(res, form, ctx) {
  const ok = form.get('username') === 'demo' && form.get('password') === 'demo123';
  if (!ok) return loginForm(res, ctx, true);
  res.writeHead(303, { 'set-cookie': 'session=demo; Path=/', location: '/account' });
  res.end();
}

function account(res, cookies, ctx) {
  if (cookies.session === 'demo') {
    return html(res, 200, layout({ title: 'Account', body: '<h1>Account</h1><p>Signed in as demo.</p>', ...ctx }));
  }
  res.writeHead(303, { location: '/login' });
  res.end();
}

function contactForm(res, ctx) {
  const body = `
<h1>Contact us</h1>
<form method="post" action="/contact">
  <label>Name <input name="name"></label>
  <label>Email <input name="email" type="email"></label>
  <label>Message <textarea name="message"></textarea></label>
  <button type="submit">Send message</button>
</form>`;
  return html(res, 200, layout({ title: 'Contact', body, ...ctx }));
}

function contactThanks(res, form, ctx) {
  const name = form.get('name') || 'there';
  const body = `<h1>Thank you</h1><p>Thanks, ${escapeHtml(name)} — we'll be in touch shortly.</p>`;
  return html(res, 200, layout({ title: 'Thank you', body, ...ctx }));
}

function docs(res, ctx) {
  const body = `
<h1>Gearloop docs</h1>
<p>Gearloop is a small demo gadget store. Key behaviors:</p>
<ul>
  <li>Products can be sorted by price from low to high, numerically.</li>
  <li>Search filters products by name.</li>
  <li>The cart badge in the header counts every item in your cart.</li>
  <li>Sign in with demo / demo123 to view your account.</li>
</ul>`;
  return html(res, 200, layout({ title: 'Docs', body, ...ctx }));
}

function notFound(res, path, ctx) {
  const body = `<h1>404 — Not found</h1><p>No page at ${escapeHtml(path)}.</p>`;
  return html(res, 404, layout({ title: 'Not found', body, ...ctx }));
}

async function handle(req, res, bugs, variant) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const cookies = parseCookies(req.headers.cookie);
  const cart = cookies.cart ? cookies.cart.split(',').filter(Boolean) : [];
  // ctx carries the true cart count; layout applies the badge bug on top of it.
  const ctx = { cartCount: cart.length, bugs, variant };

  if (req.method === 'POST') {
    const form = new URLSearchParams(await readBody(req));
    if (path === '/cart/add') return cartAdd(res, form, cart, ctx);
    if (path === '/login') return login(res, form, ctx);
    if (path === '/contact') return contactThanks(res, form, ctx);
    return notFound(res, path, ctx);
  }

  switch (path) {
    case '/':
      return home(res, ctx);
    case '/products':
      return products(res, url, ctx);
    case '/search':
      return search(res, url, ctx);
    case '/cart':
      return cartView(res, cart, ctx);
    case '/deals':
      return deals(res, ctx);
    case '/api/deals':
      return apiDeals(res, bugs);
    case '/login':
      return loginForm(res, ctx, false);
    case '/account':
      return account(res, cookies, ctx);
    case '/contact':
      return contactForm(res, ctx);
    case '/docs':
      return docs(res, ctx);
    default:
      return notFound(res, path, ctx);
  }
}

/**
 * Start the Gearloop mini-app. `bugs` may be a Set or any iterable of bug ids
 * (see KNOWN_BUGS); `variant: 'v2'` renames every "Add to cart" to "Add to
 * basket" — the intentional change the upgrade-triage mode dispositions.
 * Resolves once listening; the returned url has the actual port (port 0 = OS-assigned).
 */
export async function startMiniApp({ port = 0, bugs = new Set(), variant = 'v1' } = {}) {
  const bugSet = bugs instanceof Set ? bugs : new Set(bugs);
  const server = createServer((req, res) => {
    handle(req, res, bugSet, variant).catch((err) => {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('mini-app error: ' + (err?.message ?? String(err)));
    });
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  return {
    url: `http://127.0.0.1:${actualPort}/`,
    close: () =>
      new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function parseCliArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    out[key] = next === undefined || next.startsWith('--') ? 'true' : argv[++i];
  }
  return out;
}

// CLI: node bench/mini-app/app.mjs --port 4173 --bugs a,b --variant v2
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseCliArgs(process.argv.slice(2));
  const raw = args.bugs === 'all' ? KNOWN_BUGS.join(',') : (args.bugs ?? '');
  const bugs = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  const variant = args.variant ?? 'v1';
  const port = Number(args.port ?? 0);
  startMiniApp({ port, bugs, variant }).then(({ url }) => {
    console.log(`Gearloop mini-app listening at ${url}`);
    console.log(`variant=${variant} bugs=${[...bugs].join(',') || '(none)'}`);
    console.log('Press Ctrl+C to stop.');
  });
}
