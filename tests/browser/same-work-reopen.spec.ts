import { test, expect } from '@playwright/test';
import type { Snapshot } from '../../src/shared/records';

test('当前工作在列表重命名后重新打开，保留工作区和未提交编辑', async ({
  page,
  request,
}, testInfo) => {
  const goal = `同工作重开回归 ${Date.now().toString(36)}`;
  const created = await request.post('/api/works', {
    data: { goal, materials: ['仅用于同工作重开回归的一条材料'] },
  });
  expect(created.status()).toBe(201);
  const { work } = (await created.json()) as Snapshot;
  try {
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
    await page.addInitScript(
      (id) => localStorage.setItem('dynamic-flow.work', id),
      work.id,
    );
    await page.goto('/');
    await page
      .locator('.workflow-node')
      .getByText('整理材料', { exact: true })
      .click();
    await page.getByLabel('步骤名称', { exact: true }).fill('仍未保存的步骤名');
    await expect(
      page.getByRole('button', { name: '保存修改', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '所有工作', exact: true }).click();
    const library = page.getByRole('region', { name: '工作列表', exact: true });
    await library.getByRole('textbox', { name: '搜索标题或目标' }).fill(goal);
    await library.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(library.locator('.library-item')).toHaveCount(1);
    await library.getByRole('button', { name: /^重命名 / }).click();
    const dialog = page.getByRole('dialog', {
      name: '重命名工作',
      exact: true,
    });
    const title = `已重命名 ${Date.now().toString(36)}`;
    await dialog.getByRole('textbox', { name: '工作标题' }).fill(title);
    await dialog.getByRole('button', { name: '保存标题', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await library.getByRole('button', { name: title, exact: true }).click();
    await expect(
      page.getByRole('heading', { name: title, level: 1, exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('步骤名称', { exact: true })).toHaveValue(
      '仍未保存的步骤名',
    );
    await expect(
      page.getByRole('button', { name: '保存修改', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '运行流程', exact: true }),
    ).toBeDisabled();
    await expect(page.locator('.material-row')).toContainText(
      '仅用于同工作重开回归的一条材料',
    );
    await expect(page.locator('.welcome')).toHaveCount(0);
    // The same recent-work item is also a valid re-entry point.
    await page
      .locator('.work-list')
      .getByRole('button', { name: title, exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: title, level: 1, exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('步骤名称', { exact: true })).toHaveValue(
      '仍未保存的步骤名',
    );
    // Discarding local edits restores the saved definition, not the candidate base.
    await page.getByRole('button', { name: '放弃修改', exact: true }).click();
    await expect(page.getByLabel('步骤名称', { exact: true })).toHaveValue(
      '整理材料',
    );
    await expect(
      page.getByRole('button', { name: '保存修改', exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await page
      .locator('.workflow-node')
      .getByText('整理材料', { exact: true })
      .click();
    await expect(page.getByLabel('步骤名称', { exact: true })).toHaveValue(
      '整理材料',
    );
    await expect(
      page.getByRole('button', { name: '放弃修改', exact: true }),
    ).toHaveCount(0);
    // Archiving the currently loaded work must also remove it from recent work.
    await page.getByRole('button', { name: '所有工作', exact: true }).click();
    await library.getByRole('textbox', { name: '搜索标题或目标' }).fill(goal);
    await library.getByRole('button', { name: '搜索', exact: true }).click();
    await library
      .getByRole('button', { name: `归档 ${title}`, exact: true })
      .click();
    await expect(
      page
        .locator('.work-list')
        .getByRole('button', { name: title, exact: true }),
    ).toHaveCount(0);
    await library.getByRole('tab', { name: '已归档', exact: true }).click();
    await library
      .getByRole('button', { name: `恢复 ${title}`, exact: true })
      .click();
    await expect(
      page
        .locator('.work-list')
        .getByRole('button', { name: title, exact: true }),
    ).toBeVisible();
    await testInfo.attach('same-work-reopen', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  } finally {
    await request.post(`/api/works/${work.id}/actions`, {
      data: { action: 'archive', archived: true },
    });
  }
});
