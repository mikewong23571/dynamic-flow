const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const out = __dirname;
(async () => {
  const b = await chromium.launch({ headless: true });
  try {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto('http://127.0.0.1:4320');
    await p.getByRole('button', { name: '工作项', exact: true }).click();
    await p
      .locator(
        '[data-item-id="3a1412fb-937b-4add-a7cd-7f23f94bf05a"] .management-title-button',
      )
      .click();
    const region = p.getByRole('region', { name: '成果检查', exact: true });
    await expect(region.getByRole('heading', { level: 3 })).toBeVisible();
    const observations = [];
    for (const width of [1440, 1024]) {
      await p.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
      await p
        .getByRole('navigation', { name: '处理环节' })
        .getByRole('button')
        .first()
        .click();
      await p.locator('.items-page').evaluate((e) => (e.scrollTop = 0));
      await p.screenshot({ path: `${out}/visual-${width}.png` });
      const geometry = await p
        .locator('.item-steps button')
        .evaluateAll((es) =>
          es.map((e) => ({
            title: e.querySelector('.item-step-title').textContent,
            titleY: e.querySelector('.item-step-title').getBoundingClientRect()
              .y,
            statusY: e.querySelector('.item-step-meta').getBoundingClientRect()
              .y,
            height: e.getBoundingClientRect().height,
            background: getComputedStyle(e).backgroundColor,
            border: getComputedStyle(e).borderColor,
          })),
        );
      observations.push({
        width,
        geometry,
        overflow: await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      });
      await p
        .getByRole('navigation', { name: '处理环节' })
        .getByRole('button')
        .last()
        .click();
      await p.screenshot({
        path: `${out}/visual-selected-output-${width}.png`,
      });
    }
    fs.writeFileSync(
      `${out}/visual-observations.json`,
      JSON.stringify({ errors, observations }, null, 2),
    );
    console.log(JSON.stringify({ errors, observations }));
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
