// Run with JSON_RENDER_SOURCE pointing to the pinned research checkout.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const sourceRoot = process.env.JSON_RENDER_SOURCE;
if (!sourceRoot) throw Error('Set JSON_RENDER_SOURCE to the pinned json-render checkout with dependencies installed');
const requireSource = createRequire(resolve(sourceRoot, 'package.json'));
const requireProject = createRequire(new URL('../../../package.json', import.meta.url));
const { z } = requireSource('zod');
const { defineCatalog, validateSpec, createSpecStreamCompiler } = await import(pathToFileURL(resolve(sourceRoot,'packages/core/src/index.ts')).href);
const { schema } = await import(pathToFileURL(resolve(sourceRoot,'packages/react/src/schema.ts')).href);
const React = requireSource('react');
const { renderToStaticMarkup } = requireSource('react-dom/server');
const { defineRegistry, Renderer, JSONUIProvider } = await import(pathToFileURL(resolve(sourceRoot,'packages/react/src/renderer.tsx')).href);
const components={Text:{props:z.object({content:z.string()}),slots:[]}, Metric:{props:z.object({value:z.number()}),slots:[]}};
const catalog=defineCatalog(schema,{components,actions:{submit:{params:z.object({recordId:z.string()})}}});
const invalidProps={root:'r',elements:{r:{type:'Text',props:{content:123,unexpected:true},children:[]}}};
const full={root:'r',elements:{r:{type:'Text',props:{content:{$state:'/data/value'}},children:[],on:{press:{action:'submit',params:{recordId:'rec-1'}}},watch:{'/draft/x':{action:'submit'}}}},state:{data:{value:'real'},draft:{x:1}}};
const validated=catalog.validate(full);
const single=defineCatalog(schema,{components:{Text:components.Text}});
const compiler=createSpecStreamCompiler();
const first=compiler.push('{"op":"add","path":"/root","value":"r"}\n{"op":"add","path":"/elements/r","value":{"type":"Text","props":');
const second=compiler.push('{"content":"hello"},"children":[]}}\nmalformed-complete-line\n');
compiler.push('{"op":"add","path":"/state","value":');
const final=compiler.getResult();
const registry={Text:({element}:any)=>React.createElement('span',null,String(element.props.content ?? 'MISSING'))};
const render=(spec:any)=>renderToStaticMarkup(React.createElement(JSONUIProvider,{registry,initialState:spec.state??{}},React.createElement(Renderer,{spec,registry})));
let received: unknown;
const {executeAction}=defineRegistry(catalog,{components:{},actions:{submit:async(params)=>{received=params;}}});
await executeAction('submit',{recordId:42,extra:'accepted'},()=>{});
console.log(JSON.stringify({
 sourceCommit:'c6f73d7d5f69acb80fc89faefd12c0865c8603d1', node:process.version,zod:'4.6.5 (workspace dependency, source package declares ^4.3.6)',
 invalidPropsCatalogResult:catalog.validate(invalidProps),invalidPropsStructuralResult:validateSpec(invalidProps),
 singleComponentInvalidResult:single.validate(invalidProps).success,
 validatedFull:validated,originalFull:full,
 streaming:{firstPatchCount:first.newPatches.length,secondPatchCount:second.newPatches.length,final,patchCount:compiler.getPatches().length},
 malformedActionParamsReachedHandler:received,
 directRendererInvalidProps:render(invalidProps),rawFullRender:render(full),validatedFullRender:validated.success?render(validated.data):null
},null,2));
