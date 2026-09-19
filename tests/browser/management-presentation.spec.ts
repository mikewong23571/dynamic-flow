import { test, expect } from '@playwright/test';
import type { WorkItemView } from '../../src/shared/records';

// Presentation fixtures only: lifecycle behavior is exercised by workitems.spec.ts.
const states: WorkItemView['effectiveStatus'][] = [
  'waiting',
  'attention',
  'running',
  'open',
  'completed',
];
const titles = [
  '产品 A：等待厂商修复公告',
  '支付服务：输出结构需要修正',
  '依赖组件影响分析',
  '客户资料补全',
  '历史漏洞处置',
];
function rows(): WorkItemView[] {
  return Array.from({ length: 12 }, (_, index) => {
    const effectiveStatus = states[index % states.length];
    const at = new Date(Date.UTC(2026, 8, 20, 4, index)).toISOString();
    return {
      id: `presentation-${index}`,
      key: `CVE-DEMO-${String(index + 1).padStart(3, '0')}`,
      title: `${titles[index % titles.length]}${index > 4 ? ' · 包含较长名称的业务事项，用于验证列表截断和对齐' : ''}`,
      goal: '列表呈现验收 fixture',
      revision: 1,
      data: {},
      materials: [],
      workflowId: 'presentation-method',
      status: effectiveStatus === 'completed' ? 'completed' : 'open',
      effectiveStatus,
      stage:
        effectiveStatus === 'completed'
          ? '已结项'
          : effectiveStatus === 'open'
            ? ''
            : '已确认影响范围',
      summary:
        effectiveStatus === 'completed'
          ? '所有完成条件已确认并记录依据。'
          : '产品 A 1.0 受影响，补充验证材料后继续推进。',
      criteria: [],
      runs: [],
      history: [],
      createdAt: at,
      updatedAt: at,
      progressAt: at,
      execution:
        effectiveStatus === 'open'
          ? undefined
          : {
              workId: 'presentation-method',
              runId: `run-${index}`,
              definitionId: 'definition',
              status:
                effectiveStatus === 'attention'
                  ? 'failed'
                  : effectiveStatus === 'completed'
                    ? 'completed'
                    : effectiveStatus === 'waiting'
                      ? 'waiting'
                      : 'running',
              waits:
                effectiveStatus === 'waiting'
                  ? [
                      {
                        nodeId: 'wait',
                        event: 'vendor.announcement',
                        reason: '等待厂商发布修复公告',
                        dueAt: '2026-09-23T04:00:00Z',
                        status: 'pending',
                      },
                    ]
                  : [],
            },
    };
  });
}
for (const width of [1440, 1024])
  test(`管理列表层级、分页、稳定轮询与键盘 ${width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1024 ? 768 : 900 });
    const fixture = rows();
    let calls = 0;
    await page.route('**/api/items?*', async (route) => {
      calls++;
      const url = new URL(route.request().url());
      const query = url.searchParams.get('query') || '';
      const status = url.searchParams.get('status');
      const items = (calls > 1 ? [...fixture].reverse() : fixture).filter(
        (row) =>
          (!status || row.effectiveStatus === status) &&
          (!query || `${row.key} ${row.title}`.includes(query)),
      );
      await route.fulfill({ json: { items, total: items.length } });
    });
    await page.goto('/');
    await page.getByRole('button', { name: '工作项', exact: true }).click();
    const table = page.locator('.items-table');
    await expect(table.locator('tbody tr')).toHaveCount(10);
    const ids = await table
      .locator('tbody tr')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-item-id')));
    const search = page.getByRole('textbox', { name: '搜索工作项' });
    await search.fill('尚未提交的搜索');
    await expect.poll(() => calls).toBeGreaterThan(1);
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('尚未提交的搜索');
    expect(
      await table
        .locator('tbody tr')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-item-id'))),
    ).toEqual(ids);
    await expect(table.getByText('所有完成条件已确认并记录依据。')).toHaveCount(
      0,
    );
    await expect(
      table
        .locator('tr[data-item-id="presentation-4"]')
        .getByText('已结项', { exact: true }),
    ).toHaveCount(1);
    await expect(table.getByText('执行失败', { exact: true })).toHaveCount(2);
    await search.fill('');
    await page.getByRole('button', { name: '下一页', exact: true }).click();
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await page.getByRole('button', { name: '上一页', exact: true }).click();
    await page.getByRole('combobox', { name: '每页条目数' }).selectOption('20');
    await expect(table.locator('tbody tr')).toHaveCount(12);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await testInfo.attach(`management-items-${width}`, {
      body: await page.screenshot({
        path: `conductor/tracks/functional-ir-management_20260920/artifacts/management-items-${width}.png`,
      }),
      contentType: 'image/png',
    });
    await page.getByRole('button', { name: '流水线', exact: true }).click();
    const active = page.getByRole('tab', { name: '未归档', exact: true });
    await active.focus();
    await active.press('ArrowRight');
    const archived = page.getByRole('tab', { name: '已归档', exact: true });
    await expect(archived).toBeFocused();
    await expect(archived).toHaveAttribute('aria-selected', 'true');
    await archived.press('ArrowLeft');
    await expect(active).toBeFocused();
    await expect(active).toHaveAttribute('aria-selected', 'true');
    const menu = page.getByRole('button', { name: /更多操作/ }).first();
    await menu.press('Enter');
    await expect(
      page.getByRole('menuitem', { name: '重命名', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    await testInfo.attach(`management-flows-${width}`, {
      body: await page.screenshot({
        path: `conductor/tracks/functional-ir-management_20260920/artifacts/management-flows-${width}.png`,
      }),
      contentType: 'image/png',
    });
  });
