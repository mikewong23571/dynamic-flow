// 排版自查截图 v2：空态 → 就地展开编辑器（长值） → 目录卡片 → 默认模型即存 → 删除确认 → 1024。
import { chromium } from '@playwright/test';
const out = process.env.OUT_DIR;
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto('http://127.0.0.1:4391/');
await p.getByRole('button', { name: /模型设置/ }).click();
const dialog = p.getByRole('dialog');
await dialog.waitFor();
await p.screenshot({ path: `${out}/r1-empty-1440.png` });
// 就地展开编辑器：长 base_url 与长密钥检验整行显示
await dialog.getByRole('button', { name: '新增 Provider' }).click();
await dialog.getByRole('textbox', { name: 'Provider 名称' }).fill('acme');
await dialog.getByRole('textbox', { name: '服务地址' }).fill('https://api-very-long-hostname.example-enterprise.com/anthropic/v1');
await dialog.getByRole('textbox', { name: 'API 密钥' }).fill('sk-placeholder-0123456789abcdef-0123456789abcdef');
await dialog.getByRole('textbox', { name: '模型别名 1' }).fill('acme/sonnet');
await dialog.getByRole('textbox', { name: '模型 ID 1' }).fill('claude-sonnet-4-5-20250929');
await dialog.getByRole('textbox', { name: '显示名 1' }).fill('Sonnet 4.5');
await dialog.getByRole('button', { name: '添加' }).click();
await dialog.getByRole('textbox', { name: '请求头名称 1' }).fill('X-Org-Route');
await p.screenshot({ path: `${out}/r2-editor-1440.png` });
await dialog.getByRole('button', { name: '保存目录' }).click();
await dialog.locator('.catalog-model').waitFor();
await p.screenshot({ path: `${out}/r3-catalog-1440.png` });
// 默认模型改完即存
await dialog.getByRole('combobox', { name: '默认模型' }).selectOption('acme/sonnet');
await dialog.getByText('已保存', { exact: true }).waitFor();
await dialog.getByRole('combobox', { name: '默认推理强度' }).selectOption('low');
await dialog.getByText('已保存', { exact: true }).waitFor();
await p.screenshot({ path: `${out}/r4-default-1440.png` });
// 删除两步确认
await dialog.getByRole('button', { name: '删除' }).first().click();
await p.screenshot({ path: `${out}/r5-confirm-1440.png` });
// 1024 编辑器
await dialog.getByRole('button', { name: '编辑' }).click();
await p.setViewportSize({ width: 1024, height: 768 });
await p.screenshot({ path: `${out}/r6-editor-1024.png` });
if (errors.length) throw new Error(errors.join(';'));
console.log('SHOTS_OK');
await b.close();
