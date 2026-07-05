import type { Page } from 'playwright';
import type { DomBox, VisualCapture, ViewportSize } from './types.js';
import { type PerfTiming, timeStage } from './perf.js';

/** Height, in px, of the crop used for top-of-page chrome checks (banner/header). */
export const TOP_REGION_HEIGHT = 220;

const TEXT_CAP = 20_000;

/**
 * Selectors Tier 0 always probes for bounding boxes — enough to draw a
 * useful region layer without any model (Visual Integrity plan: Viewer
 * Experience > Region Layer, "dom" source overlays).
 */
const DOM_SELECTORS: Array<{ selector: string; label: string }> = [
  { selector: 'header', label: 'header' },
  { selector: 'nav', label: 'navigation' },
  { selector: 'footer', label: 'footer' },
  { selector: 'h1', label: 'main heading' },
  { selector: 'main', label: 'main content' },
  { selector: 'button', label: 'button' },
  { selector: 'a[href*="privacy" i]', label: 'privacy link' },
  { selector: '[role="banner"]', label: 'aria banner region' },
  { selector: '[class*="usa-banner" i]', label: 'usa-banner-like element' },
];

/** Playwright page.goto + settle, tuned for a static single-page capture (not a Flow replay). */
export async function stabilizePage(page: Page, url: URL, timeoutMs = 15_000): Promise<void> {
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  try {
    await page.waitForLoadState('networkidle', { timeout: Math.min(5_000, timeoutMs) });
  } catch {
    // Busy pages (analytics beacons, polling) may never go fully idle — a
    // best-effort settle is enough for a static visual-rule check.
  }
  // Disable CSS animations/transitions so screenshots are deterministic.
  await page.addStyleTag({
    content: '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }',
  }).catch(() => undefined);
}

/**
 * Accessible-name signals for logo/identity marks in the top chrome. A site's
 * wordmark often renders as an image/SVG (not selectable text), so a text-only
 * check misses it; we collect alt / aria-label / svg<title> instead.
 */
async function extractTopRegionLogos(page: Page, topHeight: number): Promise<string[]> {
  return page
    .evaluate((maxTop) => {
      const doc = globalThis as unknown as {
        document?: { querySelectorAll?: (sel: string) => Iterable<unknown> };
        getComputedStyle?: (el: unknown) => { visibility?: string; display?: string };
      };
      const root = doc.document;
      if (!root?.querySelectorAll) return [] as string[];
      const selector =
        'img[alt], svg, [class*="logo" i], [id*="logo" i], a[aria-label], [role="img"][aria-label]';
      const names: string[] = [];
      for (const el of root.querySelectorAll(selector)) {
        const node = el as {
          getBoundingClientRect?: () => { top: number; height: number; width: number };
          getAttribute?: (name: string) => string | null;
          querySelector?: (sel: string) => { textContent?: string | null } | null;
        };
        const rect = node.getBoundingClientRect?.();
        if (!rect || rect.top >= maxTop || rect.height <= 0 || rect.width <= 0) continue;
        const style = doc.getComputedStyle?.(el);
        if (style?.visibility === 'hidden' || style?.display === 'none') continue;
        const alt = node.getAttribute?.('alt');
        const ariaLabel = node.getAttribute?.('aria-label');
        const svgTitle = node.querySelector?.('title')?.textContent ?? null;
        for (const candidate of [alt, ariaLabel, svgTitle]) {
          const name = candidate?.trim();
          if (name) names.push(name.slice(0, 240));
        }
      }
      return names;
    }, topHeight)
    .catch(() => [] as string[]);
}

async function extractDomBoxes(page: Page): Promise<DomBox[]> {
  const boxes: DomBox[] = [];
  for (const { selector, label } of DOM_SELECTORS) {
    try {
      const locator = page.locator(selector).first();
      const count = await page.locator(selector).count();
      if (count === 0) continue;
      const box = await locator.boundingBox();
      if (!box) continue;
      const text = (await locator.innerText().catch(() => ''))?.trim().slice(0, 120);
      boxes.push({ selector, label, box, text: text || undefined });
    } catch {
      // A selector that never resolves (detached node, cross-origin iframe) is skipped, not fatal.
    }
  }
  return boxes;
}

/** Landmark roles a rule pack cares about, e.g. "banner: [empty]" signals a missing USA Banner. */
const LANDMARK_SELECTORS: Array<{ selector: string; role: string }> = [
  { selector: 'h1', role: 'heading' },
  { selector: '[role="banner"], header', role: 'banner' },
  { selector: '[role="navigation"], nav', role: 'navigation' },
  { selector: '[role="contentinfo"], footer', role: 'contentinfo' },
];

