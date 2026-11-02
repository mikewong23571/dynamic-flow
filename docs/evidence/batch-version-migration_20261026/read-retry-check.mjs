import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const text=fs.readFileSync('/home/mike/scc-critical-high-batch-20261025/impact/migrate-impact-v2.mjs','utf8');
const source=text.slice(text.indexOf('async function api('),text.indexOf('const canonical='));
function runner(fetch){return vm.runInNewContext(`(function(){${source};return api;})()`,{fetch,base:'http://fixture',log(){},sleep:async()=>{},AbortSignal:{timeout:()=>undefined}});}
let reads=0;
const read=runner(async()=>{if(++reads===1)throw Error('fixture socket closed');return {ok:true,json:async()=>({recovered:true})};});
assert.deepEqual(await read('/read'),{recovered:true});assert.equal(reads,2);
let writes=0;
const write=runner(async()=>{writes++;throw Error('fixture socket closed');});
await assert.rejects(()=>write('/write',{action:'run'}),/fixture socket closed/);assert.equal(writes,1);
console.log(JSON.stringify({getRecoveredAfterTransientFailure:true,getAttempts:reads,postNotRetried:true,postAttempts:writes}));
