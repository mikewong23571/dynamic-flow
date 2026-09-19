import { writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:4321';
async function request(path, body) {
  const response = await fetch(base+path, body ? {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)} : {});
  const value = await response.json();
  if(!response.ok) throw Error(JSON.stringify(value));
  return value;
}
const config = await request('/api/config');
const model = {model:config.model,protocol:config.protocol,reasoningEffort:config.reasoningEffort};
const prompt = '创建一条纯函数流水线，名字“风险评分 · 组合示例”。外部输入 findings 是多项JSON对象，每项有 severity(high/low/unknown) 和 score数字。第一个节点逐项使用 expression match：对象模式 severity=high 时把 score 解构绑定为 points 并返回 points，其它情况 otherwise 返回0。第二个节点 aggregate，使用 expression pipe，先filter只保留大于0的数字，然后map乘以2，最后reduce初值0按顺序add求和。请两个节点都明确 inputSchema/expectedOutput。只创建这两个 functionName:expression 节点，不用Agent，不编造运行结果；input端口，outputs total指向第二个节点output。保存真实定义。';
const created = await request('/api/works',{goal:'函数式组合验收：明确输入结构，匹配高风险得分后筛选、映射和顺序归约。',materials:['合成示例：high=3、low=1、high=4，预期总分14。']});
const id = created.work.id;
await request(`/api/works/${id}/actions`,{action:'edit',text:prompt});
let snapshot;
for(let n=0;n<180;n++) {
  snapshot=await request(`/api/works/${id}`);
  const message=snapshot.work.messages.filter(m=>m.role==='assistant').at(-1);
  if(message && ['completed','failed','cancelled'].includes(message.status)) break;
  await new Promise(r=>setTimeout(r,1000));
}
const message=snapshot.work.messages.filter(m=>m.role==='assistant').at(-1);
const path = new URL('./live-author.json',import.meta.url);
const record={model,workId:id,prompt,message,definition:snapshot.definitions[snapshot.work.draftId],issues:snapshot.issues};
await writeFile(path,JSON.stringify(record,null,2)+'\n');
if(message?.status!=='completed' || snapshot.issues.length) throw Error('Author failed: '+JSON.stringify({status:message?.status,error:message?.error,issues:snapshot.issues}));
const definition=record.definition;
await request(`/api/works/${id}/actions`,{action:'run',definitionId:snapshot.work.draftId,scope:'full',inputs:{[definition.inputs[0]]:[{severity:'high',score:3},{severity:'low',score:1},{severity:'high',score:4}].map((value,i)=>({sampleId:`case-${i}`,value,materialIds:['M01'],sourceResultIds:[]}))}});
let run;
for(let n=0;n<100;n++) {
  snapshot=await request(`/api/works/${id}`);
  run=snapshot.work.runs.at(-1);
  if(['completed','failed','cancelled'].includes(run?.status)) break;
  await new Promise(r=>setTimeout(r,100));
}
record.run=run;
await writeFile(path,JSON.stringify(record,null,2)+'\n');
const outputNode=Object.values(definition.outputs)[0][0];
const output=run.results.find(r=>r.nodeId===outputNode)?.outputs.output[0]?.value;
console.log(JSON.stringify({model,workId:id,status:message.status,runStatus:run.status,output,issues:snapshot.issues}));
if(run.status!=='completed'||output!==14) throw Error('Expected total 14');
