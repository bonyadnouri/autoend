import { chromium } from 'playwright';
import { capturePage, TOP_REGION_HEIGHT } from '../src/visual/capture.js';

const BANNER = /official website of the united states government|here.?s how you know/i;

const SITES = [
  'https://www.sec.gov/',
  'https://www.ftc.gov/',
  'https://www.archives.gov/',
  'https://www.disasterassistance.gov/',
  'https://www.weather.gov/',
  'https://www.noaa.gov/',
  'https://www.nasa.gov/',
  'https://innovation.cms.gov/',
  'https://data.cms.gov/',
  'https://www.healthdata.gov/',
  'https://www.vote.gov/',
];

function hasBanner(cap: Awaited<ReturnType<typeof capturePage>>): boolean {
  if (BANNER.test(cap.topRegionText)) return true;
  const topH = Math.min(TOP_REGION_HEIGHT, cap.viewport.height);
  return cap.domBoxes.some(
    (b) => b.box.y < topH && (/usa-banner/i.test(b.selector) || /usa-banner/i.test(b.label)),
  );
}

const browser = await chromium.launch();
for (const url of SITES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(5000);
  const cap = await capturePage({ page, target: new URL(url), outputDir: '/tmp/banner-extra', filePrefix: 'x' });
  const ok = hasBanner(cap);
  console.log(
    `${ok ? 'OK' : 'MISS'}\t${new URL(url).hostname}\t${cap.topRegionText.replace(/\s+/g, ' ').slice(0, 100)}`,
  );
  await ctx.close();
}
await browser.close();
