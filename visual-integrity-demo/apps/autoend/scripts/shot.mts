import { chromium } from 'playwright';
import { join } from 'node:path';

const dir = process.argv[2];
const url = `file://${join(process.cwd(), dir, 'index.html')}`;
const browser = await chromium.launch();
for (const [w, h] of [[1440, 900], [1280, 780]] as const) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(url);
  await page.waitForTimeout(1000);
  const scrollH = await page.evaluate(() => document.body.scrollHeight);
  const out = join(process.cwd(), dir, `shot-${w}x${h}.png`);
  await page.screenshot({ path: out });
  console.log(`${w}x${h} scrollHeight=${scrollH} -> ${out}`);
  await page.close();
}
await browser.close();
