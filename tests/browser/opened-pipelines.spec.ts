import { test, expect } from '@playwright/test';
import type { Snapshot } from '../../src/shared/records';

for (const width of [1440, 1024]) {
  test(`已打开流水线保持顺序、关闭只移除入口、刷新恢复（${width}）`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    const prefix = `打开列表 ${width} ${Date.now().toString(36)}`;
    const works: Snapshot['work'][] = [];
    try {
      for (let i = 0; i < 6; i++) {
        const response = await request.post('/api/works', {
          data: {
            goal: `${prefix} ${i + 1}`,
            materials: ['真实函数运行的材料'],
          },
        });
        expect(response.status()).toBe(201);
        const { work } = (await response.json()) as Snapshot;
        works.push(work);
        const saved = await request.post(`/api/works/${work.id}/actions`, {
          data: {
            action: 'saveDraft',
            definition: {
              schemaVersion: 1,
              inputs: ['materials'],
              nodes: [
                {
                  id: 'step',
                  label: '整理材料',
                  kind: 'function',
                  mode: 'each',
                  functionName: 'identity',
                },
              ],
              edges: [{ from: ['$input', 'materials'], to: ['step', 'input'] }],
              outputs: { result: ['step', 'output'] },
            },
          },
        });
        expect(saved.ok()).toBeTruthy();
      }
      await page.goto('/');
      const opened = page.getByRole('navigation', { name: '已打开的流水线' });
      const entries = opened.locator('.work-item');
      await expect(opened).toBeVisible();
      await expect(entries).toHaveCount(0);
      const openFromLibrary = async (title: string) => {
        await page
          .getByRole('button', { name: '全部流水线', exact: true })
          .click();
        const library = page.getByRole('region', { name: '流水线管理' });
        await library
          .getByRole('textbox', { name: '搜索标题或目标' })
          .fill(title);
        await library
          .getByRole('button', { name: '搜索', exact: true })
          .click();
        await library.getByRole('button', { name: title, exact: true }).click();
        await expect(
          page.getByRole('heading', { name: title, exact: true }),
        ).toBeVisible();
      };
      const titles = works.map((work) => work.title!);
      // Open order differs from the library's updatedAt order, and exceeds the old five-row limit.
      for (const title of titles) await openFromLibrary(title);
      await expect(entries).toHaveText(titles);
      await opened
        .getByRole('button', { name: titles[1], exact: true })
        .click();
      await expect(entries).toHaveText(titles);
      await page.getByRole('button', { name: '运行流程', exact: true }).click();
      await expect
        .poll(async () => {
          const snapshot = (await (
            await request.get(`/api/works/${works[1].id}`)
          ).json()) as Snapshot;
          return snapshot.work.runs.at(-1)?.status;
        })
        .toBe('completed');
      await expect(entries).toHaveText(titles);
      // A real saved metadata update is delivered through SSE in place.
      titles[1] = `${prefix} 已重命名`;
      expect(
        (
          await request.post(`/api/works/${works[1].id}/actions`, {
            data: { action: 'rename', title: titles[1] },
          })
        ).ok(),
      ).toBeTruthy();
      await expect(entries).toHaveText(titles);
      await page.reload();
      await expect(entries).toHaveText(titles);
      await openFromLibrary(titles[1]);
      await expect(entries).toHaveText(titles);
      // Keep unsaved edits when closing and reopening an entry.
      await page
        .locator('.workflow-node')
        .getByText('整理材料', { exact: true })
        .click();
      await page
        .getByLabel('步骤名称', { exact: true })
        .fill('关闭后仍保留的草稿');
      await expect(
        page.getByRole('button', { name: '保存修改', exact: true }),
      ).toBeVisible();
      await opened
        .getByRole('button', { name: `关闭流水线 ${titles[0]}`, exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: titles[1], exact: true }),
      ).toBeVisible();
      await opened
        .getByRole('button', { name: `关闭流水线 ${titles[1]}`, exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: titles[2], exact: true }),
      ).toBeVisible();
      await expect(entries).toHaveText(titles.slice(2));
      await openFromLibrary(titles[1]);
      await expect(entries).toHaveText([...titles.slice(2), titles[1]]);
      await expect(page.getByLabel('步骤名称', { exact: true })).toHaveValue(
        '关闭后仍保留的草稿',
      );
      await page.reload();
      await expect(entries).toHaveText([...titles.slice(2), titles[1]]);
      await page
        .locator('.workflow-node')
        .getByText('关闭后仍保留的草稿', { exact: true })
        .click();
      await expect(page.getByLabel('步骤名称', { exact: true })).toHaveValue(
        '关闭后仍保留的草稿',
      );
      await testInfo.attach(`opened-pipelines-${width}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      for (const title of [...titles.slice(2), titles[1]]) {
        await opened
          .getByRole('button', { name: `关闭流水线 ${title}`, exact: true })
          .click();
      }
      await expect(entries).toHaveCount(0);
      await expect(
        page.getByRole('region', { name: '流水线管理' }),
      ).toBeVisible();
      await page.reload();
      await expect(entries).toHaveCount(0);
      await expect(
        page.getByRole('region', { name: '流水线管理' }),
      ).toBeVisible();
      for (const work of works) {
        const persisted = (await (
          await request.get(`/api/works/${work.id}`)
        ).json()) as Snapshot;
        expect(persisted.work.archivedAt).toBeUndefined();
        expect(persisted.work.materials).toHaveLength(1);
      }
    } finally {
      for (const work of works)
        await request.post(`/api/works/${work.id}/actions`, {
          data: { action: 'archive', archived: true },
        });
    }
  });
}

test('旧当前工作迁移，关闭最后入口后迟到快照不恢复入口', async ({
  page,
  request,
}) => {
  const response = await request.post('/api/works', {
    data: {
      goal: `旧入口迁移 ${Date.now().toString(36)}`,
      materials: ['保留材料'],
    },
  });
  expect(response.status()).toBe(201);
  const { work } = (await response.json()) as Snapshot;
  try {
    await page.addInitScript((id) => {
      if (!sessionStorage.getItem('legacy-seeded')) {
        localStorage.setItem('dynamic-flow.work', id);
        sessionStorage.setItem('legacy-seeded', 'true');
      }
    }, work.id);
    await page.goto('/');
    const opened = page.getByRole('navigation', { name: '已打开的流水线' });
    await expect(opened.locator('.work-item')).toHaveText([work.title!]);
    await expect(
      page.getByRole('heading', { name: work.title!, exact: true }),
    ).toBeVisible();
    // Hold a real same-work refetch, then close via the keyboard before it returns.
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested!: () => void;
    const started = new Promise<void>((resolve) => {
      requested = resolve;
    });
    await page.route(`**/api/works/${work.id}`, async (route) => {
      const response = await route.fetch();
      requested();
      await held;
      await route.fulfill({ response });
    });
    await opened
      .getByRole('button', { name: work.title!, exact: true })
      .click();
    await started;
    const close = opened.getByRole('button', {
      name: `关闭流水线 ${work.title}`,
      exact: true,
    });
    await close.focus();
    await close.press('Enter');
    await expect(opened.locator('.work-item')).toHaveCount(0);
    const finished = page.waitForResponse((response) =>
      response.url().endsWith(`/api/works/${work.id}`),
    );
    release();
    await finished;
    await expect(
      page.getByRole('region', { name: '流水线管理' }),
    ).toBeVisible();
    await expect(opened.locator('.work-item')).toHaveCount(0);
    await page.reload();
    await expect(opened.locator('.work-item')).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: '流水线管理' }),
    ).toBeVisible();
  } finally {
    await request.post(`/api/works/${work.id}/actions`, {
      data: { action: 'archive', archived: true },
    });
  }
});
