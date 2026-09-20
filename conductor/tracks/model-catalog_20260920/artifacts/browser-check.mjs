// Model catalog browser evidence against the real evidence server (127.0.0.1:4391, temp data root).
// Verifies real persistence through HTTP APIs; no route mocks, no real provider keys.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:4391';
const dir = 'conductor/tracks/model-catalog_20260920/browser';
const api = async (path, method = 'GET', body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return res.json();
};
const PLACEHOLDER_KEY = 'placeholder-key-not-real';

const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
const noLeak = async () =>
  assert.equal(
    (await p.locator('body').innerText()).includes(PLACEHOLDER_KEY),
    false,
    'placeholder key must never render',
  );

// 1. 模型设置对话框：默认区块 / 管理 / 高级折叠区
await p.goto(base);
await p.getByRole('button', { name: /模型设置/ }).click();
const dialog = p.getByRole('dialog');
await dialog.waitFor();
await dialog.getByText('默认模型').first().waitFor();
await dialog.getByText('自定义端点（高级）').waitFor();
assert.match(await dialog.innerText(), /还没有模型目录/);
await p.screenshot({ path: `${dir}/settings-empty-1440.png` });

// 2. 新增 provider + 两个模型（占位密钥与不可达地址）
await dialog.getByRole('button', { name: '新增 Provider' }).click();
await dialog.getByRole('textbox', { name: 'Provider 名称' }).fill('evidence');
await dialog.getByLabel('协议类型').selectOption('openai');
await dialog
  .getByRole('textbox', { name: '服务地址' })
  .fill('http://127.0.0.1:9/v1');
await dialog.getByRole('textbox', { name: 'API 密钥' }).fill(PLACEHOLDER_KEY);
await dialog.getByRole('button', { name: '添加', exact: true }).click();
await dialog.getByRole('textbox', { name: '请求头名称 1' }).fill('X-Evidence');
await dialog.getByRole('textbox', { name: '请求头内容 1' }).fill('1');
await dialog.getByRole('textbox', { name: '模型别名 1' }).fill('evidence/glm-a');
await dialog.getByRole('textbox', { name: '模型 ID 1' }).fill('glm-a');
await dialog.getByRole('textbox', { name: '显示名 1' }).fill('证据模型A');
await dialog.getByRole('button', { name: '新增模型' }).click();
await dialog.getByRole('textbox', { name: '模型别名 2' }).fill('evidence/glm-b');
await dialog.getByRole('textbox', { name: '模型 ID 2' }).fill('glm-b');
await dialog.getByRole('textbox', { name: '显示名 2' }).fill('证据模型B');
await dialog.getByLabel('默认强度 2').selectOption('high');
await p.screenshot({ path: `${dir}/provider-editor-1440.png` });
const saved = p.waitForResponse(
  (r) => r.url().includes('/api/config/catalog') && r.request().method() === 'PUT',
);
await dialog.getByRole('button', { name: '保存目录' }).click();
assert.equal((await saved).status(), 200);
await dialog
  .getByRole('button', { name: '保存目录' })
  .waitFor({ state: 'detached' });
await dialog.getByText('密钥已配置').waitFor();
await dialog.getByText('自定义请求头').waitFor();
assert.match(await dialog.innerText(), /证据模型A[\s\S]*证据模型B/);
await noLeak();
await p.screenshot({ path: `${dir}/catalog-saved-1440.png` });

// 3. 默认模型区块
await dialog.getByLabel('默认模型').selectOption('evidence/glm-a');
await dialog.getByLabel('默认推理强度').selectOption('low');
await dialog.getByRole('button', { name: '保存默认' }).click();
await dialog.getByText('默认模型已保存').waitFor();
assert.match(await dialog.innerText(), /当前生效：\s*模型目录/);

// 4. 测试连接：不可达端点如实失败且脱敏
await dialog.getByRole('button', { name: '测试 evidence/glm-a' }).click();
await dialog.getByText('测试中…').waitFor();
const modelRow = dialog
  .locator('.catalog-model', { hasText: 'evidence/glm-a' });
await modelRow.locator('.error-text').waitFor({ timeout: 120000 });
const failureText = await modelRow.locator('.error-text').innerText();
assert.ok(failureText.length > 0, 'failure reason must be shown');
await noLeak();
await p.screenshot({ path: `${dir}/test-failure-1440.png` });

