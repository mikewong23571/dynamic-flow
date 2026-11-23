const { chromium, expect }=require('@playwright/test');
const fs=require('node:fs');const path=require('node:path');
const prefix=process.argv[2]||'measurement';
(async()=>{const browser=await chromium.launch({headless:true});try{
 for(let repeat=1;repeat<=3;repeat++){
 const p=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{window.measuredTasks=[];new PerformanceObserver(list=>window.measuredTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({entryTypes:['longtask']});});
 await p.goto('http://127.0.0.1:4320');const timeOrigin=await p.evaluate(()=>performance.timeOrigin);await p.getByRole('button',{name:'全部流水线',exact:true}).click();
 await p.locator('.management-title-button:visible').filter({hasText:'业务影响分析'}).click();
 await p.locator('.react-flow__node').first().waitFor();
 const tabs=p.getByRole('tablist',{name:'工作内容'});const measurements=[];
 for(const target of ['results','compare','canvas','results','canvas','compare']){
 const name={results:/^运行结果/,compare:/^比较/,canvas:'流程'}[target];
 const start=Date.now();await tabs.getByRole('tab',{name,exact:typeof name==='string'}).click({timeout:90000});
 await expect(tabs.getByRole('tab',{name,exact:typeof name==='string'})).toHaveAttribute('aria-selected','true',{timeout:90000});
 await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const ms=Date.now()-start;
 const observation=await p.evaluate(()=>({dom:document.querySelectorAll('*').length,prose:document.querySelectorAll('.prose').length,longTasks:window.measuredTasks.splice(0)}));
 measurements.push({target,ms,...observation});console.log(prefix,repeat,target,ms,'ms',observation.dom,'DOM');
 if(repeat===1&&measurements.length===1)await p.screenshot({path:path.join(__dirname,`${prefix}-results.png`)});
 }
 expect(await p.evaluate(()=>performance.timeOrigin)).toBe(timeOrigin);
 fs.writeFileSync(path.join(__dirname,`${prefix}-${repeat}.json`),JSON.stringify({timeOrigin,date:new Date().toISOString(),work:'5cb210fc-f700-43bd-9946-736d869db90b',width:1440,errors,measurements},null,2));await p.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
