/** Small real Pi → fixed candidates → runtime → business files probe. No user data writes. */
import {mkdtemp,copyFile,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createApplication} from '../../../../../src/server/index.ts';
import type {Definition} from '../../../../../src/shared/records.ts';
const evidence=resolve('conductor/tracks/feature-workitem-decomposition_20261023/evidence/runtime');
const root=await mkdtemp(join(tmpdir(),'flowcraft-real-decomposition-'));
await copyFile(resolve('models.toml'),join(root,'models.toml'));
const saved=JSON.parse(await readFile(resolve('data/model-settings.json'),'utf8'));
if(!saved.defaultSelection?.alias)throw Error('现有默认模型未设置');
await writeFile(join(root,'model-settings.json'),JSON.stringify({defaultSelection:{alias:saved.defaultSelection.alias,effort:'high'}}),{mode:0o600});
const app=await createApplication({dataRoot:root});
const work=await app.work.createWork('客户反馈拆成独立问题',[]);
const definition:Definition={schemaVersion:1,inputs:['input'],nodes:[{
 id:'discover',label:'识别独立问题',kind:'agent',mode:'all',operation:'aggregate',tools:{builtin:[],mcp:[]},
 task:'根据输入客户反馈，把需要独立调查的两个问题整理为候选清单。每个候选有独立且具体的title、goal，inputs带对应反馈原文，criteria写一条可检查的完成条件，id在清单内唯一。仅拆分输入中存在的问题，不推断原因或宣称已经解决。',
 expectedOutput:{type:'object',required:['candidates'],properties:{candidates:{type:'array',minItems:2,maxItems:2,items:{type:'object',required:['id','title','goal','inputs','criteria'],properties:{id:{type:'string'},title:{type:'string'},goal:{type:'string'},inputs:{type:'array',minItems:1,items:{type:'object',required:['label','value'],properties:{label:{type:'string'},value:{type:'string'}}}},criteria:{type:'array',items:{type:'string'}}}}}}}
},{id:'create',label:'建立子项',kind:'create-items',mode:'all',operation:'aggregate'}],edges:[{from:['$input','input'],to:['discover','input']},{from:['discover','output'],to:['create','input']}],outputs:{items:['create','output']}};
const definitionId=await app.flow.saveDraft(work.id,undefined,definition);
const parent=await app.items.create({title:'客户反馈调查',goal:'分别调查导出失败与搜索漏项',materials:['客户甲反馈：导出月报时页面提示失败，无法取得报表。客户乙反馈：按已知订单编号搜索没有结果，但订单列表能找到该订单。'],criteria:[]});
const response=await app.app.request(`/api/items/${parent.id}/actions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'run',workflowId:work.id,definitionId})});
if(!response.ok)throw Error(`启动失败 ${response.status}: ${await response.text()}`);
const item=await response.json();
const runId=item.runs.at(-1).runId;
await writeFile(join(evidence,'real-fixture.json'),JSON.stringify({dataRoot:root,workId:work.id,parentId:parent.id,runId,definitionId},null,2));
console.log(JSON.stringify({stage:'started',dataRoot:root,workId:work.id,parentId:parent.id,runId,effort:'high'}));
const timer=setTimeout(()=>void app.runs.stop(work.id,runId),600000);
await app.runs.wait(runId);clearTimeout(timer);
const run=(await app.files.read(work.id)).runs.find(r=>r.id===runId)!;
const children=(await app.items.list()).items.filter(i=>i.parentId===parent.id);
const result={status:run.status,effectiveModel:run.results.find(r=>r.nodeId==='discover')?.effectiveModel,inputs:run.inputs,results:run.results.map(r=>({id:r.id,nodeId:r.nodeId,status:r.status,error:r.error,outputs:r.outputs})),children:children.map(c=>({id:c.id,title:c.title,goal:c.goal,parentId:c.parentId,status:c.status,receivedInputs:c.receivedInputs,origin:c.origin}))};
await writeFile(join(evidence,'real-result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({stage:'finished',status:run.status,children:children.length,effort:result.effectiveModel?.effort}));
app.runs.close();
if(run.status!=='completed'||children.length!==2)process.exitCode=1;
