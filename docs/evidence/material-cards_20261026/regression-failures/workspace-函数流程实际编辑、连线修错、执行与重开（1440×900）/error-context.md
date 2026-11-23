# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workspace.spec.ts >> 函数流程实际编辑、连线修错、执行与重开（1440×900）
- Location: tests/browser/workspace.spec.ts:150:3

# Error details

```
Error: expect(received).not.toBeNull()

Received: null
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e5]:
      - strong [ref=e11]: Flowcraft
      - generic [ref=e12]: LOCAL
    - generic [ref=e13]:
      - button "工作项" [ref=e14] [cursor=pointer]
      - button "全部流水线" [ref=e18] [cursor=pointer]
    - generic [ref=e21]: 已打开的流水线
    - navigation "已打开的流水线" [ref=e22]:
      - generic [ref=e23]:
        - button "自动验收 编辑与重开 1440 mvox6y1u" [ref=e24] [cursor=pointer]
        - button "关闭流水线 自动验收 编辑与重开 1440 mvox6y1u" [ref=e27] [cursor=pointer]
    - generic [ref=e28]:
      - generic [ref=e29]: 当前工作
      - button "输入材料" [ref=e30] [cursor=pointer]:
        - generic [ref=e35]:
          - strong [ref=e36]: 输入材料
          - generic [ref=e37]: 3 / 3 条已选
    - generic [ref=e40]:
      - button "模型设置 尚未配置" [ref=e41] [cursor=pointer]:
        - generic [ref=e45]:
          - strong [ref=e46]: 模型设置
          - generic [ref=e47]: 尚未配置
      - generic [ref=e48]: 实时同步
  - main [ref=e50]:
    - generic [ref=e51]:
      - generic [ref=e52]:
        - generic [ref=e53]:
          - text: 工作空间
          - heading "自动验收 编辑与重开 1440 mvox6y1u" [level=1] [ref=e54]
        - generic [ref=e55]:
          - generic [ref=e56]: 已保存
          - combobox "运行使用的做法" [ref=e59]:
            - option "当前草稿" [selected]
            - option "候选草稿"
          - button "直接输入运行" [ref=e60] [cursor=pointer]: 直接输入
          - button "运行流程" [ref=e61] [cursor=pointer]
      - generic [ref=e62]:
        - tablist "工作内容" [ref=e63]:
          - tab "流程" [ref=e64] [cursor=pointer]
          - tab "运行结果 1" [selected] [ref=e69] [cursor=pointer]:
            - text: 运行结果
            - generic [ref=e74]: "1"
          - tab "比较做法" [ref=e75] [cursor=pointer]
        - generic [ref=e83]: 候选草稿 · 1f8953da
      - generic [ref=e90]: 尚未选择默认模型，请在模型设置中添加目录模型并保存默认。
      - generic [ref=e94]:
        - button "返回运行列表" [ref=e96] [cursor=pointer]
        - generic [ref=e98]:
          - generic [ref=e99]:
            - generic [ref=e100]:
              - text: 运行记录
              - combobox "运行记录" [ref=e101]:
                - option "7:13:24 AM · 完整流程 · 已完成 · 1f8953da" [selected]
            - generic "已完成" [ref=e102]
          - generic [ref=e107]:
            - generic [ref=e108]: 做法 1f8953da · 候选
            - generic [ref=e109]: 6 条完成 / 6 个执行实例
            - generic [ref=e110]: 输入 3 条
          - region "成果检查" [ref=e112]:
            - generic [ref=e113]:
              - navigation "处理环节" [ref=e114]:
                - button "保留原始反馈与编号 已完成" [ref=e115] [cursor=pointer]:
                  - generic "保留原始反馈与编号" [ref=e116]
                  - generic "已完成" [ref=e117]
                - button "按内容分流 已完成" [ref=e122] [cursor=pointer]:
                  - generic "按内容分流" [ref=e123]
                  - generic "已完成" [ref=e124]
                - button "处理匹配材料 已完成" [ref=e129] [cursor=pointer]:
                  - generic "处理匹配材料" [ref=e130]
                  - generic "已完成" [ref=e131]
                - button "汇合全部材料 已完成" [ref=e136] [cursor=pointer]:
                  - generic "汇合全部材料" [ref=e137]
                  - generic "已完成" [ref=e138]
              - generic [ref=e143]:
                - generic [ref=e144]:
                  - generic [ref=e145]:
                    - heading "汇合全部材料" [level=3] [ref=e146]
                    - generic "已完成" [ref=e147]
                  - generic [ref=e152]:
                    - generic [ref=e153]:
                      - checkbox "选择此结果" [ref=e154]
                      - text: 选择
                    - button "从此结果改进" [ref=e155] [cursor=pointer]
                    - button "保留此结果" [ref=e156] [cursor=pointer]
                    - button "复制" [ref=e157] [cursor=pointer]
                - generic [ref=e158]:
                  - tablist [ref=e160]:
                    - tab "产物 3" [ref=e161] [cursor=pointer]
                    - tab "输入与依据" [active] [selected] [ref=e162] [cursor=pointer]
                    - tab "执行记录" [ref=e163] [cursor=pointer]
                  - tabpanel "输入与依据" [ref=e164]:
                    - heading "来源" [level=4] [ref=e165]
                    - generic [ref=e166]:
                      - button "上游 · 处理匹配材料" [ref=e168] [cursor=pointer]
                      - button "上游 · 按内容分流" [ref=e170] [cursor=pointer]
                      - generic [ref=e171]:
                        - article "界面顺手，但导出经常失败。" [ref=e172]:
                          - generic [ref=e173]:
                            - strong [ref=e177]: 界面顺手，但导出经常失败。
                            - code [ref=e178]: M01
                          - paragraph [ref=e179]: 正文 13 字符
                          - button "查看材料 界面顺手，但导出经常失败。（M01）" [ref=e181] [cursor=pointer]: 查看材料
                        - article "希望支持批量导出。" [ref=e182]:
                          - generic [ref=e183]:
                            - strong [ref=e187]: 希望支持批量导出。
                            - code [ref=e188]: M02
                          - paragraph [ref=e189]: 正文 9 字符
                          - button "查看材料 希望支持批量导出。（M02）" [ref=e191] [cursor=pointer]: 查看材料
                        - article "搜索变快，团队很满意。" [ref=e192]:
                          - generic [ref=e193]:
                            - strong [ref=e197]: 搜索变快，团队很满意。
                            - code [ref=e198]: M03
                          - paragraph [ref=e199]: 正文 11 字符
                          - button "查看材料 搜索变快，团队很满意。（M03）" [ref=e201] [cursor=pointer]: 查看材料
                    - generic [ref=e202]:
                      - generic [ref=e203]:
                        - heading "左路 · 固定输入 1 项" [level=4] [ref=e204]
                        - group [ref=e205]:
                          - generic "第 1 项 · 查看当时内容" [ref=e206] [cursor=pointer]
                      - generic [ref=e207]:
                        - heading "右路 · 固定输入 2 项" [level=4] [ref=e208]
                        - group [ref=e209]:
                          - generic "第 1 项 · 查看当时内容" [ref=e210] [cursor=pointer]
                        - group [ref=e211]:
                          - generic "第 2 项 · 查看当时内容" [ref=e212] [cursor=pointer]
      - generic [ref=e213]:
        - generic [ref=e214]:
          - strong [ref=e216]: 候选做法
          - generic [ref=e217]: 修改「保留原始反馈与编号」的配置 · 修改「按内容分流」的配置
        - generic [ref=e218]:
          - button "放弃候选" [ref=e219] [cursor=pointer]
          - button "采用做法" [ref=e220] [cursor=pointer]
```

