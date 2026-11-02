import { test, expect } from './fixtures';
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApplication } from '../../src/server/index';

for (const width of [1440, 1024])
  test(`首页与全局列表只展示顶层，父项内部仍能管理子项 ${width}`, async ({
    page,
  }) => {
    const root = await mkdtemp(join(tmpdir(), 'flowcraft-root-browser-'));
    const app = await createApplication({ dataRoot: root });
    let server: Server | undefined;
    const evidence = resolve(
      process.env.FLOWCRAFT_EVIDENCE_DIR || 'test-results/roots',
    );
    try {
      const parent = await app.items.create({
        title: '整批范围核对',
        goal: '按明确材料完成本批交付',
        materials: [],
      });
      const roots = [parent];
      for (let i = 1; i < 12; i++)
        roots.push(
          await app.items.create({
            title: `独立工作 ${String(i).padStart(2, '0')}`,
            goal: '完整独立目标',
            materials: [],
          }),
        );
      const { receipts } = await app.items.createChildren(parent.id, {
        candidates: Array.from({ length: 30 }, (_, i) => ({
          id: `part-${i}`,
          title: `子项专用 ${String(i).padStart(2, '0')}`,
          goal: '核对一个明确范围',
          inputs: [],
          criteria: ['已验收'],
        })),
      });
      const children = await Promise.all(
        receipts.map((r) => app.items.get(r.childId!)),
      );
      await app.items.criteria(
        children[1].id,
        children[1].criteria.map((c) => ({
          ...c,
          met: true,
          evidence: '明确验收依据',
        })),
      );
      await app.items.complete(children[1].id);
      const nested = await app.items.createChildren(children[0].id, {
        candidates: [
          {
            id: 'nested',
            title: '进一步核对',
            goal: '子任务内部独立范围',
            inputs: [],
          },
        ],
      });
      const grandId = nested.receipts[0].childId!;
      const before = await app.items.get(parent.id);
      server = serve({
        fetch: app.app.fetch,
        hostname: '127.0.0.1',
        port: 0,
      }) as Server;
      if (!server.listening)
        await new Promise<void>((done) => server!.once('listening', done));
      const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      await mkdir(evidence, { recursive: true });
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const listed = page.getByRole('table', {
        name: '已有工作项',
        exact: true,
      });
      await page.goto(url);
      await expect(listed.locator('tbody tr')).toHaveCount(5);
      const rootIds = new Set(roots.map((r) => r.id));
      for (const id of await listed
        .locator('tbody tr')
        .evaluateAll((rows) =>
          rows.map((row) => row.getAttribute('data-item-id')!),
        ))
        expect(rootIds.has(id)).toBe(true);
      await expect(listed).toContainText('子项 1/30');
      await page.screenshot({ path: join(evidence, `home-${width}.png`) });
      await page
        .getByRole('navigation', { name: '应用导航' })
        .getByRole('link', { name: '工作项', exact: true })
        .click();
      await expect(listed.locator('tbody tr')).toHaveCount(10);
      await expect(page.locator('.management-count')).toHaveText('12');
      await expect(
        page
          .getByRole('combobox', { name: '工作项状态' })
          .locator('option[value=""]'),
      ).toHaveText('全部状态 · 12');
      await expect(
        page
          .getByRole('combobox', { name: '工作项状态' })
          .locator('option[value="completed"]'),
      ).toHaveText('已结项 · 0');
      await expect(
        page.getByRole('navigation', { name: '列表分页' }),
      ).toContainText('第 1 / 2 页');
      const searchControl = page.getByRole('textbox', {
        name: '搜索工作项',
        exact: true,
      });
      const statusControl = page.getByRole('combobox', { name: '工作项状态' });
      const searchBounds = (await searchControl.boundingBox())!;
      const statusBounds = (await statusControl.boundingBox())!;
      expect(searchBounds.width).toBeGreaterThan(statusBounds.width);
      expect(Math.abs(searchBounds.y - statusBounds.y)).toBeLessThanOrEqual(1);
      expect(searchBounds.height).toBe(statusBounds.height);
      const searchForm = (await page
        .locator('.management-search')
        .boundingBox())!;
      expect(
        statusBounds.x - (searchForm.x + searchForm.width),
      ).toBeLessThanOrEqual(24);
      await page.screenshot({ path: join(evidence, `list-${width}.png`) });
      await page.getByRole('button', { name: '下一页', exact: true }).click();
      await expect(listed.locator('tbody tr')).toHaveCount(2);
      for (const id of await listed
        .locator('tbody tr')
        .evaluateAll((rows) =>
          rows.map((row) => row.getAttribute('data-item-id')!),
        ))
        expect(rootIds.has(id)).toBe(true);
      const search = page.getByRole('textbox', {
        name: '搜索工作项',
        exact: true,
      });
      await search.fill('子项专用');
      await page.getByRole('button', { name: '搜索', exact: true }).click();
      await expect(
        page.getByRole('heading', {
          name: '没有符合条件的工作项',
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator('.management-count')).toHaveText('0');
      await expect(
        page
          .getByRole('combobox', { name: '工作项状态' })
          .locator('option[value=""]'),
      ).toHaveText('全部状态 · 12');
      await search.fill(parent.title);
      await page.getByRole('button', { name: '搜索', exact: true }).click();
      await expect(listed.locator('tbody tr')).toHaveCount(1);
      await expect(listed).toContainText('子项 1/30');
      await page
        .getByRole('link', { name: `打开工作项 ${parent.key}`, exact: true })
        .click();
      await page.getByRole('button', { name: '工作项更多操作' }).click();
      await page
        .getByRole('menuitem', { name: '子工作项', exact: true })
        .click();
      const dialog = page.getByRole('dialog', {
        name: '子工作项',
        exact: true,
      });
      await expect(dialog.locator('tr[data-child-id]')).toHaveCount(10);
      await expect(dialog).toContainText('共 30 项');
      await page.screenshot({ path: join(evidence, `children-${width}.png`) });
      const row = dialog.locator('tr[data-child-id]').first();
      const childId = await row.getAttribute('data-child-id');
      await row.locator('.management-title-button').click();
      await expect(page).toHaveURL(new RegExp(`/items/${childId}`));
      await expect(
        page.getByRole('heading', {
          name: children.find((c) => c.id === childId)!.title,
          exact: true,
        }),
      ).toBeVisible();
      await page.goto(`${url}/items/${grandId}?tab=inputs`);
      await expect(
        page.getByRole('heading', { name: '进一步核对', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('tab', { name: '输入', exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
      expect(await app.items.get(parent.id)).toEqual(before);
      expect(errors).toEqual([]);
    } finally {
      app.runs.close();
      app.batches.close();
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((done) => server!.close(() => done()));
      }
      await rm(root, { recursive: true, force: true });
    }
  });
