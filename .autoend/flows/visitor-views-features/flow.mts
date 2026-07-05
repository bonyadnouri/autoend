export default async function flow(page, target) {
  await page.goto(new URL('/funktionen', target).href);
  const heading = await page.getByRole('heading', { level: 1 }).textContent();
  if (!heading?.includes('Stempelkarte')) throw new Error('expected features heading, got ' + heading);
  const compare = await page.getByRole('columnheader', { name: /Treuly/i }).textContent();
  if (!compare) throw new Error('comparison table missing');
}