import assert from 'node:assert/strict';
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
const prompt = `创建并保存“多路结果 · 组合示例”，只使用6个function节点，不用Agent。这是可重复运行的合成教学样例，不是真实漏洞结论。
外部仅有materials输入。前三个节点都从materials接input，每个用operation:flatMap、mode:each、expression literal生成固定数组：investigation=[{id:'A',severity:'high'},{id:'B',severity:'low'},{id:'A',severity:'medium'}]；remediation=[{id:'A',fixed:true},{id:'C',fixed:false}]；verification=[{id:'V',verified:true}]。材料只有一条触发文本。输入schema string，expectedOutput是对应array of objects。
其后三个节点同时接收这些上游节点真实输出：merged使用新的merge，inputNames=['investigation','remediation','verification']；collected用collect，inputNames相同；joined用join，left连接investigation，right连接remediation，左右key路径均['id']，type:full，duplicates:all。这三个均mode:all/operation:aggregate，inputSchema为具名数组对象并required所有对应端口，merge/join expectedOutput为array，collect expectedOutput为object of arrays。所有节点label使用简洁中文。最终outputs命名merged,collected,joined指向对应3节点output。不要增加其它节点，不要编造运行结果，调用update_flow真实保存。`;
const created = await request('/api/works',{goal:'组合多个节点的输出：多路汇合、具名收集与按漏洞编号关联。',materials:['合成示例触发一次：固定调查、修复、验证数据用于展示组合规则。']});
const id = created.work.id;
console.log(JSON.stringify({stage:'created',workId:id,model}));
await request(`/api/works/${id}/actions`,{action:'edit',text:prompt});
let snapshot;
for(let n=0;n<240;n++) {
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
const inputs=Object.fromEntries(definition.inputs.map(port=>[port,[{sampleId:'trigger',value:'合成示例',materialIds:['M01'],sourceResultIds:[]}]]));
await request(`/api/works/${id}/actions`,{action:'run',definitionId:snapshot.work.draftId,scope:'full',inputs});
let run;
for(let n=0;n<100;n++) {
  snapshot=await request(`/api/works/${id}`); run=snapshot.work.runs.at(-1);
  if(['completed','failed','cancelled'].includes(run?.status)) break;
  await new Promise(r=>setTimeout(r,100));
}
record.run=run;
const outputs=Object.fromEntries(Object.entries(definition.outputs).map(([name,[nodeId,port]])=>[name,run.results.filter(r=>r.nodeId===nodeId).flatMap(r=>r.outputs[port]||[]).map(i=>i.value)]));
record.actualOutputs=outputs;
await writeFile(path,JSON.stringify(record,null,2)+'\n');
assert.equal(run.status,'completed');
assert.equal(outputs.merged.length,6);
assert.equal(outputs.collected.length,1);
assert.deepEqual(Object.fromEntries(Object.entries(outputs.collected[0]).map(([k,v])=>[k,v.length])),{investigation:3,remediation:2,verification:1});
assert.deepEqual(outputs.joined.map(row=>[row.left?.id??null,row.right?.id??null]),[['A','A'],['B',null],['A','A'],[null,'C']]);
console.log(JSON.stringify({stage:'passed',model,workId:id,status:message.status,runStatus:run.status,counts:Object.fromEntries(Object.entries(outputs).map(([k,v])=>[k,v.length])),issues:snapshot.issues}));
