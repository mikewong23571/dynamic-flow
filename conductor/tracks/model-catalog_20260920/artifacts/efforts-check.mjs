// effort 勾选复查：7 档勾选、off 可选、全不选=不设置、折叠卡片、默认跟随。
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const out = process.env.OUT_DIR;
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto('http://127.0.0.1:4391/');
await p.getByRole('button', { name: /模型设置/ }).click();
const dialog = p.getByRole('dialog');
await dialog.waitFor();
await dialog.getByRole('button', { name: '新增 Provider' }).click();
await dialog.getByRole('textbox', { name: 'Provider 名称' }).fill('acme');
await dialog.getByRole('textbox', { name: '服务地址' }).fill('https://api.example.com/v1');
await dialog.getByRole('textbox', { name: 'API 密钥' }).fill('sk-placeholder-0123456789');
// 模型 1：取消 max、改勾 xhigh，另勾 off（允许运行时关思考）
await dialog.getByRole('textbox', { name: '模型别名 1' }).fill('acme/gpt');
await dialog.getByRole('textbox', { name: '模型 ID 1' }).fill('gpt-5.6-sol');
await dialog.getByRole('checkbox', { name: 'max 1', exact: true }).uncheck();
await dialog.getByRole('checkbox', { name: 'xhigh 1', exact: true }).check();
await dialog.getByRole('checkbox', { name: 'off 1', exact: true }).check();
assert.equal(await dialog.getByRole('combobox', { name: 'Default effort 1' }).inputValue(), 'medium');
await dialog.getByRole('combobox', { name: 'Default effort 1' }).selectOption('xhigh');
await p.screenshot({ path: `${out}/r9-efforts-1440.png` });
// 模型 2：全部取消 = 不设置
await dialog.getByRole('button', { name: '新增模型' }).click();
await dialog.getByRole('textbox', { name: '模型别名 2' }).fill('acme/plain');
await dialog.getByRole('textbox', { name: '模型 ID 2' }).fill('plain-chat');
for (const e of ['low', 'medium', 'high', 'max'])
  await dialog.getByRole('checkbox', { name: `${e} 2`, exact: true }).uncheck();
assert.equal(await dialog.getByRole('combobox', { name: 'Default effort 2' }).isDisabled(), true);
await p.screenshot({ path: `${out}/r10-two-models-1440.png` });
await dialog.getByRole('button', { name: '保存目录' }).click();
await dialog.locator('.catalog-model').nth(1).waitFor();
// 重新编辑：默认折叠；展开后勾选保持
await dialog.getByRole('button', { name: '编辑' }).click();
assert.equal(await dialog.getByRole('textbox', { name: '模型别名 1' }).count(), 0);
await p.screenshot({ path: `${out}/r11-collapsed-1440.png` });
await dialog.getByRole('button', { name: '切换模型展开 1' }).click();
assert.equal(await dialog.getByRole('checkbox', { name: 'xhigh 1', exact: true }).isChecked(), true);
assert.equal(await dialog.getByRole('checkbox', { name: 'off 1', exact: true }).isChecked(), true);
assert.equal(await dialog.getByRole('checkbox', { name: 'max 1', exact: true }).isChecked(), false);
assert.equal(await dialog.getByRole('combobox', { name: 'Default effort 1' }).inputValue(), 'xhigh');
await p.screenshot({ path: `${out}/r12-expanded-1440.png` });
if (errors.length) throw new Error(errors.join(';'));
console.log('EFFORTS_OK');
await b.close();
