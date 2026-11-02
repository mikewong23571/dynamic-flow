const {chromium,expect}=require('@playwright/test');const fs=require('node:fs');const path=require('node:path');const {createHash}=require('node:crypto');
(async()=>{const b=await chromium.launch({headless:true});const checks=[];try{
 for(const width of [1440,1024]){
 const p=await b.newPage({viewport:{width,height:width===1440?900:768}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4320');await p.getByRole('button',{name:'工作项',exact:true}).click();
 await p.locator('[data-item-id="3a1412fb-937b-4add-a7cd-7f23f94bf05a"] .management-title-button').click();
 let region=p.getByRole('region',{name:'成果检查',exact:true});
 await expect(region.locator('.item-artifact-heading:visible h3')).toBeVisible();
 await region.getByRole('navigation',{name:'处理环节'}).getByRole('button').filter({hasText:'输出业务影响报告'}).click();
 const runId=await region.locator('.run-inspector').getAttribute('data-run-id');
 const resultId=await region.locator('[data-result-id]:visible').getAttribute('data-result-id');
 const output=await region.locator('[data-result-id]:visible .artifact-value').innerText();
 const heading=await region.locator('.item-artifact-heading:visible h3').innerText();
 await p.screenshot({path:path.join(__dirname,`item-${width}.png`)});
 await region.getByRole('button',{name:'在流水线中查看'}).click();
 region=p.getByRole('region',{name:'成果检查',exact:true});
 await expect(region.locator('.run-inspector')).toHaveAttribute('data-run-id',runId);
 await expect(region.locator('[data-result-id]:visible')).toHaveAttribute('data-result-id',resultId);
 await expect(region.locator('.item-artifact-heading:visible h3')).toHaveText(heading);
 expect(await region.locator('[data-result-id]:visible .artifact-value').innerText()).toEqual(output);
 await expect(region.getByRole('button',{name:/^(保留此结果|已保留)$/})).toBeVisible();
 await expect(region.getByRole('button',{name:'从此结果改进',exact:true})).toBeVisible();
 await p.screenshot({path:path.join(__dirname,`method-${width}.png`)});
 await region.getByRole('tab',{name:'输入与依据',exact:true}).click();
 await region.getByRole('button',{name:/上游 · 已形成业务影响记录/}).click();
 await expect(region.locator('.item-artifact-heading:visible h3')).toHaveText('已形成业务影响记录');
 await region.getByRole('button',{name:'返回上一份成果'}).click();
 await expect(region.locator('[data-result-id]:visible')).toHaveAttribute('data-result-id',resultId);
 await p.getByRole('button',{name:'← 返回工作项',exact:true}).click();
 region=p.getByRole('region',{name:'成果检查',exact:true});
 await expect(region.locator('[data-result-id]:visible')).toHaveAttribute('data-result-id',resultId);
 await expect(region.getByRole('button',{name:'补充为证据',exact:true})).toBeVisible();
 const status=await region.locator('.status-label:visible').evaluateAll(es=>es.map(e=>({text:e.textContent,title:e.title,svg:e.querySelectorAll('svg').length,border:getComputedStyle(e).borderWidth,background:getComputedStyle(e).backgroundColor})));
 expect(status.every(s=>s.svg===1&&s.border==='0px')).toBe(true);
 const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);expect(overflow).toBe(false);expect(errors).toEqual([]);
 checks.push({width,runId,resultId,heading,outputHash:createHash('sha256').update(output).digest('hex'),sameOutput:true,sourceReturn:true,businessReturn:true,methodActions:true,businessActions:true,status,errors,overflow});await p.close();
 }
 fs.writeFileSync(path.join(__dirname,'checks.json'),JSON.stringify(checks,null,2));console.log(JSON.stringify(checks.map(({status,...x})=>({...x,statusCount:status.length}))));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