# Test source

```ts
  26  |       id: 'branch',
  27  |       label: '按内容分流',
  28  |       kind: 'branch',
  29  |       mode: 'all',
  30  |       condition: { field: '', operator: 'contains', value: '最初条件' },
  31  |     },
  32  |     {
  33  |       id: 'matched',
  34  |       label: '处理匹配材料',
  35  |       kind: 'function',
  36  |       mode: 'each',
  37  |       functionName: 'identity',
  38  |     },
  39  |     {
  40  |       id: 'merge',
  41  |       label: '汇合全部材料',
  42  |       kind: 'function',
  43  |       mode: 'all',
  44  |       functionName: 'merge',
  45  |     },
  46  |   ],
  47  |   edges: [
  48  |     { from: ['$input', 'materials'], to: ['prepare', 'input'] },
  49  |     { from: ['prepare', 'output'], to: ['branch', 'input'] },
  50  |     { from: ['branch', 'matched'], to: ['matched', 'input'] },
  51  |     { from: ['matched', 'output'], to: ['merge', 'left'] },
  52  |     { from: ['branch', 'unmatched'], to: ['merge', 'right'] },
  53  |   ],
  54  |   outputs: { result: ['merge', 'output'] },
  55  | });
  56  | 
  57  | async function snapshot(
  58  |   request: APIRequestContext,
  59  |   id: string,
  60  | ): Promise<Snapshot> {
  61  |   const response = await request.get(`/api/works/${id}`);
  62  |   expect(response.ok()).toBeTruthy();
  63  |   return response.json();
  64  | }
  65  | async function createWork(request: APIRequestContext, width: number) {
  66  |   const response = await request.post('/api/works', {
  67  |     data: {
  68  |       goal: `自动验收 编辑与重开 ${width} ${Date.now().toString(36)}`,
  69  |       materials,
  70  |     },
  71  |   });
  72  |   expect(response.status()).toBe(201);
  73  |   const initial = (await response.json()) as Snapshot;
  74  |   const id = initial.work.id;
  75  |   const saved = await request.post(`/api/works/${id}/actions`, {
  76  |     data: { action: 'saveDraft', definition: functionFlow() },
  77  |   });
  78  |   expect(saved.ok()).toBeTruthy();
  79  |   const layout = await request.post(`/api/works/${id}/actions`, {
  80  |     data: {
  81  |       action: 'saveLayout',
  82  |       view: {
  83  |         positions: {
  84  |           $input: { x: 0, y: 30 },
  85  |           prepare: { x: 300, y: 30 },
  86  |           branch: { x: 600, y: 30 },
  87  |           matched: { x: 300, y: 300 },
  88  |           merge: { x: 600, y: 300 },
  89  |         },
  90  |         viewport: { x: 20, y: 30, zoom: 0.38 },
  91  |       },
  92  |     },
  93  |   });
  94  |   expect(layout.ok()).toBeTruthy();
  95  |   return initial.work;
  96  | }
  97  | async function saveInBrowser(page: Page, id: string): Promise<Snapshot> {
  98  |   const response = page.waitForResponse(
  99  |     (r) =>
  100 |       r.url().endsWith(`/api/works/${id}/actions`) &&
  101 |       r.request().postDataJSON()?.action === 'saveDraft',
  102 |   );
  103 |   await page.getByRole('button', { name: '保存修改', exact: true }).click();
  104 |   const saved = await response;
  105 |   expect(saved.ok()).toBeTruthy();
  106 |   await expect(
  107 |     page.getByRole('button', { name: '保存修改', exact: true }),
  108 |   ).toHaveCount(0);
  109 |   return saved.json();
  110 | }
  111 | async function expectNoHorizontalOverflow(page: Page, width: number) {
  112 |   const measurements = await page.evaluate(() => ({
  113 |     document: document.documentElement.scrollWidth,
  114 |     body: document.body.scrollWidth,
  115 |     viewport: window.innerWidth,
  116 |   }));
  117 |   expect(measurements.viewport).toBe(width);
  118 |   expect(measurements.document).toBeLessThanOrEqual(width);
  119 |   expect(measurements.body).toBeLessThanOrEqual(width);
  120 |   for (const locator of [
  121 |     page.locator('.workspace-header'),
  122 |     page.locator('.context-panel'),
  123 |     page.getByRole('button', { name: '运行流程', exact: true }),
  124 |   ]) {
  125 |     const bounds = await locator.boundingBox();
> 126 |     expect(bounds).not.toBeNull();
      |                        ^ Error: expect(received).not.toBeNull()
  127 |     expect(bounds!.x).toBeGreaterThanOrEqual(0);
  128 |     expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
  129 |   }
  130 | }
  131 | 
  132 | async function inspectCompletedRun(page: Page) {
  133 |   const overview = page.getByRole('region', { name: '流水线运行结果总览' });
  134 |   await expect(overview).toContainText('已完成');
  135 |   await overview.getByRole('button', { name: '查看过程', exact: true }).click();
  136 |   const result = page.locator('.final-result:not([hidden])');
  137 |   await expect(result).toBeVisible();
  138 |   for (const summary of await result
  139 |     .locator('.item-output-entry > summary')
  140 |     .all()) {
  141 |     await summary.click();
  142 |   }
  143 |   return result;
  144 | }
  145 | 
  146 | for (const [width, height] of [
  147 |   [1440, 900],
  148 |   [1024, 768],
  149 | ]) {
  150 |   test(`函数流程实际编辑、连线修错、执行与重开（${width}×${height}）`, async ({
  151 |     page,
  152 |     request,
  153 |   }, testInfo) => {
  154 |     await page.setViewportSize({ width, height });
  155 |     const errors: string[] = [];
  156 |     page.on('pageerror', (error) => errors.push(error.message));
  157 |     const work = await createWork(request, width);
  158 |     // 侧栏只列显式打开的流水线（opened-pipelines 语义）；
  159 |     // 预置本浏览器的打开入口，等价于用户此前已打开该工作。
  160 |     await page.addInitScript((id) => {
  161 |       localStorage.setItem(
  162 |         'dynamic-flow.opened-works',
  163 |         JSON.stringify([{ id, goal: '', updatedAt: '' }]),
  164 |       );
  165 |       localStorage.setItem('dynamic-flow.work', id);
  166 |     }, work.id);
  167 |     await page.goto('/');
  168 |     await page
  169 |       .locator('.work-list')
  170 |       .getByRole('button', { name: work.goal, exact: true })
  171 |       .click();
  172 |     await expect(
  173 |       page.getByRole('heading', { name: work.goal, exact: true }),
  174 |     ).toBeVisible();
  175 |     await page.getByRole('button', { name: '输入材料', exact: true }).click();
  176 |     const materialDialog = page.getByRole('dialog', { name: '输入材料' });
  177 |     await expect(materialDialog.locator('.material-card')).toHaveCount(3);
  178 |     await materialDialog
  179 |       .getByRole('button', { name: '清空', exact: true })
  180 |       .click();
  181 |     await expect(
  182 |       materialDialog.getByRole('checkbox', { checked: true }),
  183 |     ).toHaveCount(0);
  184 |     await materialDialog
  185 |       .getByRole('button', { name: '全选', exact: true })
  186 |       .click();
  187 |     await expect(
  188 |       materialDialog.getByRole('checkbox', { checked: true }),
  189 |     ).toHaveCount(3);
  190 |     await materialDialog
  191 |       .getByRole('button', { name: '完成选择', exact: true })
  192 |       .click();
  193 |     await page.locator('.react-flow__node[data-id="prepare"]').click();
  194 |     await page
  195 |       .getByLabel('步骤名称', { exact: true })
  196 |       .fill('保留原始反馈与编号');
  197 |     const renamed = await saveInBrowser(page, work.id);
  198 |     expect(
  199 |       renamed.definitions[renamed.work.draftId!].nodes.find(
  200 |         (n) => n.id === 'prepare',
  201 |       )?.label,
  202 |     ).toBe('保留原始反馈与编号');
  203 |     await expect(
  204 |       page.locator('.react-flow__node[data-id="prepare"]'),
  205 |     ).toContainText('保留原始反馈与编号');
  206 | 
  207 |     await page.locator('.react-flow__node[data-id="branch"]').click();
  208 |     await page.getByLabel('值', { exact: true }).fill('失败');
  209 |     const configured = await saveInBrowser(page, work.id);
  210 |     expect(
  211 |       configured.definitions[configured.work.draftId!].nodes.find(
  212 |         (n) => n.id === 'branch',
  213 |       )?.condition?.value,
  214 |     ).toBe('失败');
  215 |     await expectNoHorizontalOverflow(page, width);
  216 | 
  217 |     // Create a real invalid duplicate input through the same connection controls users operate.
  218 |     await page.getByText('添加连接', { exact: true }).click();
  219 |     await page
  220 |       .getByRole('combobox', { name: '来自', exact: true })
  221 |       .selectOption('$input::materials');
  222 |     await page
  223 |       .getByRole('button', { name: '连接到此步骤', exact: true })
  224 |       .click();
  225 |     const invalid = await saveInBrowser(page, work.id);
  226 |     expect(
```