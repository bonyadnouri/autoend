export default async function flow(page, target) {
  await page.goto(new URL('/projects', target).href);
  if (!page.url().includes('/login')) throw new Error('expected login redirect, got ' + page.url());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/projects', { timeout: 10000 });
  const heading = await page.getByRole('heading', { level: 1 }).textContent();
  if (!heading?.includes('Projects')) throw new Error('expected Projects, got ' + heading);
}