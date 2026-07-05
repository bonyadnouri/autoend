import { chromium } from 'playwright';
import { capturePage, TOP_REGION_HEIGHT } from '../src/visual/capture.js';

const BANNER = /official website of the united states government|here.?s how you know/i;

const SITES = [
  // retry bot-blocked
  'https://www.hhs.gov/',
  'https://www.nih.gov/',
  'https://www.fbi.gov/',
  // confirmed interesting misses
  'https://www.nasa.gov/',
  'https://www.whitehouse.gov/',
  'https://www.weather.gov/',
  'https://finder.healthcare.gov/',
  // more famous .gov candidates
  'https://www.justice.gov/',
  'https://www.state.gov/',
  'https://www.archives.gov/',
  'https://www.census.gov/',
  'https://www.gsa.gov/',
  'https://www.hud.gov/',
  'https://www.dol.gov/',
  'https://www.dot.gov/',
  'https://www.defense.gov/',
  'https://www.usa.gov/',
  'https://www.disasterassistance.gov/',
  'https://www.ready.gov/',
  'https://www.usaspending.gov/',
  'https://www.sec.gov/',
  'https://www.ftc.gov/',
  'https://www.sba.gov/',
  'https://www.usa.gov/espanol/',
  'https://www.va.gov/',
  'https://www.ssa.gov/',
  'https://www.irs.gov/',
  'https://www.usgs.gov/',
  'https://www.noaa.gov/',
  'https://www.nps.gov/',
  'https://www.uscourts.gov/',
  'https://www.usa.gov/scams-and-fraud/',
];

function hasBanner(cap: Awaited<ReturnType<typeof capturePage>>): boolean {
  if (BANNER.test(cap.topRegionText)) return true;
  const topH = Math.min(TOP_REGION_HEIGHT, cap.viewport.height);
  return cap.domBoxes.some(
    (b) => b.box.y < topH && (/usa-banner/i.test(b.selector) || /usa-banner/i.test(b.label)),
  );
}

function classify(cap: Awaited<ReturnType<typeof capturePage>>): string {
  if (/access denied|security verification|bot/i.test(cap.topRegionText)) return 'BLOCKED';
  if (hasBanner(cap)) return 'BANNER_OK';
  if (/official website/i.test(cap.visibleText)) return 'BANNER_FOOTER_ONLY';
  return 'BANNER_MISS';
}

const browser = await chromium.launch();
const out = '/tmp/banner-scan3';

for (const url of SITES) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(8000);
    const cap = await capturePage({ page, target: new URL(url), outputDir: out, filePrefix: 's' });
    const status = classify(cap);
    const top = cap.topRegionText.replace(/\s+/g, ' ').slice(0, 80);
    console.log(`${status}\t${new URL(url).hostname}\t${top}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
    console.log(`ERROR\t${new URL(url).hostname}\t${msg}`);
  } finally {
    await ctx.close();
  }
}

await browser.close();
