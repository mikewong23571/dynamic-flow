const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(process.argv[2]||process.cwd());
const packageDir=fs.readdirSync(path.join(root,'node_modules/.pnpm')).find(x=>x.startsWith('postcss@'));
const postcss=require(path.join(root,'node_modules/.pnpm',packageDir,'node_modules/postcss'));
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const files=walk(path.join(root,'src/client')).filter(p=>/\.(tsx?|css)$/.test(p));
const rel=p=>path.relative(root,p).split(path.sep).join('/');
const resolveImport=(p,s)=>{
 const b=s.startsWith('@/')?path.join(root,'src',s.slice(2)):s.startsWith('.')?path.resolve(path.dirname(p),s):null;
 return b?['','.tsx','.ts','/index.tsx','/index.ts'].map(x=>b+x).find(x=>fs.existsSync(x)&&fs.statSync(x).isFile()):null;
};
const data={sourceFiles:files.map(p=>({path:rel(p),sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')})),modules:[],nativeControls:[],buttonUsages:[],inlineStyles:[],cssFiles:[],cssRules:[],cssDeclarations:[],darkClasses:[]};
for(const p of files.filter(p=>/\.tsx?$/.test(p))){
 const src=fs.readFileSync(p,'utf8'),imports={},deps=[],styles=[];
 const importPattern=/^import\s+(?:([^;'"]+?)\s+from\s+)?['"]([^'"\n]+)['"];?/gm;
 for(const m of src.matchAll(importPattern)){
  const clause=m[1]||'',specifier=m[2],res=resolveImport(p,specifier);deps.push({from:specifier,resolved:res?rel(res):null});if(specifier.endsWith('.css'))styles.push(specifier);
  const named=clause.match(/\{([^}]+)\}/s);if(named)for(const field of named[1].split(',')){
   const parts=field.trim().replace(/^type\s+/,'').split(/\s+as\s+/);if(parts[0])imports[parts.at(-1)]={source:specifier,name:parts[0]};
  }
 }
 for(const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)){const res=resolveImport(p,m[1]);deps.push({from:m[1],resolved:res?rel(res):null,dynamic:true});}
 data.modules.push({path:rel(p),imports:deps,styles});
 for(const m of src.matchAll(/<([A-Za-z][\w.]*)\b([^>]*?)(?:\/?>)/gs)){
  const tag=m[1],attrs={};for(const a of m[2].matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*?)\})/gs))attrs[a[1]]=a[2]??a[3]??a[4];
  const info={path:rel(p),line:src.slice(0,m.index).split('\n').length,tag,attrs};
  if(['button','input','textarea','select'].includes(tag)&&!rel(p).startsWith('src/client/components/ui/'))data.nativeControls.push(info);
  if(imports[tag]?.name==='Button')data.buttonUsages.push({...info,source:imports[tag].source});
  if(/\bstyle=/.test(m[2]))data.inlineStyles.push(info);
  if(attrs.className&&/(?:^|[\s"'])dark(?:[\s"']|$)/.test(attrs.className))data.darkClasses.push(info);
 }
}
for(const p of files.filter(p=>p.endsWith('.css'))){
 const src=fs.readFileSync(p,'utf8'),ast=postcss.parse(src,{from:p}),rules=[];
 ast.walkRules(rule=>{
  let layer=null,parent=rule.parent;while(parent){if(parent.type==='atrule'&&parent.name==='layer'){layer=parent.params;break;}parent=parent.parent;}
  const entry={path:rel(p),line:rule.source.start.line,selector:rule.selector,layer,declarations:[]};
  rule.each(d=>{if(d.type!=='decl')return;const decl={path:rel(p),line:d.source.start.line,selector:rule.selector,layer,property:d.prop,value:d.value};entry.declarations.push(decl);data.cssDeclarations.push(decl);});
  rules.push(entry);data.cssRules.push(entry);
 });
 data.cssFiles.push({path:rel(p),lines:src.split('\n').length,rules:rules.length,unlayeredRules:rules.filter(x=>!x.layer).length});
}
const byPath=new Map(data.modules.map(m=>[m.path,m]));const reached=new Set();const visitPath=p=>{if(reached.has(p))return;reached.add(p);for(const d of byPath.get(p)?.imports||[])if(d.resolved)visitPath(d.resolved);};visitPath('src/client/main.tsx');data.reachableFromMain=[...reached].sort();data.unreferencedCss=data.cssFiles.filter(f=>!reached.has(f.path)).map(f=>f.path);
const counter=xs=>Object.fromEntries([...xs.reduce((m,x)=>m.set(x,(m.get(x)||0)+1),new Map())].sort((a,b)=>b[1]-a[1]));
data.summary={tsxFiles:files.filter(p=>p.endsWith('.tsx')).length,cssFiles:data.cssFiles.length,cssLines:data.cssFiles.reduce((n,x)=>n+x.lines,0),unlayeredFiles:data.cssFiles.filter(x=>x.unlayeredRules).map(x=>({path:x.path,rules:x.unlayeredRules})),nativeByTag:counter(data.nativeControls.map(x=>x.tag)),nativeInputsByType:counter(data.nativeControls.filter(x=>x.tag==='input').map(x=>x.attrs.type||'text')),buttonsByAPI:counter(data.buttonUsages.map(x=>x.source.match(/(?:^|\/)ui$/)?'compatibility':'primitive')),cssValues:Object.fromEntries(['font-size','border-radius','gap','height'].map(prop=>[prop,counter(data.cssDeclarations.filter(x=>x.property===prop).map(x=>x.value))]))};
console.log(JSON.stringify(data,null,2));
