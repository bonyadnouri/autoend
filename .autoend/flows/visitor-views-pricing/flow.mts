export default async function flow(page, target) {
  await page.goto(new URL('/preise', target).href);
  const heading = await page.getByRole('heading', { level: 1 }).textContent();
  if (!heading?.includes('Preise')) throw new Error('expected Preise heading, got ' + heading);
  await page.getByRole('button', { name: 'Jährlich' }).click();
  await page.getByRole('columnheader', { name: 'PRO' }).waitFor();
  await page.getByRole('link', { name: 'Gratis starten' }).click();
  await page.waitForURL(/registrieren/);
}