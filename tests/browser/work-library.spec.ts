import { test, expect } from '@playwright/test';
import type { Snapshot, WorkPage } from '../../src/shared/records';

test('工作列表搜索、分页、重命名、归档恢复与重新打开', async ({
  page,
  request,
}, testInfo) => {
  const prefix = `自动验收列表${Date.now().toString(36)}`;
  const created: Snapshot[] = [];
  for (let index = 1; index <= 12; index++) {
    const response = await request.post('/api/works', {
      data: {
        goal: `${prefix} 第${index}项：核对材料并整理分析建议`,
        materials: [`第${index}项独立测试材料`],
      },
    });
    expect(response.status()).toBe(201);
    created.push(await response.json());
  }
  try {
    await page.goto('/');
    await page.getByRole('button', { name: '全部流水线', exact: true }).click();
    const library = page.getByRole('region', {
      name: '流水线管理',
      exact: true,
    });
    await library
      .getByRole('textbox', { name: '搜索标题或目标', exact: true })
      .fill(prefix);
    await library.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(library).toContainText('共 12 项');
    await expect(library.locator('.library-item')).toHaveCount(10);
    await expect(library).toContainText('第 1 / 2 页');
    await library.getByRole('button', { name: '下一页', exact: true }).click();
    await expect(library.locator('.library-item')).toHaveCount(2);
    await expect(library).toContainText('第 2 / 2 页');
    await library.getByRole('button', { name: '上一页', exact: true }).click();
    await expect(library.locator('.library-item')).toHaveCount(10);
    await library
      .getByRole('combobox', { name: '每页条目数', exact: true })
      .selectOption('20');
    await expect(library.locator('.library-item')).toHaveCount(12);
    await expect(library).toContainText('第 1 / 1 页');

    const current = (await (
      await request.get(
        `/api/works?query=${encodeURIComponent(prefix)}&page=1&pageSize=20`,
      )
    ).json()) as WorkPage;
    const target = current.works[0];
    expect(created.some((entry) => entry.work.id === target.id)).toBeTruthy();
    await library
      .locator('.library-item')
      .first()
      .getByRole('button', { name: /^更多操作 / })
      .click();
    await page.getByRole('menuitem', { name: '重命名', exact: true }).click();
    const dialog = page.getByRole('dialog', {
      name: '重命名流水线',
      exact: true,
    });
    const newTitle = `${prefix} 已整理`;
    await dialog
      .getByRole('textbox', { name: '流水线标题', exact: true })
      .fill(newTitle);
    await dialog.getByRole('button', { name: '保存标题', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      library.getByRole('heading', { name: newTitle, exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator('.work-list')
        .getByRole('button', { name: newTitle, exact: true }),
    ).toHaveCount(0);
    const renamed = (await (
      await request.get(`/api/works/${target.id}`)
    ).json()) as Snapshot;
    expect(renamed.work.title).toBe(newTitle);
    expect(renamed.work.titleEdited).toBe(true);
    expect(renamed.work.goal).toBe(target.goal);
    await testInfo.attach('work-library-1440', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    await page.setViewportSize({ width: 1024, height: 768 });
    const renamedCard = library.locator('.library-item').filter({
      has: page.getByRole('heading', { name: newTitle, exact: true }),
    });
    await renamedCard
      .getByRole('button', { name: `更多操作 ${newTitle}`, exact: true })
      .click();
    await page.getByRole('menuitem', { name: '归档', exact: true }).click();
    await expect(library).toContainText('共 11 项');
    await expect(
      library.getByRole('heading', { name: newTitle, exact: true }),
    ).toHaveCount(0);
    await library.getByRole('tab', { name: '已归档', exact: true }).click();
    await expect(library).toContainText('共 1 项');
    await expect(
      library.getByRole('heading', { name: newTitle, exact: true }),
    ).toBeVisible();
    await library
      .getByRole('button', { name: `更多操作 ${newTitle}`, exact: true })
      .click();
    await page.getByRole('menuitem', { name: '恢复', exact: true }).click();
    await expect(library).toContainText('共 0 项');
    await library.getByRole('tab', { name: '未归档', exact: true }).click();
    await expect(library).toContainText('共 12 项');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(1024);
    for (const control of [
      library.getByRole('textbox', { name: '搜索标题或目标' }),
      library.getByRole('button', {
        name: `更多操作 ${newTitle}`,
        exact: true,
      }),
      library.getByRole('button', { name: '下一页' }),
    ]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(1025);
    }
    await testInfo.attach('work-library-1024', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await library.getByRole('button', { name: newTitle, exact: true }).click();
    await expect(
      page
        .locator('.work-title')
        .getByRole('heading', { name: newTitle, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page
        .locator('.work-title')
        .getByRole('heading', { name: newTitle, exact: true }),
    ).toBeVisible();
    const reopened = (await (
      await request.get(`/api/works/${target.id}`)
    ).json()) as Snapshot;
    expect(reopened.work.archivedAt).toBeUndefined();
    expect(reopened.work.title).toBe(newTitle);
    expect(reopened.work.materials).toEqual(
      created.find((entry) => entry.work.id === target.id)!.work.materials,
    );
  } finally {
    for (const entry of created) {
      await request.post(`/api/works/${entry.work.id}/actions`, {
        data: { action: 'archive', archived: true },
      });
    }
  }
});
