# 证据：invoke 表单与调用留痕展示（2026-09-22）

## 实际改动

- `src/client/core/invoke-form.ts`：`buildInvokeFields`（端口 → 控件类型/必填，未声明契约端口宽松 json）与 `parseInvokeInputs`（字符串条目 → 裸值数组，中文本地校验，空白条目视为未填）。
- `src/client/features/workspace/InvokeDialog.tsx`：按端口多条条目编辑；本地预校验；违约错误下方显式「豁免契约重试（会留痕）」（仅服务端返回 `输入不符合契约：` 前缀时出现）；打开时重置表单，打开期间 SSE 快照刷新不清空已填内容（effect 只依赖 open）。
- 接线：`usePanels.invokeOpen`、`useActions.invokeWork`（invoke wait 后 GET 快照 receive，选中新 Run 切结果页）、`WorkspaceHeader` 次级按钮「直接输入」、Results 空态同一入口、WorkspaceDialogs 组合。
- 留痕展示（`Results.tsx`）：运行记录下拉选项与 run-meta 显示「宽松调用（豁免入口契约）」「端口 X 经自动修复」；输入来源 materialIds 与 sourceResultIds 均空时显示「直接输入 · sampleId」。
- `src/client/styles.css`：`.invoke-port` 等对话框样式（@layer components）。
- 补充（09-22 复验）：`InvokeDialog` 空态说明——定义无输入端口时不再只显示禁用按钮；入口为 file 来源节点（`inputs` 为空合法，见 shared/AGENTS）时提示改用「输入材料 + 运行流程」。浏览器实测：空态文案出现；有端口的定义端到端跑通。

## 验证

- `tests/invoke-form.test.ts` 5 项（先写后实现，Red→Green）：字段映射、required 缺省、类型转换、中文错误、非必填留空省略。
- `pnpm exec tsx --test tests/invoke-form.test.ts tests/invoke.test.ts tests/client.test.ts`：18 项通过。
- `pnpm test:browser tests/browser/workspace.spec.ts`：2 项通过（1440/1024 函数流程回归）。
- `pnpm typecheck:app` 通过。`pnpm format:check:app` 有 13 个既有文件告警（昨日合入的 assistant-session / input-contract-invoke 代码），本 track 新增文件无告警；未越界代格式化。
- 浏览器真实操作（临时验收工作，identity 函数节点 + 契约 `number, minimum:100`，用后归档）：
  - 非数字本地拒绝（「不是数字」）；5 被服务端契约拒绝，错误全文可读，豁免按钮出现（截图 invoke-dialog-blocked-1440）。
  - 豁免重试成功：run-meta 显示「宽松调用（豁免入口契约）」，展开输入来源显示「直接输入 · input-1」（截图 invoke-result-loose-1440）。
  - 对照：150 正常通过契约，运行记录下拉中第一次运行带「宽松调用」、第二次不带。
  - 1024×768 无横向溢出，无 pageerror（截图 invoke-result-1024）。

## 未测边界

- `interpret` 修复环的真实模型路径未在本 track 验收（归 input-contract-invoke track）；「端口 X 经自动修复」的 UI 分支与 loose 同一代码路径，仅类型检查覆盖。
- 多端口混合契约/宽松的表单组合只经单测，未浏览器实测。
- boolean 可选端口默认产生一条「是」条目，用户不改动也会提交 true；如需严格区分「未填」后续再改。

## 提交

- `feat(client): invoke 表单模型与解析纯函数`
- `feat(workspace): 直接输入调用表单与 invoke 留痕展示`
- 另含 AGENTS 同步（见收尾提交）。

## Review Fixes 验证（2026-09-22）

- `pnpm exec tsx --test tests/invoke-form.test.ts tests/invoke.test.ts tests/client.test.ts`：19 项通过（新增数字格式、违约 code 断言）。
- `pnpm test:browser tests/browser/workspace.spec.ts`：2 项通过（1440/1024 回归）。
- `pnpm typecheck:app` 通过。
- 浏览器实测：头部「直接输入」为实心主按钮、比「运行流程」更大更醒目（1440/1024 均无溢出）；演示工作端到端直接输入运行成功、无 pageerror。
- 提交：`a1f2bf4` 修复、`12e9707` 入口显眼化、`b95d93b` 侧边栏收敛；track 更名为「直接输入」（原「再来一单」）。
