// Run with JSON_RENDER_SOURCE pointing to the pinned research checkout.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const sourceRoot = process.env.JSON_RENDER_SOURCE;
if (!sourceRoot) throw Error('Set JSON_RENDER_SOURCE to the pinned json-render checkout with dependencies installed');
const requireSource = createRequire(resolve(sourceRoot, 'package.json'));
const requireProject = createRequire(new URL('../../../package.json', import.meta.url));
const React = requireSource('react');
const { renderToStaticMarkup } = requireSource('react-dom/server');
const Ajv = requireProject('ajv');
const { Renderer, JSONUIProvider } = await import(pathToFileURL(resolve(sourceRoot,'packages/react/src/renderer.tsx')).href);
// One canonical JSON Schema; no defineCatalog, defineRegistry, or Zod prop definitions.
const canonical={type:'object',properties:{content:{type:'string'}},required:['content'],additionalProperties:false};
const ajv=new Ajv({allErrors:true});
const check=ajv.compile(canonical);
const registry={Text:({element}:any)=>{
 if(!check(element.props))throw new Error(JSON.stringify(check.errors));
 return React.createElement('span',null,element.props.content);
}};
const valid={root:'r',elements:{r:{type:'Text',props:{content:{$state:'/results/record1/content'}},children:[]}}};
const invalid={root:'r',elements:{r:{type:'Text',props:{content:123},children:[]}}};
const render=(spec:any)=>renderToStaticMarkup(React.createElement(JSONUIProvider,{registry,initialState:{results:{record1:{content:'real saved result'}}}},React.createElement(Renderer,{spec,registry})));
const good=render(valid);
let rejected=false,errors='';
try {render(invalid)}catch(e){rejected=true;errors=String(e)}
console.log(JSON.stringify({node:process.version,sourceCommit:'c6f73d7d5f69acb80fc89faefd12c0865c8603d1',canonicalSchema:canonical,rendered:good,invalidResolvedPropsRejected:rejected,errors},null,2));
