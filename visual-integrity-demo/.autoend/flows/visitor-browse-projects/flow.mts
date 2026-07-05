export default async function flow(page, target) {
  await page.goto(new URL('/login', target).href);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard/);
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.waitForURL(/\/projects/, { timeout: 10000 });
  const heading = await page.getByRole('heading', { level: 1 }).textContent();
  if (!heading?.includes('Projects')) throw new Error('expected Projects, got ' + heading);
}