async function extractAccessibilitySummary(page: Page): Promise<string[]> {
  const lines: string[] = [];
  for (const { selector, role } of LANDMARK_SELECTORS) {
    try {
      if ((await page.locator(selector).count()) === 0) continue;
      const text = (await page.locator(selector).first().innerText().catch(() => ''))?.trim().slice(0, 80);
      lines.push(`${role}${text ? `: ${text}` : ''}`);
    } catch {
      // A landmark that never resolves is skipped, not fatal.
    }
  }
  return lines;
}

export interface CapturePageOptions {
  page: Page;
  target: URL;
  outputDir: string;
  viewport?: ViewportSize;
  /** Filename prefix so multiple captures (actual/expected) can share a dir. */
  filePrefix?: string;
  timings?: PerfTiming[];
  /** When true, skip page.goto — capture the page as-is (replay integration). */
  skipNavigation?: boolean;
}

/**
 * Tier 0 capture (Visual Integrity plan: Model Stack > Tier 0). Produces the
 * deterministic evidence — screenshot, top-region crop, visible text, DOM
 * boxes, accessibility summary — that the rule pack and diff engine consume.
 */
export async function capturePage(opts: CapturePageOptions): Promise<VisualCapture> {
  const { page, target, outputDir } = opts;
  const viewport = opts.viewport ?? { width: 1280, height: 720 };
  const prefix = opts.filePrefix ?? 'actual';
  const timings = opts.timings ?? [];

  if (!opts.skipNavigation) {
    await timeStage('captureAndStabilize', timings, () => stabilizePage(page, target));
  } else {
    await page
      .addStyleTag({
        content:
          '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }',
      })
      .catch(() => undefined);
  }

  const screenshotFile = `${prefix}.png`;
  const topRegionFile = `${prefix}-top-region.png`;

  const topHeight = Math.min(TOP_REGION_HEIGHT, viewport.height);
  const { visibleText, topRegionText, topRegionLogos, domBoxes, accessibilitySummary } = await timeStage(
    'screenshotAndDom',
    timings,
    async () => {
      await page.screenshot({ path: `${outputDir}/${screenshotFile}` });
      await page.screenshot({
        path: `${outputDir}/${topRegionFile}`,
        clip: { x: 0, y: 0, width: viewport.width, height: Math.min(TOP_REGION_HEIGHT, viewport.height) },
      });
      const visibleText = await page
        .evaluate(() => {
          // Runs in the browser context; cast avoids requiring "DOM" in this
          // package's Node-targeted tsconfig lib.
          const doc = (globalThis as unknown as { document?: { body?: { innerText?: string } } }).document;
          return doc?.body?.innerText ?? '';
        })
        .then((text) => text.replace(/\s+/g, ' ').trim().slice(0, TEXT_CAP))
        .catch(() => '');
      const topRegionText = await page
        .evaluate((topHeight) => {
          const doc = globalThis as unknown as {
            document?: {
              body?: { querySelectorAll?: (sel: string) => Iterable<unknown> };
            };
            getComputedStyle?: (el: unknown) => { visibility?: string; display?: string };
          };
          const body = doc.document?.body;
          if (!body?.querySelectorAll) return '';
          const parts: string[] = [];
          for (const el of body.querySelectorAll('*')) {
            const node = el as {
              getBoundingClientRect?: () => { top: number; height: number; width: number };
              innerText?: string;
            };
            const rect = node.getBoundingClientRect?.();
            if (!rect || rect.top >= topHeight || rect.height <= 0 || rect.width <= 0) continue;
            const style = doc.getComputedStyle?.(el);
            if (style?.visibility === 'hidden' || style?.display === 'none') continue;
            const t = node.innerText?.trim();
            if (t && t.length <= 240) parts.push(t);
          }
          return parts.join(' ');
        }, topHeight)
        .then((text) => text.replace(/\s+/g, ' ').trim().slice(0, TEXT_CAP))
        .catch(() => '');
      const topRegionLogos = await extractTopRegionLogos(page, topHeight);
      const domBoxes = await extractDomBoxes(page);
      const accessibilitySummary = await extractAccessibilitySummary(page);
      return { visibleText, topRegionText, topRegionLogos, domBoxes, accessibilitySummary };
    },
  );

  return {
    url: page.url(),
    viewport,
    screenshotFile,
    topRegionFile,
    outputDir,
    visibleText,
    topRegionText,
    topRegionLogos,
    domBoxes,
    accessibilitySummary,
    capturedAt: new Date().toISOString(),
  };
}
