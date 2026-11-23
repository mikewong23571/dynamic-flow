import { test, expect } from './fixtures';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Definition } from '../../src/shared/records';

const definition: Definition = {
  schemaVersion: 1,
  inputs: ['items', 'supplement'],
  inputContracts: {
    supplement: {
      required: false,
      item: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          note: { type: 'string', title: '补充说明', maxLength: 1000 },
          channel: {type:'string',title:'处理渠道',enum:['桌面客户端','网页客户端']},
          confirmed: {type:'boolean',title:'已核实'},
        },
        required: ['id', 'note'],
      },
    },
  },
  nodes: [
    {
      id: 'copy',
      label: '整理内容',
      kind: 'function',
      operation: 'map',
      functionName: 'identity',
    },
  ],
  edges: [{ from: ['$input', 'items'], to: ['copy', 'input'] }],
  outputs: { rows: ['copy', 'output'] },
};
const source = `root = Workspace("记录处理", [header, items, more, editor])
state = Query("read_workspace", {}, {item: {}}, 1)
data = Query("read_inputs", {inputPort: "items"}, {rows: []}, 1)
result = Query("read_output", {output: "rows"}, {run: null, rows: []}, 1)
$draft = {}
$editing = false
header = Stack([TextContent("逐项查看内容并补充说明"), start], "horizontal")
start = ActionButton("处理这些内容", @Run(execute), "primary", state.item.execution.status == "running")
execute = Mutation("execute", {})
items = @Each(data.rows, "row", Section(row.title, [Stack([TextContent(row.note), ActionButton("补充说明", Action([@Set($draft, {id: row.id}), @Set($editing, true)]), "secondary")], "horizontal")]))
more = Disclosure("查看本次处理内容", [DataTable("", result.rows, "id", [Field("title", "内容"), Field("note", "说明")])])
editor = Dialog("补充当前记录", $editing, [form])
form = InputForm("supplement", "", $draft, save, null, null, ["note", "channel", "confirmed"])
save = ActionButton("保存说明", Action([@Run(submit), @Set($editing, false), @Reset($draft)]), "primary")
submit = Mutation("submit_input", {inputPort: "supplement", value: $draft})`;


const evidence=process.env.FLOWCRAFT_EVIDENCE_DIR || 'test-results/hierarchy-audit';
for(const width of [1440,1024])test(`deep UI hierarchy audit ${width}`,async({page,application})=>{
 await mkdir(evidence,{recursive:true});
 await page.setViewportSize({width,height:width===1440?900:768});
 const item=await application.items.create({title:'组件层次审查样例',goal:'检查组合、字段及任务动作',materials:[]});
 let ws=await application.composition.snapshot(item.id);
 ws=await application.composition.saveFlow(item.id,ws.item.revision,definition,ws.work!.work.draftId);
 for(const value of [{id:'A',title:'第一项：长内容阅读及任务动作',note:'这是一份用于验证组件组合间距的合成材料。'.repeat(8)},{id:'B',title:'第二项',note:'检查输入、选择器及保存失败'}])ws=await application.composition.addInput(item.id,ws.item.revision,'items',value.title,value);
 ws=await application.composition.saveUiProgram(item.id,ws.item.revision,{definitionId:ws.work!.work.draftId,source});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`/items/${item.id}`);
 const ui=page.locator('[data-openui-renderer="official"]');await expect(ui.getByRole('heading',{name:'第二项',exact:true})).toBeVisible();
 const metrics:any={width,stages:[]};
 const measure=async(stage:string)=>{
  await page.screenshot({path:join(evidence,`deep-${width}-${stage}.png`)});
  metrics.stages.push({stage,...await page.evaluate(()=>({
   rootDarkClass:document.documentElement.classList.contains('dark'),bodyDarkClass:document.body.classList.contains('dark'),rootFont:getComputedStyle(document.documentElement).fontSize,
   scroll:[document.documentElement.scrollWidth,innerWidth],
   elements:[...document.querySelectorAll('.openui-workspace,.openui-section,.openui-stack,.openui-content,.field,.modal-actions,[role=dialog],fieldset,[data-slot=input],[data-slot=textarea],[data-slot=native-select],[data-slot=button]')].filter(el=>el.getBoundingClientRect().width&&el.getBoundingClientRect().height).map(el=>{
    const c=getComputedStyle(el),r=el.getBoundingClientRect();return {tag:el.tagName,slot:el.getAttribute('data-slot'),class:el.className,label:el.getAttribute('aria-label')||el.textContent?.trim().slice(0,48),width:r.width,height:r.height,margin:c.margin,padding:c.padding,gap:c.gap,font:c.fontFamily,fontSize:c.fontSize,outline:c.outline,boxShadow:c.boxShadow,disabled:(el as HTMLInputElement).matches(':disabled'),color:c.color,background:c.backgroundColor};
   })
  }))});
 };
 await measure('composition');
 const second=ui.locator('section').filter({has:page.getByRole('heading',{name:'第二项',exact:true})});
 const trigger=second.getByRole('button',{name:'补充说明',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog',{name:'补充当前记录',exact:true});await expect(dialog).toBeVisible();
 await dialog.getByRole('textbox',{name:'补充说明',exact:true}).fill('保留这份未提交输入');
 await measure('dialog');
 let fail=true;await page.route(`**/api/items/${item.id}/workspace/actions`,async route=>{
  if(fail&&route.request().postDataJSON().action==='addInput'){fail=false;await route.fulfill({status:503,json:{error:'审查夹具：保存暂时失败，请重试'}});}else await route.continue();
 });
 const save=dialog.getByRole('button',{name:'保存说明',exact:true});await save.click();
 await expect(dialog.getByRole('alert')).toContainText('保存暂时失败');await expect(dialog.getByRole('textbox',{name:'补充说明',exact:true})).toHaveValue('保留这份未提交输入');
 await save.focus();await measure('error-focus');
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
 await expect.poll(()=>trigger.evaluate(el=>el===document.activeElement),{timeout:1000}).toBe(true).catch(()=>{});
 metrics.focusRestored=await trigger.evaluate(el=>el===document.activeElement);
 metrics.focusAfterClose=await page.evaluate(()=>({tag:document.activeElement?.tagName,role:document.activeElement?.getAttribute('role'),label:document.activeElement?.getAttribute('aria-label')}));
 await ui.getByRole('button',{name:'处理这些内容',exact:true}).click();
 await expect.poll(async()=>(await application.items.get(item.id)).execution?.status).toBe('completed');
 await ui.getByText('查看本次处理内容',{exact:true}).click();await expect(ui.getByRole('table')).toBeVisible();await measure('disclosure-table');
 await application.work.createWork('独立可复用流水线',[]);
 await page.goto('/methods');await expect(page.getByRole('table')).toBeVisible();
 await page.getByRole('button',{name:/更多操作/}).first().click();await expect(page.getByRole('menu')).toBeVisible();await measure('menu');await page.keyboard.press('Escape');
 metrics.errors=errors;await writeFile(join(evidence,`deep-${width}.json`),JSON.stringify(metrics,null,2));expect(errors).toEqual([]);
});
