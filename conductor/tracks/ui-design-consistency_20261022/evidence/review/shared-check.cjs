const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const results=[];
 try{
 for(const width of [1440,1024]){
  const page=await browser.newPage({viewport:{width,height:width===1440?900:768}});
  const errors=[], blockedWrites=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
    if(!['GET','HEAD'].includes(route.request().method())){
      blockedWrites.push({method:route.request().method(),path:new URL(route.request().url()).pathname});
      await route.abort();
    }else await route.continue();
  });
  await page.goto('http://127.0.0.1:4320');
  await page.getByRole('button',{name:'工作项',exact:true}).click();
  const search=page.getByRole('textbox',{name:'搜索工作项'});
  await search.fill('CVE-2025-27516');await search.press('Enter');
  await expect(page.locator('.items-table tbody tr')).toHaveCount(1);
  await page.getByRole('combobox',{name:'工作项状态'}).selectOption('completed');
  await expect(page.locator('.items-table tbody tr')).toHaveCount(0);
  await page.getByRole('combobox',{name:'工作项状态'}).selectOption('');
  await expect(page.locator('.items-table tbody tr')).toHaveCount(1);
  const create=page.getByRole('button',{name:'新建工作项',exact:true});
  await create.click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox',{name:'业务编号',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('textbox',{name:'标题',exact:true})).toBeFocused();
  await page.screenshot({path:path.join(__dirname,`shared-dialog-${width}.png`)});
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:'全部流水线',exact:true}).click();
  const flowSearch=page.getByRole('textbox',{name:'搜索标题或目标'});
  await flowSearch.fill('业务影响分析');await flowSearch.press('Enter');
  await expect(page.locator('.management-title-button:visible')).toHaveCount(1);
  const menu=page.getByRole('button',{name:/更多操作/}).first();
  await menu.press('Enter');await expect(page.getByRole('menuitem',{name:'重命名',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(menu).toBeFocused();
  await page.locator('.management-title-button:visible').click();
  await page.locator('.react-flow__node').filter({hasText:'固定材料与业务范围'}).click();
  await page.getByRole('button',{name:'步骤配置',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'步骤名称',exact:true})).toHaveValue('固定材料与业务范围');
  await page.screenshot({path:path.join(__dirname,`shared-inspector-${width}.png`)});
  await page.getByRole('button',{name:'Assistant',exact:true}).click();
  const composer=page.getByRole('textbox',{name:'对话修改'});
  await composer.fill('设计验收：保留此本地输入，不发送。');
  await page.getByRole('button',{name:'步骤配置',exact:true}).click();
  await page.getByRole('button',{name:'Assistant',exact:true}).click();
  await expect(composer).toHaveValue('设计验收：保留此本地输入，不发送。');
  await page.screenshot({path:path.join(__dirname,`shared-assistant-${width}.png`)});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  expect(overflow).toBe(false);expect(errors).toEqual([]);expect(blockedWrites).toEqual([]);
  results.push({width,search:true,statusFilter:true,dialogFocus:true,menuKeyboard:true,nodeConfiguration:true,assistantDraft:true,overflow,errors,blockedWrites});
  await page.close();
 }
 fs.writeFileSync(path.join(__dirname,'shared-check.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
