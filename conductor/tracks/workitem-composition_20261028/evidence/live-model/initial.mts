import { mkdtemp, copyFile, chmod, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '/home/mike/projs/fork/dynamic-flow-workitem-composition/src/server/index.ts';
import type { Definition, WorkItemView } from '/home/mike/projs/fork/dynamic-flow-workitem-composition/src/shared/records.ts';

const source='/home/mike/projs/fork/dynamic-flow';
const evidence=join(source,'conductor/tracks/workitem-composition_20261028/evidence/live-model');
await mkdir(evidence,{recursive:true});
const dataRoot=await mkdtemp(join(tmpdir(),'flowcraft-composition-live-'));
await copyFile(join(source,'models.toml'),join(dataRoot,'models.toml'));
await chmod(join(dataRoot,'models.toml'),0o600);
await copyFile(join(source,'data/model-settings.json'),join(dataRoot,'model-settings.json'));
const app=await createApplication({dataRoot});
const report:any={startedAt:new Date().toISOString(),dataRoot,scenario:'虚构告警记录的真实模型编排验证，不验证真实漏洞结论',turns:[]};
const post=async(path:string,body:unknown)=>{const r=await app.app.request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const value=await r.json();if(!r.ok)throw Error(JSON.stringify(value));return value as any;};
async function method(title:string,goal:string,definition:Definition){const w=await app.work.createWork(goal,[]);await app.work.rename(w.id,title);const d=await app.flow.saveDraft(w.id,undefined,definition);await app.files.change(w.id,work=>{work.adoptedId=d});return {workId:w.id,definitionId:d,title};}
try {
  report.methods=[await method('从材料抽取记录','读取调用者提供的JSON或CSV，保留每条已有记录字段与稳定id，不做额外业务判断。',{
    schemaVersion:1,inputs:['materials'],inputContracts:{materials:{item:{type:'string'},required:true}},
    nodes:[{id:'extract',label:'整理原始记录',kind:'agent',mode:'each',operation:'flatMap',tools:{builtin:[],mcp:[]},task:'解析输入中的JSON或CSV材料，返回其中的记录数组。每条记录原有id、repository、baseline、cve、assessment保持原值；不增加记录，不做额外业务判断。文件名等前缀只是材料来源。输出数组。',expectedOutput:{type:'array',items:{type:'object',required:['id','repository','baseline','cve','assessment'],properties:{id:{type:'string'},repository:{type:'string'},baseline:{type:'string'},cve:{type:'string'},assessment:{type:'string'}}}}}],
    edges:[{from:['$input','materials'],to:['extract','input']}],outputs:{records:['extract','output']}
  }),await method('按目标和版本归组','对输入记录按repository和baseline组成的明确键分组，不改变原记录。',{
    schemaVersion:1,inputs:['records'],inputContracts:{records:{item:{type:'object'},required:true}},
    nodes:[{id:'group',label:'按目标版本归组',kind:'function',functionName:'groupBy',mode:'all',operation:'aggregate',groupBy:{keys:[['repository'],['baseline']]}}],
    edges:[{from:['$input','records'],to:['group','input']}],outputs:{groups:['group','output']}
  })];
  const rows=[{id:'A1',repository:'api',baseline:'release-1',cve:'CVE-EXAMPLE-A',assessment:'受影响'},{id:'A2',repository:'api',baseline:'release-1',cve:'CVE-EXAMPLE-B',assessment:'受影响'},{id:'B1',repository:'worker',baseline:'release-1',cve:'CVE-EXAMPLE-A',assessment:'有依据排除'},{id:'B2',repository:'worker',baseline:'release-1',cve:'CVE-EXAMPLE-B',assessment:'待核查'},{id:'A3',repository:'api',baseline:'develop',cve:'CVE-EXAMPLE-A',assessment:'待核查'}];
  const item=await post('/api/items',{title:'虚构告警批次编排验证',goal:'整理这批已提供的判断记录，按仓库和版本展示并继续处理。判断值来自输入，不新增漏洞结论。'});
  report.itemId=item.id;
  await post(`/api/items/${item.id}/workspace/actions`,{action:'init'});
  const upload=await app.app.request(`/api/items/${item.id}/uploads?name=observations.json`,{method:'POST',headers:{'content-type':'application/octet-stream'},body:JSON.stringify(rows)});
  if(!upload.ok)throw Error(await upload.text());
  async function workspace(){return (await app.app.request(`/api/items/${item.id}/workspace`)).json() as Promise<any>;}
  async function turn(text:string){
    const result=await post(`/api/items/${item.id}/workspace/actions`,{action:'assistant',text});
    const requestId=result.requestId;const start=Date.now();let prior='';
    for(;;){
      const ws=await workspace(),m=ws.work?.work.messages.find((m:any)=>m.requestId===requestId&&m.role==='assistant');
      const status=JSON.stringify({state:m?.status,tools:m?.activities?.map((a:any)=>({name:a.toolName,status:a.status}))});
      if(status!==prior){console.log('turn',requestId,status);prior=status;}
      if(m&&['completed','failed','cancelled'].includes(m.status)){report.turns.push({requestId,durationMs:Date.now()-start,message:m});return ws;}
      if(Date.now()-start>720000)throw Error('真实模型轮次等待超时');
      await new Promise(r=>setTimeout(r,1000));
    }
  }
  let ws=await turn('请在当前工作项内完成实际操作：读取上传的observations.json，查询已有方法并读取具体保存版本合同，优先调用已有的记录抽取和按目标版本归组方法，保存一份可理解的组合流程。请实际运行，检查真实结果；发布原记录表格视图，列为仓库、版本、CVE、原判断，rowKey使用输入id。另发布按目标版本的归组成果（可用报告展示真实分组JSON或用表达式整理成有字符串id的表格）。保留两类交付。数据全是假设样例，只测试处理能力，保持判断原值，不生成新漏洞结论。处理已授权，无需再次确认。');
  for(let i=0;i<300&&ws.work?.work.runs.some((r:any)=>['queued','running'].includes(r.status));i++){await new Promise(r=>setTimeout(r,1000));ws=await workspace();}
  if(!(ws.deliveries?.length>=2))ws=await turn('请检查已经保存的实际运行和输出，若仍有失败就修正真正原因再运行；完成后用publish保存原记录表格与按目标版本归组这两个不同output的交付，保持原值。不要只给文字建议。');
  report.initial={definition:ws.work?.definitions[ws.work?.work.draftId],runs:ws.work?.work.runs,deliveries:ws.deliveries,itemStatus:ws.item.status};
  report.completedAt=new Date().toISOString();
  await writeFile(join(evidence,'result.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({itemId:report.itemId,dataRoot,deliveries:ws.deliveries?.length,runs:ws.work?.work.runs.map((r:any)=>({id:r.id,status:r.status})),turns:report.turns.map((t:any)=>({status:t.message.status,durationMs:t.durationMs})),evidence}));
}catch(error){report.error=String(error);await writeFile(join(evidence,'result.json'),JSON.stringify(report,null,2));console.log('LIVE_ERROR',String(error));process.exitCode=1;}
finally{app.runs.close();await rm(join(dataRoot,'models.toml'),{force:true});await rm(join(dataRoot,'model-settings.json'),{force:true});}
