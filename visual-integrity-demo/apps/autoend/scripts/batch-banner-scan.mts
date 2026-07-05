/**
 * Quick batch scan: does the top chrome show a USA Banner (text or usa-banner class)?
 * Uses the same top-region logic as cms-healthcare rule pack.
 */
import { chromium } from 'playwright';
import { capturePage, TOP_REGION_HEIGHT } from '../src/visual/capture.js';

const CANDIDATES = [
  // Already verified demo target
  'https://finder.healthcare.gov/',
  // High-profile .gov / healthcare ecosystem
  'https://www.healthcare.gov/',
  'https://www.medicare.gov/',
  'https://www.cms.gov/',
  'https://www.hhs.gov/',
  'https://www.benefits.gov/',
  'https://www.va.gov/',
  'https://www.ssa.gov/',
  'https://www.irs.gov/',
  'https://www.usa.gov/',
  'https://www.login.gov/',
  'https://www.grants.gov/',
  'https://studentaid.gov/',
  'https://www.recreation.gov/',
  'https://www.fda.gov/',
  'https://www.cdc.gov/',
  'https://www.nih.gov/',
  'https://www.nasa.gov/',
  'https://www.dhs.gov/',
  'https://www.treasury.gov/',
  'https://www.ed.gov/',
  'https://www.uscis.gov/',
  'https://www.opm.gov/',
  'https://www.weather.gov/',
  'https://www.travel.state.gov/',
  'https://www.fbi.gov/',
  'https://www.whitehouse.gov/',
  'https://www.data.gov/',
  'https://www.sam.gov/',
  'https://www.energy.gov/',
  'https://www.epa.gov/',
  'https://www.usda.gov/',
  // Known alternate domains / programs
  'https://www.healthit.gov/',
  'https://marketplace.cms.gov/',
  'https://localhelp.healthcare.gov/',
];

const BANNER_TEXT = /official website of the united states government|here.?s how you know/i;

function hasBanner(cap: Awaited<ReturnType<typeof capturePage>>): boolean {
  if (BANNER_TEXT.test(cap.topRegionText)) return true;
  const topH = Math.min(TOP_REGION_HEIGHT, cap.viewport.height);
  return cap.domBoxes.some(
    (b) =>
      b.box.y < topH &&
      (/usa-banner/i.test(b.selector) || /usa-banner/i.test(b.label)),
  );
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const outDir = '/tmp/banner-scan';

const results: Array<{ url: string; banner: boolean; host: string; note?: string }> = [];

for (const url of CANDIDATES) {
  try {
    const cap = await capturePage({
      page,
      target: new URL(url),
      outputDir: outDir,
      filePrefix: 'scan',
    });
    const banner = hasBanner(cap);
    let note: string | undefined;
    if (!banner && /official website/i.test(cap.visibleText)) {
      note = 'banner text elsewhere (footer?), not top chrome';
    }
    results.push({ url: cap.url, banner, host: new URL(url).hostname, note });
    process.stdout.write(`${banner ? 'OK  ' : 'MISS'} ${new URL(url).hostname}\n`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ url, banner: false, host: new URL(url).hostname, note: `error: ${msg.slice(0, 80)}` });
    process.stdout.write(`ERR  ${new URL(url).hostname} ${msg.slice(0, 60)}\n`);
  }
}

await browser.close();

console.log('\n--- MISSING USA BANNER IN TOP CHROME ---');
for (const r of results.filter((x) => !x.banner)) {
  console.log(`${r.host}\t${r.url}${r.note ? `\t(${r.note})` : ''}`);
}

console.log('\n--- HAS BANNER (reference) ---');
for (const r of results.filter((x) => x.banner)) {
  console.log(r.host);
}
