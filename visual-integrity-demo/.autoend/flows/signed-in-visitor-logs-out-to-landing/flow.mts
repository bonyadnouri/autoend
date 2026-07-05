export default async function flow(page, target) {
  await page.goto(new URL('/login', target).href);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
  await page.getByRole('link', { name: /Logout/ }).click();
  await page.waitForURL(new URL('/', target).href);
  const heading = await page.getByRole('heading', { level: 1 }).textContent();
  if (!heading?.includes('Deterministic Testbed')) throw new Error('expected landing, got ' + heading);
}