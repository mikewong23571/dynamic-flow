const { chromium, expect }=require('@playwright/test');
const fs=require('node:fs');const path=require('node:path');
(async()=>{const b=await chromium.launch({headless:true});const results=[];try{
 for(const width of [1440,1024]){
 const p=await b.newPage({viewport:{width,height:width===1440?900:768}});
 await p.goto('http://127.0.0.1:4320');await p.getByRole('button',{name:'工作项',exact:true}).click();
 await p.locator('[data-item-id="3a1412fb-937b-4add-a7cd-7f23f94bf05a"] .management-title-button').click();
 await expect(p.getByRole('region',{name:'成果检查',exact:true}).getByRole('heading',{level:3})).toBeVisible();
 const overview=p.locator('.item-workspace-overview');
 const next=overview.locator('.item-progress-disclosure').filter({hasText:'下一步'});
 await expect(next).toBeVisible();
 const preview=await next.locator('summary > span').last().evaluate(e=>({height:e.clientHeight,width:e.clientWidth,lineHeight:getComputedStyle(e).lineHeight,whiteSpace:getComputedStyle(e).whiteSpace,textLength:e.textContent.length}));
 await next.locator('summary').click();await expect(next).toHaveAttribute('open','');
 const expanded=await next.locator('summary > span').last().evaluate(e=>({height:e.clientHeight,scrollHeight:e.scrollHeight,display:getComputedStyle(e).display}));
 expect(expanded.height).toBeGreaterThanOrEqual(preview.height);
 const report=overview.locator('.item-latest-report');
 await report.locator('summary').click();await expect(report.locator('p')).toBeVisible();
 await expect(report.getByRole('button',{name:'检查报告所在环节 ↗'})).toBeVisible();
 const reportLayout=await report.locator('p').evaluate(e=>({width:e.clientWidth,height:e.clientHeight,fontSize:getComputedStyle(e).fontSize,textLength:e.textContent.length,whiteSpace:getComputedStyle(e).whiteSpace}));
 await p.screenshot({path:path.join(__dirname,`progress-expanded-${width}.png`)});
 await report.locator('summary').click();
 const goal=overview.locator('.item-goal-details');await goal.locator('summary').click();await expect(goal.locator('p')).toBeVisible();
 await expect(goal.getByRole('button',{name:'更换处理方法'})).toBeVisible();
 await goal.locator('summary').click();await next.locator('summary').click();
 expect(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 results.push({width,preview,expanded,reportLayout,reportSourceVisible:true,goalAccessible:true});await p.close();
 }
 fs.writeFileSync(path.join(__dirname,'progress-check.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
