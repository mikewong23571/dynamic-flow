// Browser form fixture: verifies client behavior, not provider compatibility or disk persistence.
// 目录（models.toml）是唯一配置来源：默认模型区块提交 PUT /api/config/default；目录管理持久化由 track 的 browser-check 覆盖。
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
let config={ready:true,catalog:[{alias:'acme/sonnet',provider:'acme',model:'claude-sonnet-4-5',displayName:'Sonnet',protocol:'anthropic-messages',baseUrl:'https://acme.example.com',contextWindow:200000,supportedEfforts:['low','high'],defaultEffort:'high',apiKeyConfigured:true}],catalogProviders:[{name:'acme',protocol:'anthropic-messages',baseUrl:'https://acme.example.com',apiKeyConfigured:true,headersConfigured:false}],defaultSelection:null,resolved:{default:'catalog'}};const sent=[];
const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(String(e)));
await p.route('**/api/config/default',route=>{const body=route.request().postDataJSON();sent.push(body);config={...config,defaultSelection:body.selection};return route.fulfill({json:config});});
await p.route('**/api/config',route=>route.fulfill({json:config}));
await p.goto(process.env.APP_URL ?? 'http://127.0.0.1:4320');await p.getByRole('button',{name:/模型设置/}).click();const dialog=p.getByRole('dialog');await dialog.waitFor();
assert.equal(await dialog.getByText('自定义端点').count(),0);
await dialog.getByRole('combobox',{name:'默认模型'}).selectOption('acme/sonnet');
await dialog.getByText('已保存',{exact:true}).waitFor();
assert.deepEqual(sent[0],{selection:{alias:'acme/sonnet',effort:'high'}});
await dialog.getByRole('combobox',{name:'默认推理强度'}).selectOption('low');
await p.waitForResponse(r=>r.url().endsWith('/api/config/default')&&r.request().method()==='PUT');
assert.deepEqual(sent[1],{selection:{alias:'acme/sonnet',effort:'low'}});
assert.equal((await p.locator('body').innerText()).includes('acme-secret'),false);
await dialog.getByRole('button',{name:'新增 Provider'}).click();await dialog.getByRole('textbox',{name:'Provider 名称'}).waitFor();
await p.screenshot({path:'src/client/evidence/model-settings-1440.png'});await p.setViewportSize({width:1024,height:768});await p.screenshot({path:'src/client/evidence/model-settings-1024.png'});assert.equal(await p.evaluate(()=>document.body.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);console.log('PASS: default model section submits selection without secrets, no custom endpoint form, provider editor opens, no page errors');await b.close();
