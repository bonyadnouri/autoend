export default async function flow(page, target) {
  await page.goto(new URL('/login', target).href);
  await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.waitForURL('**/settings');
  const heading = await page.getByRole('heading', { level: 1 }).textContent();
  if (!heading?.includes('Settings')) throw new Error('expected Settings, got ' + heading);
}