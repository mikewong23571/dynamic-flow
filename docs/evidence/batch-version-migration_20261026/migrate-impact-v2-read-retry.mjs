import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
const root='/home/mike/scc-critical-high-batch-20261025';
const dir=path.join(root,'impact'),file=path.join(dir,'progress.json');
const base='http://127.0.0.1:4321',workId='060944d9-3509-404f-aecd-32ae4c89247a';
let state=JSON.parse(fs.readFileSync(file,'utf8'));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const terminal=new Set(['completed','failed','cancelled','interrupted','waiting']);
const log=(...args)=>console.log(new Date().toISOString(),...args);
const save=()=>{state.updatedAt=new Date().toISOString();fs.writeFileSync(file+'.migration.tmp',JSON.stringify(state,null,2));fs.renameSync(file+'.migration.tmp',file);};
async function api(route,body){
 for(let attempt=0;;attempt++){
  try{
   const response=await fetch(base+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(120000)});
   const data=await response.json();
   if(!response.ok){const error=Error(`HTTP ${response.status} ${route}: ${JSON.stringify(data)}`);error.httpStatus=response.status;throw error;}
   return data;
  }catch(error){
   if(body||attempt>=3||(error.httpStatus&&error.httpStatus<500))throw error;
   log('READ_RETRY',route,attempt+1,error.message);await sleep(1000*2**attempt);
  }
 }
}
const canonical=value=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).sort().map(key=>[key,JSON.parse(canonical(value[key]))])):value);
async function snapshot(ids){return api(`/api/works/${workId}${ids?.length?'?runIds='+encodeURIComponent([...new Set(ids)].join(',')):''}`);}
async function readRun(id){const s=await snapshot([id]);const run=s.work.runs.find(run=>run.id===id);if(!run)throw Error('Missing run '+id);return run;}
function outputs(run,node){return run.results.filter(result=>result.nodeId===node&&result.status==='completed').flatMap(result=>(result.outputs.output||[]).map((item,index)=>({result,index,value:item.value,reference:{workId,runId:run.id,resultId:result.id,port:'output',index}})));}
const selection=refs=>refs.map(source=>({kind:'result',source}));
function oldTargets(run){const rows=outputs(run,'targets');if(!rows.length)throw Error('Missing prepared targets '+run.id);if(new Set(rows.map(row=>canonical(row.value))).size!==rows.length)throw Error('Duplicate prepared targets '+run.id);return rows;}
function completedChecks(runs){const map=new Map();for(const run of runs)for(const row of outputs(run,'verify')){const input=row.result.input.input;if(input.length!==1)throw Error('Unexpected verification input');const key=canonical(input[0].value);if(map.has(key))throw Error('Duplicate successful verification input');map.set(key,row);}return map;}
function orderedChecks(targets,checks){return targets.map(target=>checks.get(canonical(target.value)));}
async function progress(entry,stage,summary,nextAction){const item=await api('/api/items/'+entry.itemId);return api(`/api/items/${entry.itemId}/actions`,{action:'reportProgress',id:`migration:${entry.cve}:${stage}`,expectedRevision:item.revision,stage,summary,nextAction});}
async function launch(entry,node,inputSelections){const next=await api(`/api/items/${entry.itemId}/actions`,{action:'run',workflowId:workId,definitionId:state.migration.definitionId,scope:node?{nodeId:node}:'full',inputSelections});const ref=next.runs.at(-1);if(!ref||ref.definitionId!==state.migration.definitionId)throw Error('Unexpected launch reference');entry.runId=ref.runId;entry.definitionId=ref.definitionId;entry.status='running';entry.phase=node||'verify';delete entry.error;save();return ref.runId;}
async function waitFunction(runId){for(let tries=0;tries<120;tries++){const run=await readRun(runId);if(run.status==='completed')return run;if(terminal.has(run.status))throw Error('Function failed '+runId+': '+JSON.stringify(run.results.filter(r=>r.error).map(r=>r.error)));await sleep(250);}throw Error('Function completion timeout '+runId);}
function runExport(){const result=spawnSync(process.execPath,[path.join(dir,'export-impact.mjs')],{stdio:'inherit'});if(result.status!==0)throw Error('Export failed: '+result.status);}
async function summarize(entry){const runs=await Promise.all(entry.verificationRunIds.map(readRun));const source=await readRun(entry.migration.originalRunId);const targets=oldTargets(source),checks=completedChecks(runs),ordered=orderedChecks(targets,checks);entry.finishedChecks=checks.size;
 if(ordered.some(row=>!row)){entry.status='failed';entry.error=`仅有${checks.size}/${targets.length}份成功核查，不能宣称全部完成`;save();return;}
 const item=await api('/api/items/'+entry.itemId);const latest=item.runs.at(-1);let existing=latest?.workId===workId?await readRun(latest.runId):undefined;
 if(!(existing?.definitionId===state.migration.definitionId&&existing.scope?.nodeId==='report'&&existing.status==='completed'&&isDeepStrictEqual(outputs(existing,'report')[0]?.value,ordered.map(row=>row.value)))){
   const id=await launch(entry,'report',{input:selection(ordered.map(row=>row.reference))});existing=await waitFunction(id);
 }
 if(!isDeepStrictEqual(outputs(existing,'report')[0]?.value,ordered.map(row=>row.value)))throw Error('Summary differs from original source records');
 entry.runId=existing.id;entry.definitionId=existing.definitionId;entry.status='completed';entry.phase='report';entry.finishedAt=existing.finishedAt;entry.finishedChecks=ordered.length;delete entry.error;entry.migration.completedAt=new Date().toISOString();save();
 await progress(entry,'源码核查结果待人工复核',`已用新版汇集${ordered.length}份核查结果，保留原核查依据；本次迁移复用${entry.migration.preservedChecks}份已有结果。`,'检查逐目标结论、源码依据及未知事项，再核对完成条件；执行成功不等于业务结项。');
 log('SUMMARY',entry.cve,ordered.length,existing.id);
}
async function finishContinuation(entry){
 const source=await readRun(entry.migration.originalRunId),targets=oldTargets(source);
 const runs=await Promise.all(entry.verificationRunIds.map(readRun));const checks=completedChecks(runs),ordered=orderedChecks(targets,checks);
 if(ordered.some(row=>!row))throw Error('Incomplete cumulative verification '+entry.cve);
 const current=runs.find(run=>run.id===entry.migration.continuationRunId);
 const fresh=outputs(current,'verify').map(row=>row.value);
 if(current.status!=='completed'||!isDeepStrictEqual(outputs(current,'report')[0]?.value,fresh))throw Error('New full run summary changed results');
 const combinedFile=path.join(dir,entry.cve+'-combined-checks.json');
 fs.writeFileSync(combinedFile,JSON.stringify({cve:entry.cve,definitionId:current.definitionId,sourceResults:ordered.map(row=>row.reference),checks:ordered.map(row=>row.value)},null,2));
 entry.runId=current.id;entry.definitionId=current.definitionId;entry.status='completed';entry.phase='report';entry.finishedAt=current.finishedAt;entry.finishedChecks=ordered.length;entry.combinedChecksFile=combinedFile;delete entry.error;entry.migration.completedAt=new Date().toISOString();save();
 await progress(entry,'源码核查结果待人工复核',`累计已完成${ordered.length}个目标，保留${entry.migration.preservedChecks}份旧结果，本轮用新版补核查${fresh.length}个目标；各轮结果与批次表保留完整依据。`,'结合各轮结果检查逐目标结论、依据与未知，再人工核对完成条件。');
 log('CONTINUATION_COMPLETE',entry.cve,ordered.length,current.id);
}
const method=await snapshot();const adopted=method.work.adoptedId;const definition=method.definitions[adopted];
if(!definition||!['facts','targets','pair','input','verify','report'].every(id=>definition.nodes.some(node=>node.id===id)))throw Error('New method is incomplete');
const report=definition.nodes.find(node=>node.id==='report');if(report.kind!=='function'||report.functionName!=='identity'||report.operation!=='aggregate')throw Error('Report still invokes a model');
const plan=state.entries.map(entry=>{const run=method.work.runs.find(run=>run.id===(entry.migration?.originalRunId||entry.runId));if(!run)throw Error('Missing original '+entry.cve);const targets=oldTargets(run),checks=completedChecks([run]);if(targets.length!==entry.targetCount)throw Error('Target count changed '+entry.cve);return{cve:entry.cve,itemId:entry.itemId,originalRunId:run.id,definitionId:run.definitionId,status:run.status,targets:targets.length,preserved:checks.size,remaining:targets.length-checks.size};});
if(process.argv.includes('--plan')){console.log(JSON.stringify({definitionId:adopted,entries:plan},null,2));process.exit(0);}
if(!process.argv.includes('--apply'))throw Error('Use --plan or --apply');
if(!state.migration){
 const stamp=new Date().toISOString().replace(/[:.]/g,'-'),backup=path.join(dir,'migration-backup-'+stamp);fs.mkdirSync(backup);
 for(const name of ['progress.json','run-impact.mjs','export-impact.mjs','summary.json'])if(fs.existsSync(path.join(dir,name)))fs.copyFileSync(path.join(dir,name),path.join(backup,name));
 const workbook=path.join(root,'首批20个漏洞-业务源码影响分析.xlsx');if(fs.existsSync(workbook))fs.copyFileSync(workbook,path.join(backup,path.basename(workbook)));
 const oldScript=path.join(dir,'run-impact.mjs'),pids=[];
 for(const pid of fs.readdirSync('/proc').filter(name=>/^\d+$/.test(name))){let args;try{args=fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0');}catch{continue;}if(args.includes(oldScript)){process.kill(Number(pid),'SIGTERM');pids.push(Number(pid));}}
 for(const pid of pids){for(let i=0;i<50;i++){let alive=false;try{process.kill(pid,0);alive=true;}catch{}if(!alive)break;await sleep(100);}try{process.kill(pid,0);throw Error('Old coordinator did not exit');}catch(error){if(error.code!=='ESRCH')throw error;}}
 state=JSON.parse(fs.readFileSync(file,'utf8'));state.migration={definitionId:adopted,startedAt:new Date().toISOString(),active:true,backup,stoppedCoordinatorPids:pids};
 for(const entry of state.entries){const original=plan.find(row=>row.cve===entry.cve);entry.migration={originalRunId:original.originalRunId,originalDefinitionId:original.definitionId,originalStatus:original.status,preservedChecks:original.preserved,preparation:{}};entry.verificationRunIds=[original.originalRunId];}
 save();
 // Prevent accidentally resuming the old coordinator against a mixed-phase migration.
 let oldCode=fs.readFileSync(oldScript,'utf8');oldCode=oldCode.replace('const terminal=new Set(',"if(state.migration?.active)throw Error('批次由 migrate-impact-v2.mjs 接管，请勿并行启动旧调度器');\nconst terminal=new Set(");fs.writeFileSync(oldScript,oldCode);fs.writeFileSync(path.join(dir,'export-impact.mjs'),"import './export-impact-v2.mjs';\n");
}
if(state.migration.definitionId!==adopted)throw Error('Adopted version changed during migration');
for(const entry of state.entries){
 const old=await readRun(entry.migration.originalRunId);
 if(['running','waiting','interrupted'].includes(old.status)){
   const item=await api('/api/items/'+entry.itemId);if(item.execution?.runId!==old.id)throw Error('Item has another active run '+entry.cve);
   await api(`/api/items/${entry.itemId}/actions`,{action:'stop'});
   for(let i=0;i<120;i++){const stopped=await readRun(old.id);if(terminal.has(stopped.status))break;await sleep(250);}
 }
}
for(const entry of state.entries){
 if(entry.migration.completedAt)continue;
 const old=await readRun(entry.migration.originalRunId),targets=oldTargets(old),prior=completedChecks([old]);entry.migration.preservedChecks=prior.size;entry.definitionId=adopted;save();
 if(prior.size===targets.length){await summarize(entry);continue;}
 let continuation=entry.migration.continuationRunId;
 if(!continuation){
   const remaining=targets.filter(row=>!prior.has(canonical(row.value)));
   const currentItem=await api('/api/items/'+entry.itemId);
   const materialIds=remaining.map(row=>{
     const matches=currentItem.materials.filter(material=>entry.targetMaterialIds.includes(material.id)&&material.text===row.value.target);
     if(matches.length!==1)throw Error('Target material does not match the fixed input '+entry.cve);
     return matches[0].id;
   });
   entry.migration.remainingTargets=remaining.length;save();
   await progress(entry,'新版源码核查中',`已保留${prior.size}份成功核查，新版继续处理其余${remaining.length}个目标。`,'等待剩余目标完成后用普通函数汇集，结合各轮结果复核依据与未知事项。');
   continuation=await launch(entry,null,{facts:selection([entry.source]),targets:materialIds.map(materialId=>({kind:'material',materialId}))});entry.migration.continuationRunId=continuation;entry.verificationRunIds=[old.id,continuation];save();
   log('CONTINUE',entry.cve,'preserved',prior.size,'remaining',remaining.length,continuation);
 }
 const current=await readRun(continuation);if(terminal.has(current.status)){if(current.status==='completed')await finishContinuation(entry);else{entry.status=current.status;entry.error=current.results.find(row=>row.error)?.error||current.status;save();}}
}
runExport();log('MIGRATION_STARTED',JSON.stringify(state.entries.reduce((counts,entry)=>(counts[entry.status]=(counts[entry.status]||0)+1,counts),{})));
while(state.entries.some(entry=>entry.migration.continuationRunId&&!entry.migration.completedAt&&entry.status==='running')){
 await sleep(15000);
 for(const entry of state.entries.filter(entry=>entry.migration.continuationRunId&&!entry.migration.completedAt&&entry.status==='running')){
   try{
    const run=await readRun(entry.migration.continuationRunId);const all=await Promise.all(entry.verificationRunIds.map(readRun));entry.finishedChecks=completedChecks(all).size;save();
    if(terminal.has(run.status)){if(run.status==='completed')await finishContinuation(entry);else{entry.status=run.status;entry.error=run.results.find(row=>row.error)?.error||run.status;save();}runExport();}
   }catch(error){log('MONITOR_RETRY_NEXT_POLL',entry.cve,error.message);}
 }
}
state.migration.active=false;state.migration.finishedAt=new Date().toISOString();state.finishedAt=state.migration.finishedAt;save();runExport();
const counts=state.entries.reduce((result,entry)=>(result[entry.status]=(result[entry.status]||0)+1,result),{});const parent=await api('/api/items/'+state.parentId);
await api(`/api/items/${state.parentId}/actions`,{action:'reportProgress',id:'migration-finished:'+state.migration.startedAt,expectedRevision:parent.revision,stage:'新版源码核查运行结束，待复核',summary:JSON.stringify(counts),nextAction:'检查各工作项的新版汇集结果，复核原扫描映射、扫描时版本与部署影响；不自动确认完成条件。',blocker:parent.blocker});
log('MIGRATION_FINISHED',JSON.stringify(counts));
