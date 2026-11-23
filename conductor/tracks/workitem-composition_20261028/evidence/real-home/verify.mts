import { createRequire } from 'node:module';
import { mkdtemp, copyFile, chmod, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createApplication } from '/home/mike/projs/fork/dynamic-flow-workitem-composition/src/server/index.ts';
import type { Definition } from '/home/mike/projs/fork/dynamic-flow-workitem-composition/src/shared/records.ts';
const root='/home/mike/projs/fork/dynamic-flow';
const project='/home/mike/projs/fork/dynamic-flow-workitem-composition';
const require=createRequire(project+'/package.json');
const {serve}=require('@hono/node-server'),{chromium}=require('@playwright/test');
const dataRoot=await mkdtemp('/tmp/flowcraft-real-home-');
const evidence=join(project,'conductor/tracks/workitem-composition_20261028/evidence/real-home');await mkdir(evidence,{recursive:true});
await copyFile(join(root,'models.toml'),join(dataRoot,'models.toml'));await chmod(join(dataRoot,'models.toml'),0o600);
await copyFile(join(root,'data/model-settings.json'),join(dataRoot,'model-settings.json'));
const app=await createApplication({dataRoot});
const browser=await chromium.launch({headless:true});
const server=serve({fetch:app.app.fetch,hostname:'127.0.0.1',port:0});
if(!server.listening)await new Promise<void>(resolve=>server.once('listening',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const report:any={startedAt:new Date().toISOString(),scope:'真实默认模型从首页实际规划、执行、发布；两条虚构任务，不验证漏洞判断',turns:[]};
let itemId:string|undefined;
const workspace=async()=>await (await app.app.request(`/api/items/${itemId}/workspace`)).json() as any;
const pause=()=>new Promise(resolve=>setTimeout(resolve,1000));
async function waitTurn(previous=0){const start=Date.now();let last='';for(;;){const ws=await workspace();const messages=ws.work?.work.messages.filter((m:any)=>m.role==='assistant')||[];const message=messages[previous];const progress=JSON.stringify({state:message?.status,tools:message?.activities?.length,last:message?.activities?.at(-1)?.toolName});if(progress!==last){console.log(progress);last=progress;}
if(message&&['completed','failed','cancelled'].includes(message.status)){report.turns.push({durationMs:Date.now()-start,status:message.status,text:message.text,error:message.error,tools:message.activities?.map((a:any)=>({name:a.toolName,status:a.status}))});assert.equal(message.status,'completed',message.error);return ws;}if(Date.now()-start>360000)throw Error('真实模型轮次等待超时');await pause();}}
try{
 const first=await app.work.createWork('读取调用者提供的JSON材料，原样返回每条id、team、message，不增加记录或判断。',[]);await app.work.rename(first.id,'读取JSON记录');
 const schema={type:'object',required:['id','team','message'],properties:{id:{type:'string'},team:{type:'string'},message:{type:'string'}}};
 const extract:Definition={schemaVersion:1,inputs:['materials'],inputContracts:{materials:{item:{type:'string'},required:true}},nodes:[{id:'extract',label:'读取原始记录',kind:'agent',mode:'each',operation:'flatMap',tools:{builtin:[],mcp:[]},task:'读取输入字符串，忽略文件名前缀，解析其中JSON数组。原样返回每条已有对象。id、team、message保持原值，不新增记录、不做业务判断。',expectedOutput:{type:'array',items:schema}}],edges:[{from:['$input','materials'],to:['extract','input']}],outputs:{records:['extract','output']}};
 const firstVersion=await app.flow.saveDraft(first.id,undefined,extract);await app.flow.adopt(first.id,firstVersion);
 const second=await app.work.createWork('按记录的team明确字段分组，保留原始记录',[]);await app.work.rename(second.id,'按团队分组');
 const grouping:Definition={schemaVersion:1,inputs:['records'],inputContracts:{records:{item:schema,required:true}},nodes:[{id:'group',label:'按团队归组',kind:'function',mode:'all',operation:'aggregate',functionName:'groupBy',groupBy:{keys:[['team']]}}],edges:[{from:['$input','records'],to:['group','input']}],outputs:{groups:['group','output']}};
 const secondVersion=await app.flow.saveDraft(second.id,undefined,grouping);await app.flow.adopt(second.id,secondVersion);
 report.methods=[{workId:first.id,definitionId:firstVersion},{workId:second.id,definitionId:secondVersion}];
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors:string[]=[];page.on('pageerror',(e:any)=>errors.push(e.message));
 await page.goto(url);await page.getByRole('heading',{name:'工作台',exact:true}).waitFor();
 await page.getByRole('textbox',{name:'工作需求'}).fill('整理这批任务记录，保留明细，并按团队归组。先规划，暂不正式执行。');
 const records=[{id:'R1',team:'平台',message:'核对输入'},{id:'R2',team:'平台',message:'补齐依据'}];
 await page.locator('.work-start input[type=file]').setInputFiles({name:'tasks.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(records))});
 await page.screenshot({path:join(evidence,'home-start.png')});
 await page.getByRole('button',{name:'开始',exact:true}).click();
 for(let i=0;i<50;i++){const items=await app.items.list();if(items.items[0]){itemId=items.items[0].id;break;}await pause();}assert.ok(itemId);report.itemId=itemId;
 let ws=await waitTurn();
 assert.ok(ws.work.work.draftId,'模型未保存流程');assert.equal(ws.work.work.runs.length,0,'首页规划不应自动正式运行');assert.ok(ws.work.definitions[ws.work.work.draftId].nodes.some((n:any)=>n.kind==='call'),'应复用已提供方法');
 await page.getByRole('tab',{name:'流程',exact:true}).click();await page.getByRole('button',{name:'Fit View',exact:true}).click();await page.screenshot({path:join(evidence,'planned-flow.png')});
 const count=ws.work.work.messages.filter((m:any)=>m.role==='assistant').length;
 const input=page.getByRole('complementary',{name:'工作项 Assistant'}).getByRole('textbox',{name:'对话修改',exact:true});
 await input.fill('现在按已保存流程实际运行，检查真实结果，发布原始明细表格和按团队归组报告两类成果。保留原始值与来源，不确认完成条件。');await page.getByRole('button',{name:'发送修改',exact:true}).click();
 ws=await waitTurn(count);
 for(let i=0;i<120&&ws.work.work.runs.some((r:any)=>['queued','running'].includes(r.status));i++){await pause();ws=await workspace();}
 if(ws.deliveries.length<2){const c=ws.work.work.messages.filter((m:any)=>m.role==='assistant').length;await input.fill('检查已经启动的实际运行，完成后将原始明细表格和团队归组报告两个真实输出发布为不同交付。请实际完成发布。');await page.getByRole('button',{name:'发送修改',exact:true}).click();ws=await waitTurn(c);}
 assert.ok(ws.deliveries.length>=2,'缺少两类实际交付');assert.ok(ws.work.work.runs.some((r:any)=>r.status==='completed'));
 const table=ws.deliveries.find((d:any)=>d.presentation.kind==='table'&&d.rows?.some((r:any)=>r.id==='R1'));assert.ok(table,'没有真实明细表格');assert.deepEqual(table.rows.map((r:any)=>r.id).sort(),['R1','R2']);assert.equal(ws.item.status,'open');
 await page.getByRole('tab',{name:'成果',exact:true}).click();await page.screenshot({path:join(evidence,'delivered.png')});
 await page.getByRole('tab',{name:'记录',exact:true}).click();await page.screenshot({path:join(evidence,'history.png')});
 report.definition=ws.work.definitions[ws.work.work.draftId];report.runs=ws.work.work.runs;report.deliveries=ws.deliveries;report.itemStatus=ws.item.status;report.pageErrors=errors;assert.deepEqual(errors,[]);report.completedAt=new Date().toISOString();console.log(JSON.stringify({turns:report.turns.map((t:any)=>({status:t.status,durationMs:t.durationMs})),runs:report.runs.map((r:any)=>r.status),deliveries:report.deliveries.length}));
}catch(error){report.error=String(error);console.log('REAL_HOME_ERROR',String(error));process.exitCode=1;}
finally{if(itemId){try{const ws=await workspace();for(const m of ws.work?.work.messages||[])if(m.role==='assistant'&&m.status==='running')await app.app.request(`/api/items/${itemId}/workspace/actions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'stopAssistant',requestId:m.requestId})});}catch{}}
 await browser.close();app.runs.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(resolve));await rm(dataRoot,{recursive:true,force:true});report.temporaryDataRemoved=true;await writeFile(join(evidence,'result.json'),JSON.stringify(report,null,2));}
