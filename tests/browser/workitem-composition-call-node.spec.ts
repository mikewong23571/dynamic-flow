import { test, expect } from './fixtures';
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApplication } from '../../src/server/index';
import { interfaceFixture } from '../interface-fixture';

for (const width of [1440, 1024])
  test(`工作项节点显示引用流水线并查看固定旧版 ${width}`, async ({ page }) => {
    const root = await mkdtemp(join(tmpdir(), 'composition-call-node-'));
    const app = await createApplication({
      dataRoot: root,
      runSession: async () => {
        throw Error('只读检查不得调用模型');
      },
    });
    let server: Server | undefined;
    try {
      const scenario = await interfaceFixture(app);
      const ws = scenario.ws;
      const rootDefinition = ws.work.definitions[ws.work.work.draftId];
      const node = rootDefinition.nodes.find((node: any) => node.call);
      const reference = node.call;
      const method = ws.methods.find(
        (method: any) =>
          method.workId === reference.workId &&
          method.definitionId === reference.definitionId,
      );
      const work = await app.files.read(reference.workId);
      const original = await app.files.readDefinition(
        reference.workId,
        reference.definitionId,
      );
      const newer = structuredClone(original);
      newer.nodes[0].label = '只存在于后续新草稿';
      const newerId = await app.flow.saveDraft(work.id, work.draftId, newer);
      expect(newerId).not.toBe(reference.definitionId);
      server = serve({
        fetch: app.app.fetch,
        hostname: '127.0.0.1',
        port: 0,
      }) as Server;
      if (!server.listening)
        await new Promise<void>((resolve) =>
          server!.once('listening', resolve),
        );
      const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
      await page.goto(`${url}/items/${scenario.item.id}?tab=flow`);
      const link = page.getByRole('button', {
        name: `查看引用流水线 ${method.title}`,
        exact: true,
      });
      await expect(link).toBeVisible();
      const call = page.locator(`.react-flow__node[data-id="${node.id}"]`);
      await expect(call.getByText(method.title, { exact: true })).toHaveCount(
        1,
      );
      await expect(call.locator('.node-kind')).toHaveText('call · aggregate');
      await expect(call).toContainText(node.label);
      await expect(call).toContainText(
        `固定版 ${reference.definitionId.slice(0, 8)}`,
      );
      await link.click();
      const preview = page.getByRole('dialog', {
        name: method.title,
        exact: true,
      });
      await expect(preview).toBeVisible();
      await expect(preview).toContainText(reference.definitionId.slice(0, 8));
      await expect(
        preview
          .locator('.workflow-node')
          .filter({ hasText: original.nodes[0].label }),
      ).toBeVisible();
      await expect(preview).not.toContainText('只存在于后续新草稿');
      await expect(preview.getByRole('alert')).toHaveCount(0);
      await preview.getByRole('button', { name: '关闭', exact: true }).click();
      await expect(link).toBeFocused();
      await link.press('Enter');
      await page.keyboard.press('Escape');
      await expect(link).toBeFocused();
      await link.press('Enter');
      await preview
        .getByRole('button', { name: '编辑当前草稿', exact: true })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/methods/${reference.workId}.*fromItem=`),
      );
      await page.getByRole('link', { name: /^继续工作项 / }).click();
      await expect(
        page.getByRole('tab', { name: '流程', exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
      await expect(link).toBeVisible();
      const after = (await (
        await app.app.request(`/api/items/${scenario.item.id}/workspace`)
      ).json()) as any;
      expect(after.work.work.draftId).toBe(ws.work.work.draftId);
      expect(after.work.definitions[after.work.work.draftId]).toEqual(
        rootDefinition,
      );
      expect(after.work.work.runs).toHaveLength(0);
      expect(after.item.criteria).toEqual(ws.item.criteria);
      // An unavailable pinned definition must not silently display another saved version.
      await page.route(
        `**/api/items/${scenario.item.id}/workspace`,
        async (route) => {
          const response = await route.fetch({
            headers: { ...route.request().headers(), 'if-none-match': '' },
          });
          const value = await response.json();
          value.methods = value.methods.filter(
            (m: any) =>
              m.workId !== reference.workId ||
              m.definitionId !== reference.definitionId,
          );
          await route.fulfill({ response, json: value });
        },
      );
      await page.reload();
      await page
        .getByRole('button', {
          name: '查看引用流水线 流水线暂不可用',
          exact: true,
        })
        .click();
      await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
        '无法读取此节点引用的固定流水线版本',
      );
      await expect(
        page.getByRole('dialog').locator('.workflow-node'),
      ).toHaveCount(0);
    } finally {
      app.runs.close();
      app.batches.close();
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      }
      await rm(root, { recursive: true, force: true });
    }
  });
