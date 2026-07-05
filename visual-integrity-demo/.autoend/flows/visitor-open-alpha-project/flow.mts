export default async function flow(page, target) {
  await page.goto(new URL('/login', target).href);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard/);
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.waitForURL(/\/projects/);
  await page.getByRole('link', { name: 'Open Alpha project' }).click();
  await page.waitForURL(/\/projects\/alpha/, { timeout: 10000 });
  const heading = await page.getByRole('heading', { level: 1 }).textContent();
  if (!heading?.includes('Alpha')) throw new Error('expected Alpha, got ' + heading);
}