const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const label = process.argv[2] || 'review';
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const observations = [];
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
      await page.goto('http://127.0.0.1:4320');
      await page.getByRole('button', { name: '工作项', exact: true }).click();
      await page.locator('[data-item-id="3a1412fb-937b-4add-a7cd-7f23f94bf05a"] .management-title-button').click();
      const results = page.getByRole('region', { name: '成果检查', exact: true });
      await expect(results.getByRole('heading', { level: 3 })).toBeVisible();
      await page.screenshot({ path: path.join(__dirname, `${label}-overview-${width}.png`) });
      await page.getByRole('navigation', { name: '处理环节' }).getByRole('button').last().click();
      await page.screenshot({ path: path.join(__dirname, `${label}-report-${width}.png`) });
      observations.push(await page.evaluate(() => {
        const rect = selector => {
          const e = [...document.querySelectorAll(selector)].find(e => e.getClientRects().length);
          if (!e) return null;
          const r = e.getBoundingClientRect();
          const s = getComputedStyle(e);
          return { x: r.x, y: r.y, width: r.width, height: r.height, fontSize: s.fontSize, lineHeight: s.lineHeight, background: s.backgroundColor, border: s.borderColor };
        };
        return { width: innerWidth, header: rect('.items-heading'), overview: rect('.item-workspace-overview'), execution: rect('.item-execution-main'), artifact: rect('.item-retained-artifact:not([hidden])'), markdown: rect('.item-retained-artifact:not([hidden]) .artifact-text'), firstParagraph: rect('.item-retained-artifact:not([hidden]) .artifact-text p'), firstField: rect('.item-retained-artifact:not([hidden]) .artifact-field'), overflow: document.documentElement.scrollWidth > innerWidth, bodyOverflow: document.body.scrollWidth > innerWidth };
      }));
      await page.locator('.items-page').evaluate(e => e.scrollTop = 560);
      await page.screenshot({ path: path.join(__dirname, `${label}-reading-${width}.png`) });
      await page.getByRole('tab', { name: '业务记录', exact: true }).click();
      await page.screenshot({ path: path.join(__dirname, `${label}-history-${width}.png`) });
      await page.getByRole('button', { name: '工作项', exact: true }).last().click();
      await page.locator('[data-item-id="3a1412fb-937b-4add-a7cd-7f23f94bf05a"]').waitFor();
      await page.screenshot({ path: path.join(__dirname, `${label}-items-${width}.png`) });
      await page.getByRole('button', { name: '全部流水线', exact: true }).click();
      await page.locator('.management-title-button:visible').first().waitFor();
      await page.screenshot({ path: path.join(__dirname, `${label}-library-${width}.png`) });
    }
    fs.writeFileSync(path.join(__dirname, `${label}-observations.json`), JSON.stringify({ errors, observations }, null, 2));
    console.log(JSON.stringify({ errors, observations }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
