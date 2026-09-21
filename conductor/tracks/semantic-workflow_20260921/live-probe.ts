import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {Snapshot} from '../../../src/shared/records.ts';
const endpoint='http://127.0.0.1:4321';
async function api(path:string,body?:unknown):Promise<Snapshot>{const r=await fetch(endpoint+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);const v=await r.json();if(!r.ok)throw Error(v.error);return v as Snapshot;}
const initial=process.argv[2] ? await api(`/api/works/${process.argv[2]}`) : await api('/api/works',{goal:'动态调查验收：基于公告与日志核实订单失败原因，形成有证据的短结论',materials:['公告：09:00 发布 v2，调整支付请求重试次数。','日志：09:05 支付服务返回超时，重试两次后订单失败；未提供数据库错误证据。']});
const id=initial.work.id;console.log(JSON.stringify({workId:id,stage:'author-start'}));
if(!process.argv.includes('--run-only')) await api(`/api/works/${id}/actions`,{action:'edit',expectedDraftId:initial.work.draftId,text:process.argv[2] ? '请 inspect_run 检查最近的失败运行，输入 schema 误把材料 value 当成对象；实际批次是字符串值数组，来源元数据是另一层包装。使用 update_step 仅修复这个动态步骤的 inputSchema，保留其问题认知与其它配置。不要重新生成整份定义。' : '建立最小可用调查方法。先保留一个局部动态展开节点，运行到这里才根据本次证据选择1至2个具体调查步骤；边界是仅调查给定公告和日志、不做外部修改、不把时间先后冒充因果证明。填写问题认知、未知、约束、来源及步骤责任/完成条件/依据。dynamic 子图最终输出中文 Markdown 短结论，区分证据与未确认原因。只需要这个动态位置作为最终输出，不额外建立固定步骤。'});
async function waitFor(done:(s:Snapshot)=>boolean,label:string){const until=Date.now()+240000;while(Date.now()<until){const s=await api(`/api/works/${id}`);if(done(s))return s;await new Promise(r=>setTimeout(r,1500));}throw Error(label+' timeout');}
let snapshot=await waitFor(s=>['completed','failed','cancelled'].includes(s.work.messages.at(-1)?.status??''),'author');
await writeFile(resolve('conductor/tracks/semantic-workflow_20260921/artifacts/live-author.json'),JSON.stringify(snapshot,null,2));
if(snapshot.work.messages.at(-1)?.status!=='completed')throw Error(snapshot.work.messages.at(-1)?.error??'Author failed');
const def=snapshot.definitions[snapshot.work.draftId!];console.log(JSON.stringify({stage:'author-completed',nodes:def.nodes.map(n=>({id:n.id,kind:n.kind,label:n.label})),problem:!!def.problem,contracts:def.nodes.every(n=>!!n.contract)}));
if(!def.nodes.some(n=>n.kind==='dynamic'))throw Error('Author did not create requested local Dynamic');
await api(`/api/works/${id}/actions`,{action:'run',definitionId:snapshot.work.draftId,scope:'full',inputs:{[def.inputs[0]]:snapshot.work.materials.map(m=>({sampleId:m.id,value:m.text,materialIds:[m.id],sourceResultIds:[]}))}});
snapshot=await waitFor(s=>['completed','failed','cancelled'].includes(s.work.runs.at(-1)?.status??''),'run');
await writeFile(resolve('conductor/tracks/semantic-workflow_20260921/artifacts/live-run.json'),JSON.stringify(snapshot,null,2));
const run=snapshot.work.runs.at(-1)!;console.log(JSON.stringify({workId:id,stage:'run-finished',status:run.status,expansions:run.expansions?.map(e=>({nodeId:e.nodeId,nodes:e.definition.nodes.length})),results:run.results.map(r=>({nodeId:r.nodeId,status:r.status,error:r.error,purpose:r.purpose}))}));
if(run.status!=='completed')throw Error(run.error??run.results.find(r=>r.error)?.error??'Run failed');
