import { readFile, copyFile, chmod, writeFile, rm, cp, mkdtemp, readdir, readlink, symlink, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createApplication } from '/home/mike/projs/fork/dynamic-flow-workitem-composition/src/server/index.ts';

const source='/home/mike/projs/fork/dynamic-flow';
const evidence=join(source,'conductor/tracks/workitem-composition_20261028/evidence/live-model');
const first=JSON.parse(await readFile(join(evidence,'result.json'),'utf8'));
const dataRoot=await mkdtemp('/tmp/flowcraft-composition-verified-');
await cp(first.dataRoot,dataRoot,{recursive:true});
async function relocateLinks(dir:string){for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())await relocateLinks(path);else if(entry.isSymbolicLink()){const target=await readlink(path);if(target.startsWith(first.dataRoot+'/')){await unlink(path);await symlink(dataRoot+target.slice(first.dataRoot.length),path);}}}}
await relocateLinks(dataRoot);
await copyFile(join(source,'models.toml'),join(dataRoot,'models.toml'));await chmod(join(dataRoot,'models.toml'),0o600);
await copyFile(join(source,'data/model-settings.json'),join(dataRoot,'model-settings.json'));
const app=await createApplication({dataRoot});
const report:any={startedAt:new Date().toISOString(),dataRoot,turns:[],scope:'真实模型操作与输入/交付复用；示例判断来自输入，不验证漏洞正确性'};
const post=async(path:string,body:unknown)=>{const r=await app.app.request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(JSON.stringify(d));return d as any;};
const workspace=async(id:string)=>(await app.app.request(`/api/items/${id}/workspace`)).json() as Promise<any>;
async function turn(id:string,text:string){
 const {requestId}=await post(`/api/items/${id}/workspace/actions`,{action:'assistant',text});
 const start=Date.now();let old='';
 for(;;){const ws=await workspace(id),m=ws.work?.work.messages.find((m:any)=>m.requestId===requestId&&m.role==='assistant');
 const progress=JSON.stringify({status:m?.status,activityCount:m?.activities?.length,last:m?.activities?.at(-1)?.toolName,lastState:m?.activities?.at(-1)?.status});
 if(progress!==old){console.log(progress);old=progress;}
 if(m&&['completed','failed','cancelled'].includes(m.status)){report.turns.push({itemId:id,requestId,durationMs:Date.now()-start,message:m});return ws;}
 if(Date.now()-start>600000)throw Error('真实模型操作等待超时');await new Promise(r=>setTimeout(r,1000));}
}
try{
 let ws=await turn(first.itemId,'请把当前已经成功的整套处理流程保存为可复用流水线，名称“告警材料整理与目标归组-复验”。保留已发布表格视图模板，输入必须参数化，不能写死本批材料。本轮只执行沉淀方法，勿改变当前流程。已授权执行。');
 const methods=await (await app.app.request('/api/works')).json() as any;
 const exported=(methods.works??methods.items??[]).find((m:any)=>m.title==='告警材料整理与目标归组-复验');
 if(!exported)throw Error('模型未保存出所要求的复用方法');
 ws=await turn(first.itemId,'从原记录表格的真实交付中只选择A1、A2，使用目录中“按目标和版本归组”的保存版本准备后续处理，实际运行并将结果发布为“所选记录归组”报告。原记录及原有groupRows交付继续保留，不确认条件、不结项。已授权执行。');
 report.continuation={itemId:first.itemId,deliveries:ws.deliveries,runs:ws.work?.work.runs.slice(-1),method:exported};
 const item=await post('/api/items',{title:'第二批材料复用验证',goal:'用已经沉淀的处理流程整理新的两条假设记录，展示原记录与目标版本分组。判断原值保持不变。'});
 report.reuseItemId=item.id;
 await post(`/api/items/${item.id}/workspace/actions`,{action:'init'});
 const data=[{id:'N1',repository:'portal',baseline:'release-2',cve:'CVE-EXAMPLE-C',assessment:'待核查'},{id:'N2',repository:'portal',baseline:'release-2',cve:'CVE-EXAMPLE-D',assessment:'有依据排除'}];
 const upload=await app.app.request(`/api/items/${item.id}/uploads?name=new-observations.json`,{method:'POST',body:JSON.stringify(data)});if(!upload.ok)throw Error(await upload.text());
 let reused=await turn(item.id,'请从方法目录找到刚保存的“告警材料整理与目标归组-复验”，读取具体版本及视图模板，在当前工作项复用这一整套方法处理上传的新文件。用select_inputs直接引用本项材料，不手抄或重新创建材料值。请保存最简call组合、实际运行，并按方法的视图模板发布原记录和目标版本分组两类成果。只使用本批N1/N2，不引入其他工作项的材料；判断原值保持不变。已授权执行。');
 if(!(reused.deliveries?.length>=2))reused=await turn(item.id,'请继续检查已经发起的实际运行和方法视图模板，将成功输出的两类真实成果发布到本工作项。');
 report.reuse={item:reused.item,definition:reused.work?.definitions[reused.work?.work.draftId],runs:reused.work?.work.runs,deliveries:reused.deliveries};
 report.completedAt=new Date().toISOString();await writeFile(join(evidence,'verified-reuse-result.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({turns:report.turns.map((t:any)=>({status:t.message.status,durationMs:t.durationMs})),originalDeliveries:ws.deliveries?.length,reuseItemId:item.id,reuseDeliveries:reused.deliveries?.length,reuseRunStates:reused.work?.work.runs.map((r:any)=>r.status),evidence}));
}catch(e){report.error=String(e);await writeFile(join(evidence,'verified-reuse-result.json'),JSON.stringify(report,null,2));console.log('LIVE_ERROR',String(e));process.exitCode=1;}
finally{app.runs.close();await rm(join(dataRoot,'models.toml'),{force:true});await rm(join(dataRoot,'model-settings.json'),{force:true});}
