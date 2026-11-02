import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {createApplication} from '/home/mike/projs/fork/dynamic-flow/src/server/index.ts';
const root=await mkdtemp(join(tmpdir(),'flowcraft-migrate-check-'));
let oldVersion='';const calls:any[]=[];
const app=await createApplication({dataRoot:root,executeNode:async context=>{
 if(context.node.id!=='verify')throw Error('Unexpected model call '+context.node.id);
 const input=context.inputs.input[0];calls.push({version:context.definitionId,value:input.value});
 if(context.definitionId===oldVersion&&(input.value as any).target==='repo/2 develop')await new Promise((_resolve,reject)=>context.signal.addEventListener('abort',()=>reject(Error('stopped fixture')),{once:true}));
 const target=(input.value as any).target;return {target,repository:target,requestedRef:'develop',commit:'fixture',conclusion:'证据不足',reason:'fixture',evidence:[],unknown:['fixture']};
}});
async function api(path:string,body?:unknown){const r=await app.app.request(path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined);const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data as any;}
async function readRun(workId:string,id:string){return (await app.files.read(workId)).runs.find(r=>r.id===id)!;}
async function settled(workId:string,id:string){for(let i=0;i<200;i++){const r=await readRun(workId,id);if(['completed','failed','cancelled'].includes(r.status))return r;await sleep(10);}throw Error('fixture timeout');}
try{
 const facts={cve:'CVE-fixture'};
 const work=await app.work.createWork('迁移验证',[]);
 const seed:any={schemaVersion:1,inputs:['input'],nodes:[{id:'research',label:'冻结事实',kind:'function',mode:'each',operation:'map',functionName:'expression',expression:{kind:'literal',value:facts}}],edges:[{from:['$input','input'],to:['research','input']}],outputs:{facts:['research','output']}};
 const seedVersion=await app.flow.saveDraft(work.id,undefined,seed);
 let item=await api('/api/items',{title:'迁移验证',goal:'只继续未完成目标',workflowId:work.id,materials:['question','repo/1 develop','repo/2 develop','repo/3 develop'],criteria:['人工验收']});
 async function launch(version:string,node:string|undefined,selections:any){item=await api(`/api/items/${item.id}/actions`,{action:'run',workflowId:work.id,definitionId:version,scope:node?{nodeId:node}:'full',inputSelections:selections});return item.runs.at(-1).runId;}
 const m=(id:string)=>({kind:'material',materialId:id});
 const refs=(run:any,node:string)=>run.results.filter((r:any)=>r.nodeId===node&&r.status==='completed').flatMap((r:any)=>r.outputs.output.map((_:any,index:number)=>({kind:'result',source:{workId:work.id,runId:run.id,resultId:r.id,port:'output',index}})));
 const seedRun=await settled(work.id,await launch(seedVersion,undefined,{input:[m('M01')]}));
 const oldText=await readFile('/home/mike/projs/fork/dynamic-flow/data/060944d9-3509-404f-aecd-32ae4c89247a/definitions/d593dfc8-9073-49a0-9138-27ee13a60e1a.js','utf8');
 const old=JSON.parse(oldText.trim().replace(/^export default\s*/, '').replace(/;$/,''));
 oldVersion=await app.flow.saveDraft(work.id,seedVersion,old);
 const oldId=await launch(oldVersion,undefined,{facts:refs(seedRun,'research'),targets:['M02','M03','M04'].map(m)});
 for(let i=0;i<200;i++){const r=await readRun(work.id,oldId);if(r.results.filter(r=>r.nodeId==='verify'&&r.status==='completed').length===1&&r.results.some(r=>r.nodeId==='verify'&&r.status==='running'))break;await sleep(10);}
 await api(`/api/items/${item.id}/actions`,{action:'stop'});const stopped=await settled(work.id,oldId);assert.equal(stopped.status,'cancelled');
 const kept=stopped.results.filter(r=>r.nodeId==='verify'&&r.status==='completed');assert.equal(kept.length,1);
 const bundle=JSON.parse(await readFile('/home/mike/projs/fork/dynamic-flow/pipelines/cve/v2/source-check.json','utf8'));
 const version=await app.flow.saveDraft(work.id,oldVersion,bundle.definition);
 const verified=await settled(work.id,await launch(version,undefined,{facts:refs(seedRun,'research'),targets:['M03','M04'].map(m)}));assert.equal(verified.status,'completed');
 const fresh=verified.results.filter(r=>r.nodeId==='verify');assert.equal(fresh.length,2);assert.ok(fresh.every(r=>r.input.input[0].materialIds.length===2));
 const newSummary=verified.results.find(r=>r.nodeId==='report')!.outputs.output[0].value as any[];
 assert.equal(newSummary.length,2);
 const combined=[...kept.map(r=>r.outputs.output[0].value),...newSummary] as any[];
 assert.deepEqual(combined.map(value=>value.target),['repo/1 develop','repo/2 develop','repo/3 develop']);
 assert.equal(calls.filter(call=>call.version===version).length,2);
 assert.ok(calls.filter(call=>call.version===version).every(call=>call.value.target!=='repo/1 develop'));
 assert.deepEqual((await readRun(work.id,oldId)).results.find(r=>r.id===kept[0].id),kept[0]);
 const final=await app.items.get(item.id);assert.equal(final.status,'open');assert.equal(final.criteria[0].met,false);
 console.log(JSON.stringify({passed:true,preservedChecks:1,newChecks:2,summaryItems:3,newInputMaterials:2,oldRunPreserved:true,businessStatus:final.status}));
}finally{await app.runs.close();await rm(root,{recursive:true,force:true});}
