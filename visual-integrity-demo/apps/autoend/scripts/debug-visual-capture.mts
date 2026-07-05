import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { capturePage } from '../src/visual/capture.js';

const out = '/tmp/visual-debug';
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const cap = await capturePage({
  page,
  target: new URL('https://finder.healthcare.gov/'),
  outputDir: out,
});
console.log('URL:', cap.url);
console.log('topRegionText:', cap.topRegionText.slice(0, 300));
console.log('banner in top?', /official website|here.?s how you know/i.test(cap.topRegionText));
console.log('healthcare.gov in top?', /healthcare\.gov/i.test(cap.topRegionText));
console.log('topRegionLogos:', cap.topRegionLogos);
console.log('visibleText snippet:', cap.visibleText.slice(0, 800));
console.log('accessibilitySummary:', cap.accessibilitySummary);
console.log(
  'domBoxes:',
  cap.domBoxes.map((b) => ({ label: b.label, text: b.text?.slice(0, 80), selector: b.selector })),
);

// --- Raw DOM inspection of the top chrome region (box top < 220px) ---
const topEls = await page.evaluate(() => {
  const doc = globalThis as unknown as {
    document?: { body?: { querySelectorAll?: (s: string) => Iterable<unknown> } };
  };
  const body = doc.document?.body;
  if (!body?.querySelectorAll) return [];
  const rows: Array<Record<string, unknown>> = [];
  for (const el of body.querySelectorAll('*')) {
    const node = el as {
      getBoundingClientRect?: () => { top: number; height: number; width: number };
      tagName?: string;
      className?: unknown;
      id?: string;
      getAttribute?: (n: string) => string | null;
      querySelector?: (s: string) => { textContent?: string } | null;
      innerText?: string;
    };
    const rect = node.getBoundingClientRect?.();
    if (!rect || rect.top >= 220 || rect.height <= 0 || rect.width <= 0) continue;
    const tag = (node.tagName ?? '').toLowerCase();
    if (!['img', 'svg', 'a', 'header', 'div', 'span', 'button'].includes(tag)) continue;
    const svgTitle = node.querySelector?.('title')?.textContent ?? null;
    rows.push({
      tag,
      className: typeof node.className === 'string' ? node.className : String(node.className ?? ''),
      id: node.id ?? '',
      alt: node.getAttribute?.('alt') ?? null,
      ariaLabel: node.getAttribute?.('aria-label') ?? null,
      role: node.getAttribute?.('role') ?? null,
      svgTitle,
      innerText: (node.innerText ?? '').trim().slice(0, 60),
      top: Math.round(rect.top),
    });
  }
  return rows;
});
console.log('--- top chrome elements (top<220) ---');
for (const r of topEls) {
  if (
    r.tag === 'img' ||
    r.tag === 'svg' ||
    r.ariaLabel ||
    r.alt ||
    r.svgTitle ||
    /logo/i.test(String(r.className)) ||
    /logo/i.test(String(r.id))
  ) {
    console.log(JSON.stringify(r));
  }
}
await browser.close();
