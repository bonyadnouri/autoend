import { chromium } from 'playwright';
import { capturePage, TOP_REGION_HEIGHT } from '../src/visual/capture.js';

const MISSES = [
  'https://www.hhs.gov/',
  'https://finder.healthcare.gov/',
  'https://www.nih.gov/',
  'https://www.nasa.gov/',
  'https://www.fbi.gov/',
  'https://www.whitehouse.gov/',
  'https://www.weather.gov/',
];

const browser = await chromium.launch();
for (const url of MISSES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const cap = await capturePage({
    page,
    target: new URL(url),
    outputDir: '/tmp/banner-verify',
    filePrefix: new URL(url).hostname.replace(/\./g, '-'),
  });
  const top = cap.topRegionText.replace(/\s+/g, ' ').slice(0, 220);
  const footer = /official website/i.test(cap.visibleText);
  const usaDom = cap.domBoxes
    .filter((b) => b.box.y < TOP_REGION_HEIGHT && /usa|banner|gov/i.test(b.selector + b.label))
    .slice(0, 5);
  console.log('---', new URL(url).hostname, '---');
  console.log('topRegionText:', top);
  console.log('footer has official website text:', footer);
  console.log('top dom hints:', usaDom.map((b) => b.label || b.selector).join(' | ') || '(none)');
  await ctx.close();
}
await browser.close();
