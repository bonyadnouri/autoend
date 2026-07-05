export default async function flow(page, target) {
  await page.goto(new URL('/login', target).href);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto(new URL('/projects/alpha', target).href);
  await page.getByRole('link', { name: 'Create task' }).click();
  await page.waitForURL(/\/projects\/alpha\/tasks\/new/, { timeout: 10000 });
  const heading = await page.getByRole('heading', { level: 1 }).textContent();
  if (!heading?.includes('Create task')) throw new Error('expected Create task, got ' + heading);
}