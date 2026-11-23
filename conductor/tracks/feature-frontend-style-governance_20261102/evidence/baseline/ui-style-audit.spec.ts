import { test, expect, type APIRequestContext } from './fixtures';
import type { Definition } from '../../src/shared/records';
import type { ItemWorkspace } from '../../src/shared/workitem-composition';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const source = `root = Workspace("反馈处理", [records, form])
$selected = []
$draft = {}
records = Records("rows", "处理清单", "id", [Field("id", "编号"), Field("title", "反馈"), Field("status", "状态")], $selected, [next], [Field("title", "反馈内容"), Field("reason", "依据")])
next = ActionButton("继续所选记录", @Run(continueStep))
continueStep = Mutation("continue_records", {output: "rows", recordIds: $selected, inputPort: "materials"})
form = InputForm("request", "补充范围", $draft, save)
save = ActionButton("保存输入", @Run(saveInput))
saveInput = Mutation("submit_input", {inputPort: "request", value: $draft})`;
const rows = [
  {
    id: 'R1',
    alternate: 'S1',
    title: '导出失败',
    status: '需核对',
    reason: '原始反馈一',
  },
  {
    id: 'R2',
    alternate: 'S2',
    title: '批量导出',
    status: '待确认',
    reason: '原始反馈二',
  },
];
async function action(
  request: APIRequestContext,
  id: string,
  name: string,
  fields: Record<string, unknown> = {},
) {
  const before = await request.get(`/api/items/${id}/workspace`);
  const ws = (await before.json()) as ItemWorkspace;
  const response = await request.post(`/api/items/${id}/workspace/actions`, {
    data: { action: name, baseRevision: ws.item.revision, ...fields },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as ItemWorkspace;
}
async function seed(request: APIRequestContext) {
  const response = await request.post('/api/items', {
    data: {
      title: 'OpenUI反馈闭环',
      goal: '整理反馈、补范围并检查实际处理过程',
      materials: ['用户报告导出失败', '用户希望批量导出'],
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const item = await response.json();
  let ws = (await (
    await request.get(`/api/items/${item.id}/workspace`)
  ).json()) as ItemWorkspace;
  const definition: Definition = {
    schemaVersion: 1,
    inputs: ['materials', 'request'],
    inputContracts: {
      request: {
        required: false,
        item: {
          type: 'object',
          properties: {
            scope: { type: 'string', title: '适用范围', minLength: 1 },
            channel:{type:'string',title:'渠道',enum:['桌面','网页']},
            notes:{type:'string',title:'备注',maxLength:500},
          },
          required: ['scope'],
          additionalProperties: false,
        },
      },
    },
    nodes: [
      {
        id: 'prepare',
        label: '整理反馈',
        kind: 'function',
        functionName: 'expression',
        operation: 'aggregate',
        expression: { kind: 'literal', value: rows },
      },
    ],
    edges: [{ from: ['$input', 'materials'], to: ['prepare', 'input'] }],
    outputs: { rows: ['prepare', 'output'] },
  };
  ws = await action(request, item.id, 'saveFlow', {
    definition,
    expectedDraftId: ws.work!.work.draftId,
  });
  ws = await action(request, item.id, 'selectInputs', {
    inputPort: 'materials',
    materialIds: ws.item.materials.map((m) => m.id),
  });
  ws = await action(request, item.id, 'saveUiProgram', {
    definitionId: ws.work!.work.draftId,
    source,
  });
  ws = await action(request, item.id, 'run');
  await expect
    .poll(async () => {
      ws = await (await request.get(`/api/items/${item.id}/workspace`)).json();
      return ws.work!.work.runs.at(-1)?.status;
    })
    .toBe('completed');
  ws = await action(request, item.id, 'publishDelivery', {
    runId: ws.work!.work.runs.at(-1)!.id,
    output: 'rows',
    programId: ws.uiProgram!.id,
  });
  return ws;
}

const evidence = process.env.FLOWCRAFT_EVIDENCE_DIR || 'test-results/style-audit';
test('frontend style audit', async ({page, request}) => {
 await mkdir(evidence,{recursive:true});
 const ws=await seed(request);
 const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 const measure=async(name:string)=>{
   await page.screenshot({path:join(evidence,name+'.png')});
   console.log(name,JSON.stringify(await page.evaluate(()=>({
    viewport:[innerWidth,innerHeight],scroll:[document.documentElement.scrollWidth,document.documentElement.clientWidth],
    layout:[...document.querySelectorAll('.field,.modal-actions,fieldset,.openui-workspace,.openui-content,.openui-stack,.openui-view,.modal')].filter(e=>(e as HTMLElement).getBoundingClientRect().height).map(e=>{const c=getComputedStyle(e);return {class:e.className,margin:c.margin,gap:c.gap,padding:c.padding,display:c.display,width:e.getBoundingClientRect().width,fontSize:c.fontSize}}),
    controls:[...document.querySelectorAll('button,input,select,textarea')].filter(e=>(e as HTMLElement).getBoundingClientRect().width && (e as HTMLElement).getBoundingClientRect().height).map(e=>{
      const c=getComputedStyle(e);const r=e.getBoundingClientRect();return {tag:e.tagName,slot:e.getAttribute('data-slot'),text:e.getAttribute('aria-label')||e.textContent?.trim().slice(0,45),class:e.className,font:c.fontFamily,fontSize:c.fontSize,weight:c.fontWeight,height:r.height,width:r.width,padding:c.padding,border:c.borderRadius,color:c.color,background:c.backgroundColor};
    })
   }))));
 };
 await page.goto('/items/'+ws.item.id+'?tab=results');
 await expect(page.locator('[data-openui-renderer="official"]')).toBeVisible();
 await page.getByRole('textbox',{name:'适用范围',exact:true}).fill('Desktop UI');
 await page.getByRole('checkbox',{name:'选择记录 R2',exact:true}).check();
 await measure('item-1440');
 await page.setViewportSize({width:1024,height:768});
 await measure('item-1024');
 console.log('OCCLUSION',JSON.stringify(await page.getByRole('button',{name:'保存输入',exact:true}).evaluate(el=>{
 const r=el.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {button:{x:r.x,y:r.y,width:r.width,height:r.height},top:top?.outerHTML.slice(0,180),panel:top?.closest('aside')?.getAttribute('aria-label'),covered:!el.contains(top)};
 })));
 await page.reload();await expect(page.locator('[data-openui-renderer="official"]')).toBeVisible();await measure('item-1024-fresh');
 await page.setViewportSize({width:1440,height:900});
 await page.getByRole('button',{name:'查看记录 R2',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await measure('record-dialog');
 await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
 await page.goto('/methods/'+ws.item.workId);
 await expect(page.locator('.canvas').first()).toBeVisible();
 await measure('method-1440');
 console.log('METHOD_SNAPSHOT',await page.locator('body').innerText());
 await page.locator('.react-flow__node').filter({hasText:'整理反馈'}).click();
 await page.getByRole('button',{name:'步骤配置',exact:true}).click();
 await measure('inspector-1440');
 await page.setViewportSize({width:1024,height:768});
 await measure('inspector-1024');
 await page.locator('.model-settings-button').click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await measure('settings-1024');
 await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
 await page.goto('/items');await expect(page.getByText('OpenUI反馈闭环',{exact:true}).first()).toBeVisible();await measure('items-list-1024');
 await page.setViewportSize({width:1440,height:900});await measure('items-list-1440');
 await page.goto('/methods');await expect(page.locator('.management-content')).toBeVisible();await measure('methods-list-1440');
 await page.setViewportSize({width:1024,height:768});await measure('methods-list-1024');
 console.log('ERRORS',errors);
});
