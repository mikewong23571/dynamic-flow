# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workitem-composition-review.spec.ts >> 独立复核：结构父项、子项入口和验收错误保留 1440
- Location: tests/browser/workitem-composition-review.spec.ts:228:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('dialog', { name: '完成条件', exact: true })
Expected substring: "1/2"
Received string:    "完成条件完成条件添加条件保存条件确认结项关闭"
Timeout: 15000ms

Call log:
  - Expect "toContainText" getByRole('dialog', { name: '完成条件', exact: true }) with timeout 15000ms
  - waiting for getByRole('dialog', { name: '完成条件', exact: true })
    34 × locator resolved to <div role="dialog" tabindex="-1" id="radix-_r_1e_" data-state="open" aria-label="完成条件" data-slot="dialog-content" aria-describedby="radix-_r_1g_" class="fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=op…>…</div>
       - unexpected value "完成条件完成条件添加条件保存条件确认结项关闭"

```

```yaml
- dialog "完成条件":
  - heading "完成条件" [level=2]
  - paragraph: 完成条件
  - button "添加条件"
  - button "保存条件" [disabled]
  - button "确认结项" [disabled]
  - button "关闭"
```

# Test source

```ts
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
  174 |     .toBeTruthy();
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
> 240 |     await expect(dialog).toContainText('1/2');
      |                          ^ Error: expect(locator).toContainText(expected) failed
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
  275 |     await dialog.getByRole('button', { name: '确认结项', exact: true }).click();
  276 |     await expect
  277 |       .poll(async () => (await application.items.get(parent.id)).status)
  278 |       .toBe('completed');
  279 | 
  280 |     // A real concurrent write invalidates the editor's starting revision.
  281 |     // The submitted draft and error must remain inside the same modal.
  282 |     const conflict = await createItem('保留验收草稿', {
  283 |       criteria: ['原完成条件'],
  284 |     });
  285 |     await openItem(page, conflict);
  286 |     dialog = await acceptance(page);
  287 |     const condition = dialog.getByRole('textbox', {
  288 |       name: '完成条件 1',
  289 |       exact: true,
  290 |     });
  291 |     await condition.fill('这条修改在失败后仍应保留');
  292 |     await act(conflict.id, {
  293 |       action: 'addEvidence',
  294 |       materials: ['另一入口新补充的事实'],
  295 |     });
  296 |     await dialog.getByRole('button', { name: '保存条件', exact: true }).click();
  297 |     await expect(dialog.getByRole('alert')).toBeVisible();
  298 |     await expect(condition).toHaveValue('这条修改在失败后仍应保留');
  299 |     expect((await application.items.get(conflict.id)).criteria[0].text).toBe(
  300 |       '原完成条件',
  301 |     );
  302 |     await visibleInsideViewport(
  303 |       dialog.getByRole('button', { name: '保存条件', exact: true }),
  304 |     );
  305 |     await capture(page, `review-modal-conflict-${width}`);
  306 |   });
  307 | 
  308 |   test(`独立复核：跨方法历史与同次等待事件 ${width}`, async ({ page }) => {
  309 |     await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
  310 |     const method = await application.work.createWork('最初资料阅读方法', []);
  311 |     const definitionId = await application.flow.saveDraft(
  312 |       method.id,
  313 |       undefined,
  314 |       identity,
  315 |     );
  316 |     await application.flow.adopt(method.id, definitionId);
  317 |     const item = await createItem('跨方法持续跟进', { workflowId: method.id });
  318 |     await act(item.id, { action: 'run', definitionId });
  319 |     await expect
  320 |       .poll(
  321 |         async () => (await application.items.get(item.id)).execution?.status,
  322 |       )
  323 |       .toBe('completed');
  324 |     const original = (await application.items.get(item.id)).runs[0];
  325 |     let current = await workspace(item.id, { action: 'init' });
  326 |     current = await workspace(item.id, {
  327 |       action: 'saveFlow',
  328 |       baseRevision: current.item.revision,
  329 |       definition: waiting,
  330 |     });
  331 |     await workspace(item.id, {
  332 |       action: 'run',
  333 |       baseRevision: current.item.revision,
  334 |     });
  335 |     await expect
  336 |       .poll(
  337 |         async () => (await application.items.get(item.id)).execution?.status,
  338 |       )
  339 |       .toBe('waiting');
  340 |     const pending = await application.items.get(item.id);
```