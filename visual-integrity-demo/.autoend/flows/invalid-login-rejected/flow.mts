export default async function flow(page, target) {
  await page.goto(new URL('/login', target).href);
  await page.getByRole('textbox', { name: 'Email' }).fill('test@example.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('TestPass123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForTimeout(2000);
  if (!page.url().includes('/login')) throw new Error('expected to stay on login, got ' + page.url());
  const heading = await page.getByRole('heading', { level: 1 }).textContent();
  if (!heading?.includes('Login')) throw new Error('expected Login heading, got ' + heading);
}