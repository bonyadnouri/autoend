export default async function flow(page, target) {
  await page.goto(new URL('/login', target).href);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
  await page.goto(new URL('/projects', target).href);
  await page.getByRole('link', { name: 'Open Beta project' }).click();
  await page.waitForURL('**/projects/missing-id');
  const heading = await page.getByRole('heading', { level: 1 }).textContent();
  if (!heading?.includes('404')) throw new Error('expected 404, got ' + heading);
}