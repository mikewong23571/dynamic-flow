# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workitem-composition-review.spec.ts >> 独立复核：直接输入和长会话后仍可继续 1440
- Location: tests/browser/workitem-composition-review.spec.ts:186:3

# Error details

```
Error: expect(received).toBeTruthy()

Received: false

Call Log:
- Timeout 15000ms exceeded while waiting on the predicate
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
      - paragraph [ref=e23]: 尚未打开流水线
    - generic [ref=e24]:
      - button "模型设置 explicit-review-fixture" [ref=e25] [cursor=pointer]:
        - generic [ref=e29]:
          - strong [ref=e30]: 模型设置
          - generic [ref=e31]: explicit-review-fixture
      - generic [ref=e32]: 本地工作空间
  - main [ref=e34]:
    - region "工作项管理" [ref=e36]:
      - region "工作项详情" [ref=e37]:
        - generic [ref=e38]:
          - button "返回工作项列表" [ref=e39] [cursor=pointer]
          - heading "直接描述当前任务" [level=1] [ref=e40]
          - generic "待推进" [ref=e41]
          - generic [ref=e52]:
            - button "目标" [ref=e53] [cursor=pointer]
            - button "工作项更多操作" [ref=e54] [cursor=pointer]
        - generic [ref=e55]:
          - generic [ref=e56]:
            - tablist "工作项视图" [ref=e57]:
              - tab "成果" [ref=e58] [cursor=pointer]
              - tab "流程" [selected] [ref=e59] [cursor=pointer]
              - tab "输入" [ref=e60] [cursor=pointer]
              - tab "记录" [ref=e61] [cursor=pointer]
            - button "完成条件 0/0" [ref=e62] [cursor=pointer]:
              - text: 完成条件
              - generic [ref=e63]: 0/0
          - generic [ref=e64]:
            - main [ref=e65]:
              - tabpanel "流程" [ref=e66]:
                - generic [ref=e67]:
                  - button "子工作项" [ref=e68] [cursor=pointer]
                  - generic [ref=e70]:
                    - button "运行本轮" [disabled]
                - generic [ref=e71]:
                  - generic [ref=e72]:
                    - generic [ref=e73]:
                      - combobox "选择可复用方法" [ref=e75]:
                        - option "选择已有方法…" [selected]
                      - button "调用方法" [disabled]
                    - generic [ref=e76]:
                      - button "添加分析" [ref=e77] [cursor=pointer]
                      - button "添加数据步骤" [ref=e78] [cursor=pointer]
                    - generic [ref=e79]:
                      - generic [ref=e80]: 已保存
                      - button "步骤配置" [ref=e81] [cursor=pointer]
                  - application [ref=e84]:
                    - group [ref=e87]:
                      - generic [ref=e88]:
                        - generic [ref=e94]:
                          - generic [ref=e95]: 输入
                          - strong [ref=e96]: 工作材料
                        - generic [ref=e97]: 原始材料
                        - generic [ref=e99]:
                          - generic: 1 输出
                          - generic [ref=e102]:
                            - generic "材料" [ref=e103]
                            - generic "输出 材料" [ref=e104]
                    - generic "Control Panel" [ref=e105]:
                      - button "Zoom In" [ref=e106] [cursor=pointer]
                      - button "Zoom Out" [ref=e109] [cursor=pointer]
                      - button "Fit View" [ref=e112] [cursor=pointer]
                    - generic [ref=e116]:
                      - button "整理布局" [ref=e117] [cursor=pointer]
                      - button "聚焦连接" [pressed] [ref=e119] [cursor=pointer]
                      - button "显示端口" [ref=e121] [cursor=pointer]
                    - link "React Flow attribution" [ref=e124] [cursor=pointer]:
                      - /url: https://reactflow.dev?utm_source=attribution
                      - text: React Flow
            - complementary "工作项 Assistant" [ref=e126]:
              - generic [ref=e127]:
                - strong [ref=e128]: Assistant
                - button "收起工作项 Assistant" [ref=e132] [cursor=pointer]
              - strong [ref=e134]: 当前工作项
              - generic [ref=e135]:
                - generic [ref=e136]:
                  - generic [ref=e137]:
                    - generic [ref=e138]: 整个流程
                    - paragraph [ref=e140]: 请先核对需求中的缺口，不修改流程。
                  - generic [ref=e141]:
                    - generic [ref=e142]: Assistant
                    - generic [ref=e146]: explicit-review-fixture · medium · 跟随默认
                    - generic [ref=e147]:
                      - paragraph [ref=e148]: 核对记录 1：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e149]: 核对记录 2：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e150]: 核对记录 3：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e151]: 核对记录 4：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e152]: 核对记录 5：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e153]: 核对记录 6：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e154]: 核对记录 7：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e155]: 核对记录 8：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e156]: 核对记录 9：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e157]: 核对记录 10：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e158]: 核对记录 11：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e159]: 核对记录 12：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e160]: 核对记录 13：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e161]: 核对记录 14：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e162]: 核对记录 15：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e163]: 核对记录 16：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e164]: 核对记录 17：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e165]: 核对记录 18：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e166]: 核对记录 19：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e167]: 核对记录 20：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e168]: 核对记录 21：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e169]: 核对记录 22：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e170]: 核对记录 23：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e171]: 核对记录 24：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e172]: 核对记录 25：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e173]: 核对记录 26：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e174]: 核对记录 27：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e175]: 核对记录 28：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e176]: 核对记录 29：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e177]: 核对记录 30：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e178]: 核对记录 31：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e179]: 核对记录 32：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e180]: 核对记录 33：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e181]: 核对记录 34：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e182]: 核对记录 35：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e183]: 核对记录 36：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e184]: 核对记录 37：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e185]: 核对记录 38：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e186]: 核对记录 39：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e187]: 核对记录 40：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e188]: 核对记录 41：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e189]: 核对记录 42：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e190]: 核对记录 43：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e191]: 核对记录 44：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e192]: 核对记录 45：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e193]: 核对记录 46：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e194]: 核对记录 47：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e195]: 核对记录 48：这是一段明确的测试会话，用于检查长消息后的输入位置和未发送草稿保留。
                      - paragraph [ref=e196]: 独立长会话结束标记
                - generic [ref=e197]:
                  - textbox "对话修改" [ref=e198]:
                    - /placeholder: 说说接下来要做什么…
                  - generic [ref=e199]:
                    - generic [ref=e200]:
                      - generic [ref=e201]: ⌘ / Ctrl + Enter 发送
                      - combobox "本工作的模型" [ref=e202] [cursor=pointer]:
                        - generic [ref=e203]: 跟随默认：explicit-review-fixture
                    - button "发送修改" [ref=e205] [cursor=pointer]: 发送
```

