const {chromium,expect}=require('@playwright/test');const fs=require('node:fs');const path=require('node:path');
(async()=>{const work='5cb210fc-f700-43bd-9946-736d869db90b';const data=await(await fetch(`http://127.0.0.1:4321/api/works/${work}`)).json();const run=data.work.runs.find(r=>r.id==='5732dd2e-ef01-489a-94ed-39f6dc581b1d');const problem=data.definitions[run.definitionId].problem;const b=await chromium.launch({headless:true});const checks=[];try{
 for(const width of [1440,1024]){
 const p=await b.newPage({viewport:{width,height:width===1440?900:768}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4320');await p.getByRole('button',{name:'工作项',exact:true}).click();await p.locator('[data-item-id="3a1412fb-937b-4add-a7cd-7f23f94bf05a"] .management-title-button').click();
 let region=p.getByRole('region',{name:'成果检查',exact:true});await expect(region.locator('.item-artifact-heading:visible h3')).toBeVisible();
 for(const entrance of ['item','method']){
 if(entrance==='method'){await region.getByRole('button',{name:'在流水线中查看'}).click();region=p.getByRole('region',{name:'成果检查',exact:true});await expect(region.locator('.item-artifact-heading:visible h3')).toBeVisible();}
 await expect(p.getByText('本次固定的问题认知',{exact:true})).toHaveCount(0);
 await expect(region.getByRole('button',{name:'运行依据',exact:true})).not.toBeVisible();
 await expect(p.getByRole('dialog',{name:'运行依据',exact:true})).toHaveCount(0);
 await p.screenshot({path:path.join(__dirname,`${entrance}-main-${width}.png`)});
 await region.getByRole('tab',{name:'输入与依据',exact:true}).click();
 await region.getByRole('button',{name:'运行依据',exact:true}).click();
 const dialog=p.getByRole('dialog',{name:'运行依据',exact:true});await expect(dialog).toBeVisible();
 for(const value of Object.values(problem).filter(Boolean))await expect(dialog).toContainText(value);
 await p.screenshot({path:path.join(__dirname,`${entrance}-basis-${width}.png`)});
 await p.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await region.getByRole('tab',{name:/^产物/}).click();
 }
 const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);expect(overflow).toBe(false);expect(errors).toEqual([]);
 checks.push({width,mainExplanationRemoved:true,basisDeferred:true,frozenFieldsMatched:Object.values(problem).filter(Boolean).length,bothEntrances:true,errors,overflow});await p.close();
 }
 fs.writeFileSync(path.join(__dirname,'checks.json'),JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
