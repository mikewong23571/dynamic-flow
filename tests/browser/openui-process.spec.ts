import { test, expect } from './fixtures';
import { interfaceFixture } from '../interface-fixture';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
for (const width of [1440, 1024])
  test(`固定call进入真实子执行、逐项输入与原始输出 ${width}`, async ({
    page,
    application,
  }) => {
    const scenario = await interfaceFixture(application);
    const path = `/api/items/${scenario.item.id}/workspace`;
    let ws = await scenario.post(`${path}/actions`, {
      action: 'run',
      baseRevision: scenario.ws.item.revision,
    });
    await expect
      .poll(async () => {
        ws = await (await application.app.request(path)).json();
        return ws.work.work.runs.at(-1)?.status;
      })
      .toBe('completed');
    const run = ws.work.work.runs.at(-1);
    expect(
      run.results.find((r: any) => r.nodeId === 'process').call,
    ).toBeTruthy();
    for (const output of ['records', 'progress'])
      ws = await scenario.post(`${path}/actions`, {
        action: 'publishDelivery',
        baseRevision: ws.item.revision,
        runId: run.id,
        output,
        programId: ws.uiProgram.id,
      });
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    await page.goto(`/items/${scenario.item.id}?tab=flow`);
    const inspection = page.getByRole('region', {
      name: '处理过程',
      exact: true,
    });
    await inspection.scrollIntoViewIfNeeded();
    await expect(inspection.locator('.run-inspector')).toHaveAttribute(
      'data-run-id',
      run.id,
    );
    await inspection
      .getByRole('button', { name: '查看方法内执行', exact: true })
      .click();
    const child = run.results.find((r: any) => r.nodeId === 'process').call;
    await expect(inspection.locator('.run-inspector')).toHaveAttribute(
      'data-run-id',
      child.runId,
    );
    await expect(
      inspection.getByText('保留原来件', { exact: true }).first(),
    ).toBeVisible();
    await inspection
      .getByRole('tab', { name: '输入与依据', exact: true })
      .click();
    await expect(inspection).toContainText('R2');
    await inspection.getByRole('tab', { name: /^产物/ }).click();
    await inspection
      .getByRole('button', { name: '原始数据', exact: true })
      .click();
    await expect(inspection).toContainText('待补充的来件');
    await expect(
      inspection.getByRole('navigation', { name: '来源轨迹' }),
    ).toBeVisible();
    await inspection
      .getByRole('button', { name: '更多记录操作', exact: true })
      .click();
    await page
      .getByRole('menuitem', { name: '加入完成依据', exact: true })
      .click();
    await expect(
      page.getByRole('dialog', { name: '加入完成依据', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '关闭', exact: true })
      .click();
    await inspection
      .getByRole('button', { name: '更多记录操作', exact: true })
      .click();
    await page
      .getByRole('menuitem', { name: '建立子工作项', exact: true })
      .click();
    await expect(
      page.getByRole('dialog', { name: '添加子工作项', exact: true }),
    ).toContainText('将带入所选成果：所选中间成果');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '关闭', exact: true })
      .click();

    const evidence =
      process.env.FLOWCRAFT_EVIDENCE_DIR || 'test-results/openui-evidence';
    await mkdir(evidence, { recursive: true });
    await inspection.locator('pre').last().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(evidence, `nested-process-${width}.png`),
    });
    await page.getByRole('tab', { name: '工作', exact: true }).click();
    await page
      .getByRole('checkbox', { name: '选择记录 R2', exact: true })
      .check();
    await page
      .getByRole('textbox', { name: '补充依据', exact: true })
      .fill('人工核对第二份原材料');
    await page
      .getByRole('button', { name: '补充并登记依据', exact: true })
      .click();
    await expect
      .poll(async () => {
        ws = await (await application.app.request(path)).json();
        return ws.item.receivedInputs.at(-1)?.value;
      })
      .toEqual({
        record: { id: 'R2', team: '业务', summary: '待补充的来件', note: '' },
        note: '人工核对第二份原材料',
      });
    expect(ws.work.work.runs).toHaveLength(1);
    expect(ws.item.receivedInputs.at(-1).source).toEqual(
      ws.deliveries.find((d: any) => d.output === 'records').sources[1],
    );
  });
