const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const folder = __dirname;
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    await page.addInitScript(() => {
      window.longTasks = [];
      new PerformanceObserver((list) => {
        window.longTasks.push(
          ...list
            .getEntries()
            .map((e) => ({ start: e.startTime, duration: e.duration })),
        );
      }).observe({ entryTypes: ['longtask'] });
    });
    const api = [];
    page.on('response', async (r) => {
      if (r.url().includes('/api/'))
        api.push({ path: new URL(r.url()).pathname, status: r.status() });
    });
    await page.goto('http://127.0.0.1:4320');
    await page.getByRole('button', { name: '工作项', exact: true }).click();
    const start = Date.now();
    await page
      .locator(
        '[data-item-id="3a1412fb-937b-4add-a7cd-7f23f94bf05a"] .management-title-button',
      )
      .click();
    await expect(
      page
        .getByRole('region', { name: '成果检查', exact: true })
        .getByRole('heading', { level: 3 }),
    ).toBeVisible({ timeout: 90000 });
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    const first = {
      ms: Date.now() - start,
      ...(await page.evaluate(() => ({
        dom: document.querySelectorAll('*').length,
        hiddenPanels: document.querySelectorAll('[role=tabpanel][hidden]')
          .length,
        longTasks: window.longTasks,
      }))),
    };
    console.log('FIRST', JSON.stringify(first));
    const steps = page.getByRole('navigation', { name: '处理环节' });
    const switches = [];
    for (const index of [0, 1, 2, 3, 4]) {
      const label = await steps.getByRole('button').nth(index).innerText();
      const t = Date.now();
      await steps.getByRole('button').nth(index).click();
      await page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
      switches.push({
        index,
        label,
        ms: Date.now() - t,
        dom: await page.locator('*').count(),
      });
      console.log('STEP', JSON.stringify(switches.at(-1)));
    }
    await page.waitForTimeout(4200);
    const summary = {
      date: new Date().toISOString(),
      first,
      switches,
      api: api.length,
      ...(await page.evaluate(() => ({
        dom: document.querySelectorAll('*').length,
        longTaskCount: window.longTasks.length,
        maxLongTask: Math.max(0, ...window.longTasks.map((x) => x.duration)),
        longTaskMs: window.longTasks.reduce((s, x) => s + x.duration, 0),
        heap: performance.memory?.usedJSHeapSize,
      }))),
    };
    fs.writeFileSync(
      `${folder}/${process.argv[2] || 'measurement'}.json`,
      JSON.stringify(summary, null, 2),
    );
    await page.screenshot({
      path: `${folder}/${process.argv[2] || 'measurement'}.png`,
    });
    console.log('RESULT', JSON.stringify(summary));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
