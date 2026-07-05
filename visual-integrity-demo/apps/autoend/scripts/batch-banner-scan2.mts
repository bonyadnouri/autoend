import { chromium } from 'playwright';
import { capturePage, TOP_REGION_HEIGHT } from '../src/visual/capture.js';

const BANNER = /official website of the united states government|here.?s how you know/i;

const SITES = [
  'https://www.hhs.gov/',
  'https://finder.healthcare.gov/',
  'https://localhelp.healthcare.gov/',
  'https://www.cuidadodesalud.gov/es/',
  'https://www.medicaid.gov/',
  'https://www.nih.gov/',
  'https://www.cdc.gov/',
  'https://www.fda.gov/',
  'https://www.nasa.gov/',
  'https://www.dhs.gov/',
  'https://studentaid.gov/',
  'https://www.recreation.gov/',
  'https://www.travel.state.gov/',
  'https://www.fbi.gov/',
  'https://www.whitehouse.gov/',
  'https://www.weather.gov/',
  'https://www.epa.gov/',
  'https://www.ed.gov/',
  'https://www.uscis.gov/',
  'https://marketplace.cms.gov/',
  'https://www.healthit.gov/',
  'https://www.sam.gov/',
  'https://www.data.gov/',
  'https://www.treasury.gov/',
  'https://www.energy.gov/',
  'https://www.usda.gov/',
  'https://www.opm.gov/',
  'https://www.healthcare.gov/',
  'https://www.medicare.gov/',
];

function hasBanner(cap: Awaited<ReturnType<typeof capturePage>>): boolean {
  if (BANNER.test(cap.topRegionText)) return true;
  const topH = Math.min(TOP_REGION_HEIGHT, cap.viewport.height);
  return cap.domBoxes.some(
    (b) => b.box.y < topH && (/usa-banner/i.test(b.selector) || /usa-banner/i.test(b.label)),
  );
}

const browser = await chromium.launch();
const out = '/tmp/banner-scan2';

type Row = { status: string; host: string; finalUrl: string };
const rows: Row[] = [];

for (const url of SITES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  try {
    const cap = await capturePage({ page, target: new URL(url), outputDir: out, filePrefix: 's' });
    const banner = hasBanner(cap);
    const footerOnly = !banner && /official website/i.test(cap.visibleText);
    const status = banner ? 'BANNER_OK' : footerOnly ? 'BANNER_FOOTER_ONLY' : 'BANNER_MISS';
    rows.push({ status, host: new URL(url).hostname, finalUrl: cap.url });
    console.log(`${status}\t${new URL(url).hostname}\t${cap.url}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
    rows.push({ status: 'ERROR', host: new URL(url).hostname, finalUrl: msg });
    console.log(`ERROR\t${new URL(url).hostname}\t${msg}`);
  } finally {
    await ctx.close();
  }
}

await browser.close();

console.log('\n=== BEST DEMO TARGETS (missing banner, famous, clean load) ===');
for (const r of rows.filter((x) => x.status === 'BANNER_MISS' || x.status === 'BANNER_FOOTER_ONLY')) {
  console.log(`${r.status}\t${r.host}`);
}
