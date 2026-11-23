const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs');const path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true});const samples=[];
try {for(let repeat=1;repeat<=3;repeat++){
 const p=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4320');await p.getByRole('button',{name:'全部流水线',exact:true}).click();await p.locator('.management-title-button:visible').filter({hasText:'业务影响分析'}).click();await p.locator('.react-flow__node').first().waitFor();const origin=await p.evaluate(()=>performance.timeOrigin);const measurements=[];
 const overview=p.getByRole('region',{name:'流水线运行结果总览'});const artifact=p.getByRole('region',{name:'成果详情',exact:true});
 async function measure(target,action,ready){const start=Date.now();await action();await ready();await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));measurements.push({target,ms:Date.now()-start});}
 await measure('tab_to_business_overview',()=>p.getByRole('tab',{name:/^运行结果/}).click(),()=>expect(overview.getByText('未结项',{exact:true})).toBeVisible());
 await measure('expand_history',()=>overview.locator('.result-group-title').click(),()=>expect(overview.getByRole('table',{name:/的运行历史/})).toBeVisible());
 await measure('history_to_artifact',()=>overview.getByRole('button',{name:'输出业务影响报告',exact:true}).click(),()=>expect(artifact.getByRole('heading',{name:'输出业务影响报告',exact:true})).toBeVisible());
 await measure('artifact_to_process',()=>artifact.getByRole('button',{name:'查看过程',exact:true}).click(),()=>expect(p.locator('.run-inspector:visible [data-result-id]:visible')).toHaveAttribute('data-result-id','1e5477b1-4c57-4964-9591-90609b59d6a6'));
 await measure('process_to_artifact',()=>p.getByRole('button',{name:'返回原成果',exact:true}).click(),()=>expect(artifact).toBeVisible());
 await measure('artifact_to_overview',()=>p.getByRole('button',{name:'返回工作项列表',exact:true}).click(),()=>expect(overview).toBeVisible());
 expect(await p.evaluate(()=>performance.timeOrigin)).toBe(origin);expect(errors).toEqual([]);samples.push({repeat,time:new Date().toISOString(),width:1440,measurements,errors});await p.close();
 }fs.writeFileSync(path.join(__dirname,'final-performance.json'),JSON.stringify(samples,null,2));console.log(JSON.stringify(samples));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
