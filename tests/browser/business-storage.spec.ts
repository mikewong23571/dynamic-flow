import { test, expect } from './fixtures';

test('retired business drafts are cleared once before restore; display preferences and new drafts survive', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('storage-test-seeded')) return;
    localStorage.setItem('storage-test-seeded', 'true');
    localStorage.setItem('dynamic-flow.goal', '旧业务目标');
    localStorage.setItem('dynamic-flow.materials', '旧材料');
    localStorage.setItem(
      'dynamic-flow.context.old',
      JSON.stringify({ pendingDraft: { definition: { mode: 'each' } } }),
    );
    localStorage.setItem('dynamic-flow.panel-width', '420');
    localStorage.setItem('unrelated-user-key', 'keep');
    sessionStorage.setItem(
      'flowcraft.item-conversations.old',
      JSON.stringify({ drafts: { main: '旧对话草稿' } }),
    );
  });
  await page.goto('/');
  await expect(page.getByRole('region', { name: '开始一件事' })).toBeVisible();
  expect(
    await page.evaluate(() => ({
      goal: localStorage.getItem('dynamic-flow.goal'),
      materials: localStorage.getItem('dynamic-flow.materials'),
      context: localStorage.getItem('dynamic-flow.context.old'),
      conversation: sessionStorage.getItem('flowcraft.item-conversations.old'),
      width: localStorage.getItem('dynamic-flow.panel-width'),
      other: localStorage.getItem('unrelated-user-key'),
    })),
  ).toMatchObject({
    context: null,
    conversation: null,
    width: '420',
    other: 'keep',
  });
  expect(
    await page.evaluate(() => localStorage.getItem('dynamic-flow.goal')),
  ).not.toBe('旧业务目标');
  expect(
    await page.evaluate(() => localStorage.getItem('dynamic-flow.materials')),
  ).not.toBe('旧材料');
  await page.evaluate(() => {
    localStorage.setItem('dynamic-flow.context.current', 'new-draft');
    sessionStorage.setItem(
      'flowcraft.item-conversations.current',
      'new-conversation-draft',
    );
  });
  await page.reload();
  await expect(page.getByRole('region', { name: '开始一件事' })).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem('dynamic-flow.context.current'),
    ),
  ).toBe('new-draft');
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('flowcraft.item-conversations.current'),
    ),
  ).toBe('new-conversation-draft');
});
