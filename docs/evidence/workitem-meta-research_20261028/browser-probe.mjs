// Public, deterministic demo; no model requests or account actions.
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const evidenceDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(evidenceDir, '../../..');
const require = createRequire(resolve(repoRoot, 'package.json'));
const { chromium, expect } = require('@playwright/test');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const report = {
  url: 'https://no-ai-demo.json-render.dev/',
  browser: browser.version(),
  node: process.version,
  errors: [],
  steps: [],
};
page.on('pageerror', (error) => report.errors.push(error.message));
try {
  await page.goto(report.url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.getByRole('button', { name: 'Settings Form', exact: true }).click();
  await page.getByText('Account Settings', { exact: true }).waitFor();
  const name = page.getByRole('textbox', { name: 'Full Name' });
  await expect(name).toHaveValue('Ada Lovelace');
  await name.fill('Flowcraft research');
  await expect(name).toHaveValue('Flowcraft research');
  report.steps.push({ action: 'edit bound form value', value: await name.inputValue() });

  await page.getByRole('button', { name: 'Cascading Selects', exact: true }).click();
  await page.getByText('Shipping Address', { exact: true }).waitFor();
  await page.getByRole('combobox').nth(0).click();
  await page.getByRole('option', { name: 'Japan', exact: true }).click();
  await page.getByRole('combobox').nth(1).click();
  const japanCities = await page.getByRole('option').allTextContents();
  expect(japanCities).toContain('Tokyo');
  await page.getByRole('option', { name: 'Tokyo', exact: true }).click();
  await expect(page.getByText('Tokyo, Japan', { exact: true })).toBeVisible();
  report.steps.push({ action: 'dependent options and computed result', japanCities, result: 'Tokyo, Japan' });

  await page.getByRole('combobox').nth(0).click();
  await page.getByRole('option', { name: 'Canada', exact: true }).click();
  await expect(page.getByText('Tokyo, Japan', { exact: true })).toHaveCount(0);
  await page.getByRole('combobox').nth(1).click();
  const canadaCities = await page.getByRole('option').allTextContents();
  expect(canadaCities).toContain('Toronto');
  expect(canadaCities).not.toContain('Tokyo');
  await page.keyboard.press('Escape');
  report.steps.push({
    action: 'country change updates options; inspect retained city in computed output',
    canadaCities,
    cityTriggerText: await page.getByRole('combobox').nth(1).innerText(),
  });
  report.body = await page.locator('body').innerText();
  report.observedDependentValueMismatch = report.body.includes('Tokyo, Canada') && !canadaCities.includes('Tokyo');
  expect(report.observedDependentValueMismatch).toBe(true);
  await page.screenshot({ path: resolve(evidenceDir, 'public-demo.png'), fullPage: true });
  report.probeCompleted = true;
} catch (error) {
  report.probeCompleted = false;
  report.error = String(error);
  process.exitCode = 1;
} finally {
  await writeFile(resolve(evidenceDir, 'browser-output.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify(report));
