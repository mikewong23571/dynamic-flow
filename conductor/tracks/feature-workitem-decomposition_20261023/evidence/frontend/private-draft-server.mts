import { createApplication } from '/home/mike/projs/fork/dynamic-flow/src/server/index.ts';
import { serve } from '/home/mike/projs/fork/dynamic-flow/node_modules/@hono/node-server/dist/index.mjs';
import {mkdtemp,writeFile} from 'node:fs/promises';
const root=await mkdtemp('/tmp/flowcraft-draft-regression-');
const application=await createApplication({dataRoot:root});
const server=serve({fetch:application.app.fetch,port:34321,hostname:'127.0.0.1'});
await writeFile('/tmp/flowcraft-draft-regression.json',JSON.stringify({root,pid:process.pid}));
console.log('private draft regression http://127.0.0.1:34321');
process.on('SIGTERM',()=>{application.runs.close();server.closeAllConnections();server.close(()=>process.exit(0));});
