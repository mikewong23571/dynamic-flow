import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { candidateMethod } from './src/fixtures';

const evidence = (name: string) =>
  fileURLToPath(new URL(`./evidence/${name}.png`, import.meta.url));

test('workspace selection, tree/graph, resize, keyboard and narrow desktop', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('checkbox', { name: '选择 s3', exact: true }),
  ).toBeChecked();
  await page.getByRole('checkbox', { name: '选择 s1', exact: true }).click();
  await page.getByRole('button', { name: '置信度' }).click();
  await expect(
    page.getByRole('checkbox', { name: '选择 s1', exact: true }),
  ).toBeChecked();
  await expect(page.getByTestId('row-s4')).toBeVisible();
  const orderedIds = await page
    .locator('tbody tr')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-testid')));
  expect(orderedIds[0]).toBe('row-s4');
  await page.getByRole('textbox', { name: '筛选样本' }).fill('feature');
  await expect(page.getByTestId('row-s1')).toHaveCount(0);
  await expect(page.getByText('2 / 6 已选')).toBeVisible();
  await page.getByRole('textbox', { name: '筛选样本' }).fill('');
  await expect(
    page.getByRole('checkbox', { name: '选择 s1', exact: true }),
  ).toBeChecked();
  await page
    .getByRole('button', { name: '希望支持导出 CSV', exact: true })
    .click();
  await expect(page.getByTestId('inspector-title')).toHaveText(
    '希望支持导出 CSV',
  );
  await expect(
    page.getByRole('checkbox', { name: '选择 s2', exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole('treeitem')
    .filter({ hasText: '读取样本' })
    .last()
    .click();
  await expect(page.getByTestId('selected-node')).toHaveText('read');
  await page.getByRole('button', { name: '图视图' }).click();
  await page
    .locator('.react-flow__node')
    .filter({ hasText: '检查结果' })
    .click();
  await expect(page.getByTestId('selected-node')).toHaveText('review');
  await page.screenshot({ path: evidence('graph'), fullPage: true });
  await page.getByRole('button', { name: '树视图' }).click();
  await expect(
    page.getByRole('treeitem').filter({ hasText: '检查结果' }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('treeitem').filter({ hasText: '检查结果' }).click();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('selected-node')).toHaveText('classify');
  const separator = page.getByRole('separator', { name: '调整 Work Map 宽度' });
  const initial = await separator.boundingBox();
  await page.mouse.move(initial!.x + 2, initial!.y + 100);
  await page.mouse.down();
  await page.mouse.move(initial!.x + 65, initial!.y + 100, { steps: 8 });
  await page.mouse.up();
  const resized = await separator.boundingBox();
  expect(resized!.x).toBeGreaterThan(initial!.x + 30);
  await page.screenshot({ path: evidence('workspace'), fullPage: true });
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(page.getByTestId('inspector-title')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: evidence('workspace-1024'), fullPage: true });
  expect(errors).toEqual([]);
});

test('Monaco local workers, edits persist, diff and separate adoption decisions', async ({
  page,
}) => {
  const errors: string[] = [];
  const workers: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('worker', (worker) => workers.push(worker.url()));
  await page.goto('/');
  await expect(page.locator('.monaco-editor')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Method 与比较' }).click();
  const editor = page.locator('.monaco-editor').first();
  await expect(editor).toBeVisible();
  const textbox = editor.getByRole('textbox');
  await textbox.focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(candidateMethod + '\n// browser edit');
  await page.getByRole('button', { name: '运行 fixture 比较' }).click();
  await page.getByRole('button', { name: '保留示例产物' }).click();
  await expect(page.getByTestId('method-state')).toHaveText(
    'Method 未采用 · 产物已保留',
  );
  await page.getByRole('button', { name: '代码 Diff', exact: true }).click();
  await expect(page.locator('.monaco-diff-editor')).toBeVisible();
  await expect(
    page.locator('.monaco-diff-editor .char-insert').first(),
  ).toBeVisible();
  await page.screenshot({ path: evidence('code-diff'), fullPage: true });
  await page.getByRole('button', { name: '采用候选 Method' }).click();
  await expect(page.getByTestId('method-state')).toHaveText(
    'Method 已采用 · 产物已保留',
  );
  await page.getByRole('button', { name: '编辑 Method' }).click();
  await page.getByRole('tab', { name: '工作区', exact: true }).click();
  await page.getByRole('tab', { name: 'Method 与比较' }).click();
  await expect(page.locator('.view-lines')).toContainText('browser edit');
  await page.locator('.monaco-editor').first().getByRole('textbox').focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(
    candidateMethod + '\nconst broken: number = "wrong";',
  );
  await expect(page.locator('.squiggly-error').first()).toBeVisible({
    timeout: 10000,
  });
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(candidateMethod + '\n// browser edit');
  await expect(page.locator('.squiggly-error')).toHaveCount(0);
  await page.setViewportSize({ width: 1024, height: 900 });
  const rect = await page.locator('.monaco-editor').first().boundingBox();
  expect(rect!.width).toBeLessThan(1024);
  await page.locator('.monaco-editor').first().getByRole('textbox').focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(
    candidateMethod + '\n// changed after compare',
  );
  await expect(
    page.getByRole('button', { name: '采用候选 Method' }),
  ).toBeDisabled();
  await expect(page.getByText('草稿已变化 · 需重新比较')).toBeVisible();
  await expect.poll(() => workers.length).toBeGreaterThan(0);
  expect(
    workers.every(
      (url) =>
        url.startsWith('http://127.0.0.1:4317/') ||
        url.startsWith('blob:http://127.0.0.1:4317/'),
    ),
  ).toBe(true);
  await page.screenshot({ path: evidence('code-edit'), fullPage: true });
  expect(errors).toEqual([]);
});

test('assistant-ui real Pi stream, frozen selection, cancellation and transport error', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Assistant', exact: true }).click();
  await page.getByRole('textbox', { name: '消息' }).fill('检查所选样本');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByTestId('chat-status')).toHaveText('生成中');
  await page.getByRole('tab', { name: '工作区', exact: true }).click();
  await page.getByRole('checkbox', { name: '选择 s1', exact: true }).click();
  await page.getByRole('tab', { name: 'Assistant', exact: true }).click();
  await expect(page.getByTestId('frozen-selection')).toHaveText('s3');
  await expect(page.getByTestId('chat-status')).toHaveText('完成', {
    timeout: 15000,
  });
  await expect(page.locator('.tool-result')).toContainText(
    'inspect_sample · s3',
  );
  await expect(page.locator('.assistant-message')).toContainText('已读取样本');
  await page.screenshot({ path: evidence('chat-complete'), fullPage: true });
  await page.getByRole('textbox', { name: '消息' }).fill('再检查一次');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByTestId('chat-status')).toHaveText('生成中');
  await page.getByRole('button', { name: '停止生成' }).click();
  await expect(page.getByTestId('chat-status')).toHaveText(
    '已取消 · Pi 已停止',
  );
  await expect
    .poll(async () => (await (await request.get('/api/health')).json()).active)
    .toBe(0);
  await expect(page.getByTestId('frozen-selection')).toHaveText('s1, s3');
  await page.screenshot({ path: evidence('chat-cancelled'), fullPage: true });
  await page.route('**/api/chat/*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.continue();
  });
  await page.getByRole('textbox', { name: '消息' }).fill('连接过程中取消');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.getByRole('button', { name: '停止生成' }).click();
  await expect(page.getByTestId('chat-status')).toHaveText(
    '已取消 · Pi 已停止',
  );
  await page.unroute('**/api/chat/*');
  await page.route('**/api/chat/*', (route) =>
    route.fulfill({ status: 503, body: 'Fixture failure' }),
  );
  await page.getByRole('textbox', { name: '消息' }).fill('检查失败状态');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByTestId('chat-status')).toHaveText('Error: HTTP 503');
  await expect(
    page.getByRole('button', { name: '发送', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
