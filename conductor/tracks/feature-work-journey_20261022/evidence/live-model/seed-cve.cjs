const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');
(async()=>{
 const output=__dirname;const env=JSON.parse(await fs.readFile(path.join(output,'environment.json'),'utf8'));
 if(!env.dataRoot.startsWith(path.join(require('node:os').tmpdir(),'flowcraft-journey-live-')))throw Error('Expected private verification directory');
 const ids=['a6b0f746-1095-46b4-8f20-008d80d8c654','5cb210fc-f700-43bd-9946-736d869db90b'];const hashes={};
 for(const id of ids){
  const source=path.resolve('data',id);const destination=path.join(env.dataRoot,id);await fs.mkdir(destination,{recursive:true});
  const bytes=await fs.readFile(path.join(source,'work.json'));const work=JSON.parse(bytes);
  if(work.runs.some(r=>['queued','running','waiting','stopping','interrupted'].includes(r.status)))throw Error('Live source contains an unresolved run; do not copy it into verification');
  await fs.writeFile(path.join(destination,'work.json'),bytes);await fs.cp(path.join(source,'definitions'),path.join(destination,'definitions'),{recursive:true,errorOnExist:true});
  hashes[id]=crypto.createHash('sha256').update(bytes).digest('hex');
 }
 const itemId='3a1412fb-937b-4add-a7cd-7f23f94bf05a';const bytes=await fs.readFile(path.resolve('data/work-items',itemId+'.json'));await fs.mkdir(path.join(env.dataRoot,'work-items'),{recursive:true});await fs.writeFile(path.join(env.dataRoot,'work-items',itemId+'.json'),bytes);
 hashes[itemId]=crypto.createHash('sha256').update(bytes).digest('hex');
 await fs.writeFile(path.join(output,'cve-baseline.json'),JSON.stringify({itemId,workIds:ids,sourceHashes:hashes,copiedAt:new Date().toISOString(),source:'existing actual historical CVE data; copied as baseline only',originalWrites:false},null,2));
 console.log(JSON.stringify({copiedWorks:ids.length,copiedItems:1,originalWrites:false}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
