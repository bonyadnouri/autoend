export default async function flow(page, target) {
  await page.goto(new URL('/login', target).href);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
  await page.goto(new URL('/', target).href);
  await page.getByRole('link', { name: 'Go to dashboard' }).click();
  await page.waitForURL('**/dashboard');
  const heading = await page.getByRole('heading', { level: 1 }).textContent();
  if (!heading?.includes('Dashboard')) throw new Error('expected Dashboard, got ' + heading);
}