// 5. 自定义端点（高级）折叠区：G1 表单仍在
await dialog.getByText('自定义端点（高级）').click();
await dialog.getByRole('textbox', { name: 'API 密钥' }).waitFor();
await p.screenshot({ path: `${dir}/manual-advanced-1440.png` });
await p.setViewportSize({ width: 1024, height: 768 });
await p.screenshot({ path: `${dir}/settings-1024.png` });
assert.equal(
  await p.evaluate(() => document.body.scrollWidth > innerWidth),
  false,
  'no horizontal overflow at 1024',
);
await p.setViewportSize({ width: 1440, height: 900 });
await p.keyboard.press('Escape');

// 服务端目录与默认已落盘且无密钥外泄
const config = await api('/api/config');
assert.equal(config.catalog.length, 2);
assert.equal(config.catalogProviders[0].headersConfigured, true);
assert.deepEqual(config.defaultSelection, { alias: 'evidence/glm-a', effort: 'low' });
assert.equal(JSON.stringify(config).includes(PLACEHOLDER_KEY), false);

// 6. 两个 Work 的对话覆盖互不影响（创建工作后 Assistant 面板已打开）
await p.getByRole('button', { name: '新建流水线' }).first().click();
await p.getByLabel('工作目标').fill('证据工作甲：验证模型覆盖');
await p.getByLabel(/材料 · 每行一条/).fill('第一条材料\n第二条材料');
await p.getByRole('button', { name: '创建工作' }).click();
const selector = p.getByRole('combobox', { name: '本工作的模型' });
await selector.waitFor();
assert.match(await selector.innerText(), /跟随默认：证据模型A/);
const selectionPost = () =>
  p.waitForResponse(
    (r) =>
      r.url().includes('/model-selection') && r.request().method() === 'POST',
  );
let posted = selectionPost();
await selector.click();
await p.getByRole('option', { name: /^证据模型B/ }).click();
assert.equal((await posted).status(), 200);
posted = selectionPost();
await selector.click();
await p.getByRole('radio', { name: '较低' }).click();
assert.equal((await posted).status(), 200);
await p.keyboard.press('Escape');
await p.screenshot({ path: `${dir}/composer-override-1440.png` });
const works1 = await api('/api/works?page=1&pageSize=20');
const workA = works1.works[0].id;
const snapshotA = await api(`/api/works/${workA}`);
assert.deepEqual(snapshotA.work.modelSelections, {
  assistant: { alias: 'evidence/glm-b', effort: 'low' },
});

// 第二个 Work 选择不同模型
await p.goto(base); // 回到工作区，经侧栏新建第二个工作
await p.getByRole('button', { name: '新建流水线' }).first().click();
await p.getByLabel('工作目标').fill('证据工作乙：验证互不影响');
await p.getByLabel(/材料 · 每行一条/).fill('另一条材料');
await p.getByRole('button', { name: '创建工作' }).click();
const selectorB = p.getByRole('combobox', { name: '本工作的模型' });
await selectorB.waitFor();
posted = selectionPost();
await selectorB.click();
await p.getByRole('option', { name: /^证据模型A/ }).click();
assert.equal((await posted).status(), 200);
const works2 = await api('/api/works?page=1&pageSize=20');
const workB = works2.works.find((w) => w.id !== workA).id;
const snapshotB = await api(`/api/works/${workB}`);
assert.deepEqual(snapshotB.work.modelSelections, {
  assistant: { alias: 'evidence/glm-a', effort: 'medium' },
});
const againA = await api(`/api/works/${workA}`);
assert.deepEqual(againA.work.modelSelections, {
  assistant: { alias: 'evidence/glm-b', effort: 'low' },
});

// 7. 切回「跟随默认」清除覆盖
posted = selectionPost();
await selectorB.click();
await p.getByRole('option', { name: /跟随默认/ }).click();
assert.equal((await posted).status(), 200);
await p.screenshot({ path: `${dir}/composer-follow-default-1440.png` });
const clearedB = await api(`/api/works/${workB}`);
assert.equal(clearedB.work.modelSelections, undefined);
assert.match(await selectorB.innerText(), /跟随默认：证据模型A/);
await p.setViewportSize({ width: 1024, height: 768 });
await p.screenshot({ path: `${dir}/composer-1024.png` });

assert.deepEqual(errors, []);
await noLeak();
console.log(
  'PASS: catalog CRUD, default selection, honest test failure (sanitized), composer override/follow-default, two-work independence, no key leak, no page errors',
);
await b.close();
