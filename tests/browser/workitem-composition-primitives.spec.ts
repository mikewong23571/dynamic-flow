import { test, expect } from './fixtures';
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createApplication } from '../../src/server/index';
import { primitiveDisplayFixture } from '../primitive-display-fixture';

for (const width of [1440, 1024])
  test(`逐项应用、条件分路和多路收集原语对应真实端口与实例 ${width}`, async ({
    page,
  }) => {
    const root = await mkdtemp(join(tmpdir(), 'primitive-display-'));
    const app = await createApplication({
      dataRoot: root,
      runSession: async () => {
        throw Error('纯函数样例不得请求模型');
      },
    });
    let server: Server | undefined;
    try {
      const s = await primitiveDisplayFixture(app);
      await s.action({ action: 'run' });
      let ws: any;
      await expect
        .poll(async () => {
          ws = await (await app.app.request(s.path)).json();
          return ws.work.work.runs.at(-1)?.status;
        })
        .toBe('completed');
      const run = ws.work.work.runs.at(-1);
      const instances = run.results.filter((r: any) => r.nodeId === 'apply');
      expect(instances).toHaveLength(3);
      for (const result of instances) {
        const output = result.outputs.records[0].value;
        expect(output.facts).toEqual([{ source: 'synthetic-shared-fact' }]);
      }
      const collected = run.results.find((r: any) => r.nodeId === 'collect')
        .outputs.output[0].value;
      expect(collected.review.map((r: any) => r.id)).toEqual(['P1', 'P3']);
      expect(collected.ready.map((r: any) => r.id)).toEqual(['P2']);
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
      await page.goto(`${url}/items/${s.item.id}?tab=flow`);
      const collapse = page.getByRole('button', {
        name: '收起工作项 Assistant',
        exact: true,
      });
      if (await collapse.isVisible()) await collapse.click();
      const application = page.locator('.react-flow__node[data-id="apply"]');
      const route = page.locator('.react-flow__node[data-id="route"]');
      const collect = page.locator('.react-flow__node[data-id="collect"]');
      await application
        .getByRole('button', {
          name: '查看引用流水线 读取给定记录',
          exact: true,
        })
        .click();
      await expect(
        page.getByRole('dialog').getByText('模式匹配', { exact: true }),
      ).toBeVisible();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: '关闭', exact: true })
        .click();
      await expect(application.locator('.node-kind')).toHaveText('call · map');
      await expect(
        application.getByRole('button', {
          name: '查看引用流水线 读取给定记录',
          exact: true,
        }),
      ).toBeVisible();
      await expect(route.locator('.node-kind')).toHaveText('branch');
      await expect(collect.locator('.node-kind')).toHaveText('collect');
      await expect(route.locator('.node-condition')).toContainText('equals');
      await expect(
        route.locator('.node-port.input .node-port-label'),
      ).toHaveText('input');
      await expect(
        route.locator('.node-port.output .node-port-label'),
      ).toHaveText(['matched', 'unmatched']);
      await expect(
        collect.locator('.node-port.output .node-port-label'),
      ).toHaveText('output');
      await expect(page.getByLabel('计划交付', { exact: true })).toContainText(
        '可直接交付',
      );
      await expect(
        page.locator('.composition-flow-editor .react-flow__edge'),
      ).toHaveCount(5);
      for (const port of ['matched', 'unmatched'])
        await expect(
          route.locator(`.source[data-handleid="${port}"]`),
        ).toHaveCount(1);
      await expect(
        route
          .locator('.node-port.output')
          .filter({ has: page.getByLabel('交付绑定', { exact: true }) }),
      ).toHaveCount(1);
      await expect(
        collect
          .locator('.node-port.output')
          .getByLabel('交付绑定', { exact: true }),
      ).toHaveCount(1);
      // Labels stay legible without selecting or hovering a node.
      await page.mouse.move(10, 10);
      for (const node of [application, route, collect]) {
        const opacity = await node
          .locator('.node-port-label')
          .evaluateAll((labels) =>
            labels.map((label) => getComputedStyle(label).opacity),
          );
        expect(opacity.every((value) => value === '1')).toBe(true);
      }
      await page.getByRole('button', { name: '整理布局', exact: true }).click();
      await expect(
        page.getByRole('button', { name: '整理布局', exact: true }),
      ).toBeEnabled();
      await expect
        .poll(() =>
          page.locator('.composition-flow-editor .canvas').evaluate((el) => {
            const b = el.getBoundingClientRect();
            return [...el.querySelectorAll('.workflow-node')].every((node) => {
              const r = node.getBoundingClientRect();
              return (
                r.left >= b.left &&
                r.right <= b.right &&
                r.top >= b.top &&
                r.bottom <= b.bottom
              );
            });
          }),
        )
        .toBe(true);
      const evidence = resolve(
        process.env.FLOWCRAFT_EVIDENCE_DIR || 'test-results/primitive-display',
      );
      await mkdir(evidence, { recursive: true });
      await page.screenshot({
        path: join(evidence, `primitive-dag-${width}.png`),
      });
      await page.getByRole('button', { name: '编辑流程', exact: true }).click();
      if (await collapse.isVisible()) await collapse.click();
      await expect(
        route.locator('.node-port.output .node-port-label'),
      ).toHaveText(['matched', 'unmatched']);
      await expect(application.locator('.node-kind')).toHaveText('call · map');
      await page.getByRole('button', { name: '结束编辑', exact: true }).click();
      await application
        .getByRole('button', {
          name: '查看读取给定记录的执行实例',
          exact: true,
        })
        .click();
      await expect(
        page.locator(`.run-inspector[data-run-id="${run.id}"]`),
      ).toBeVisible();
      await page.getByRole('button', { name: '执行实例', exact: true }).click();
      await expect(page.getByRole('menuitemradio')).toHaveCount(3);
      await page.keyboard.press('Escape');
      await page.getByRole('link', { name: /^继续工作项 / }).click();
      const after = (await (await app.app.request(s.path)).json()) as any;
      expect(after.work.work.runs).toEqual([run]);
      expect(after.work.definitions[after.work.work.draftId]).toEqual(s.flow);
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