# Test source

```ts
  74  |   server = serve({
  75  |     fetch: application.app.fetch,
  76  |     hostname: '127.0.0.1',
  77  |     port: 0,
  78  |   }) as Server;
  79  |   if (!server.listening)
  80  |     await new Promise<void>((done) => server.once('listening', done));
  81  |   url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  82  |   await mkdir(evidence, { recursive: true });
  83  | });
  84  | test.afterEach(async () => {
  85  |   application?.batches.close();
  86  |   application?.runs.close();
  87  |   if (server) {
  88  |     server.closeAllConnections();
  89  |     await new Promise<void>((done) => server.close(() => done()));
  90  |   }
  91  |   if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
  92  |   expect(browserErrors).toEqual([]);
  93  | });
  94  | 
  95  | async function post<T>(path: string, body: unknown): Promise<T> {
  96  |   const response = await fetch(url + path, {
  97  |     method: 'POST',
  98  |     headers: { 'content-type': 'application/json' },
  99  |     body: JSON.stringify(body),
  100 |   });
  101 |   const text = await response.text();
  102 |   expect(response.ok, `${path}: ${text}`).toBeTruthy();
  103 |   return JSON.parse(text) as T;
  104 | }
  105 | async function createItem(title: string, fields: Record<string, unknown> = {}) {
  106 |   return post<WorkItemView>('/api/items', {
  107 |     title,
  108 |     goal: `按明确依据完成${title}`,
  109 |     materials: ['本项独立原始资料'],
  110 |     criteria: [],
  111 |     ...fields,
  112 |   });
  113 | }
  114 | async function act(id: string, fields: Record<string, unknown>) {
  115 |   return post<WorkItemView>(`/api/items/${id}/actions`, fields);
  116 | }
  117 | async function workspace(id: string, fields: Record<string, unknown>) {
  118 |   return post<ItemWorkspace>(`/api/items/${id}/workspace/actions`, fields);
  119 | }
  120 | async function confirmLeaf(item: WorkItemView) {
  121 |   const saved = await act(item.id, {
  122 |     action: 'criteria',
  123 |     criteria: [
  124 |       { id: 'reviewed', text: '资料有明确核对结论', met: false, evidence: '' },
  125 |     ],
  126 |   });
  127 |   await act(item.id, {
  128 |     action: 'criteria',
  129 |     criteria: saved.criteria.map((criterion) => ({
  130 |       ...criterion,
  131 |       met: true,
  132 |       evidence: '人工核查本项资料，结论及来源可检查。',
  133 |     })),
  134 |   });
  135 |   await act(item.id, { action: 'complete' });
  136 | }
  137 | async function openItem(page: Page, item: WorkItemView) {
  138 |   await page.goto(url);
  139 |   await page.getByRole('button', { name: '工作项', exact: true }).click();
  140 |   await page
  141 |     .getByRole('textbox', { name: '搜索工作项', exact: true })
  142 |     .fill(item.key);
  143 |   await page.getByRole('button', { name: '搜索', exact: true }).click();
  144 |   await page
  145 |     .getByRole('button', { name: `打开工作项 ${item.key}`, exact: true })
  146 |     .click();
  147 |   await expect(
  148 |     page.getByRole('heading', { name: item.title, exact: true }),
  149 |   ).toBeVisible();
  150 | }
  151 | async function acceptance(page: Page) {
  152 |   await page
  153 |     .getByRole('button', { name: /^完成条件/ })
  154 |     .first()
  155 |     .click();
  156 |   const dialog = page.getByRole('dialog', { name: '完成条件', exact: true });
  157 |   await expect(dialog).toBeVisible();
  158 |   return dialog;
  159 | }
  160 | async function visibleInsideViewport(locator: Locator) {
  161 |   await expect(locator).toBeVisible();
  162 |   await expect
  163 |     .poll(async () =>
  164 |       locator.evaluate((element) => {
  165 |         const rect = element.getBoundingClientRect();
  166 |         return (
  167 |           rect.top >= 0 &&
  168 |           rect.left >= 0 &&
  169 |           rect.right <= innerWidth &&
  170 |           rect.bottom <= innerHeight
  171 |         );
  172 |       }),
  173 |     )
> 174 |     .toBeTruthy();
      |      ^ Error: expect(received).toBeTruthy()
  175 | }
  176 | async function capture(page: Page, name: string) {
  177 |   expect(
  178 |     await page.evaluate(
  179 |       () => document.documentElement.scrollWidth <= innerWidth,
  180 |     ),
  181 |   ).toBeTruthy();
  182 |   await page.screenshot({ path: join(evidence, `${name}.png`) });
  183 | }
  184 | 
  185 | for (const width of [1440, 1024]) {
  186 |   test(`独立复核：直接输入和长会话后仍可继续 ${width}`, async ({ page }) => {
  187 |     await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
  188 |     const item = await createItem('直接描述当前任务');
  189 |     await openItem(page, item);
  190 |     const composer = page.getByRole('textbox', {
  191 |       name: '对话修改',
  192 |       exact: true,
  193 |     });
  194 |     await visibleInsideViewport(composer);
  195 |     await expect(composer).toBeEnabled();
  196 |     await composer.fill('请先核对需求中的缺口，不修改流程。');
  197 |     await capture(page, `review-direct-input-${width}`);
  198 |     await composer.press('Control+Enter');
  199 |     await expect(
  200 |       page.getByText('独立长会话结束标记', { exact: false }),
  201 |     ).toBeVisible();
  202 |     await visibleInsideViewport(composer);
  203 |     await composer.fill('尚未发送的下一步需求');
  204 |     await page
  205 |       .getByRole('button', { name: '收起工作项 Assistant', exact: true })
  206 |       .click();
  207 |     await visibleInsideViewport(composer);
  208 |     await expect(composer).toHaveValue('尚未发送的下一步需求');
  209 |     await page
  210 |       .getByRole('button', { name: '展开工作项 Assistant', exact: true })
  211 |       .click();
  212 |     await visibleInsideViewport(composer);
  213 |     await expect(composer).toHaveValue('尚未发送的下一步需求');
  214 |     await page.getByRole('tab', { name: '输入', exact: true }).click();
  215 |     await expect(composer).toHaveValue('尚未发送的下一步需求');
  216 |     await capture(page, `review-long-assistant-${width}`);
  217 |     const saved = await application.items.get(item.id);
  218 |     expect(saved.compositionWorkId).toBeTruthy();
  219 |     const privateWork = await application.files.read(saved.compositionWorkId!);
  220 |     expect(
  221 |       privateWork.messages.filter((message) => message.role === 'user'),
  222 |     ).toHaveLength(1);
  223 |     expect(
  224 |       privateWork.messages.find((message) => message.role === 'user')?.text,
  225 |     ).toBe('请先核对需求中的缺口，不修改流程。');
  226 |   });
  227 | 
  228 |   test(`独立复核：结构父项、子项入口和验收错误保留 ${width}`, async ({
  229 |     page,
  230 |   }) => {
  231 |     await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
  232 |     const parent = await createItem('无需自身条件的整体确认');
  233 |     const first = await createItem('已确认的独立子项', { parentId: parent.id });
  234 |     const second = await createItem('等待人工确认的子项', {
  235 |       parentId: parent.id,
  236 |     });
  237 |     await confirmLeaf(first);
  238 |     await openItem(page, parent);
  239 |     let dialog = await acceptance(page);
  240 |     await expect(dialog).toContainText('1/2');
  241 |     await expect(
  242 |       dialog.getByRole('button', { name: '确认结项', exact: true }),
  243 |     ).toBeDisabled();
  244 |     await dialog.getByRole('button', { name: '检查子项', exact: true }).click();
  245 |     const children = page.getByRole('dialog', {
  246 |       name: '子工作项',
  247 |       exact: true,
  248 |     });
  249 |     await expect(
  250 |       children.getByRole('button', { name: '添加子项', exact: true }),
  251 |     ).toBeVisible();
  252 |     await children
  253 |       .getByRole('button', { name: second.title, exact: false })
  254 |       .click();
  255 |     await expect(
  256 |       page.getByRole('heading', { name: second.title, exact: true }),
  257 |     ).toBeVisible();
  258 |     await page
  259 |       .getByRole('button', { name: /返回工作项/ })
  260 |       .first()
  261 |       .click();
  262 |     await expect(
  263 |       page.getByRole('heading', { name: parent.title, exact: true }),
  264 |     ).toBeVisible();
  265 |     await confirmLeaf(second);
  266 |     dialog = await acceptance(page);
  267 |     await expect(dialog).toContainText('2/2');
  268 |     await expect(
  269 |       dialog.getByRole('textbox', { name: /^完成条件 \d/ }),
  270 |     ).toHaveCount(0);
  271 |     await expect(
  272 |       dialog.getByRole('button', { name: '确认结项', exact: true }),
  273 |     ).toBeEnabled();
  274 |     await capture(page, `review-structural-acceptance-${width}`);
```