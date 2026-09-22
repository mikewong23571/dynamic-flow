# 实施计划

## Phase 1：表单模型（纯函数先行）

- [x] Task: `src/client/core/invoke-form.ts` 表单模型与解析
  - [x] `buildInvokeFields(definition)`：端口 → {port, required, kind, schema}，kind 由 item schema 顶层类型映射（string/number/boolean/其他→json），未声明契约端口为宽松 json
  - [x] `parseInvokeInputs(fields, raw)`：字符串条目 → 裸值数组；JSON 解析失败、必填为空给中文错误
  - [x] 先写 `tests/invoke-form.test.ts` 看到预期失败，再实现（Red → Green）
- [x] Task: Phase 1 验证：`pnpm exec tsx --test tests/invoke-form.test.ts` 与 `pnpm typecheck:app` 通过

## Phase 2：调用对话框与接线

- [x] Task: `src/client/features/workspace/InvokeDialog.tsx`
  - [x] 按端口条目编辑（添加/删除条目），契约字段类型控件与本地预校验
  - [x] 违约/修复失败错误如实展示，不关闭表单；错误下方显式「豁免契约重试（会留痕）」
  - [x] wait 同步等待；200 选中该 Run 切运行结果；202 提示仍在运行并跳转跟踪
- [x] Task: 入口与状态接线
  - [x] `WorkspaceHeader` 加次级按钮「直接输入」；结果空态同一入口
  - [x] usePanels 对话框状态；useActions `invokeWork(inputs, {loose})` 调 `/api/works/:id/invoke`
  - [x] WorkspaceDialogs 组合 InvokeDialog
- [x] Task: Phase 2 验证：浏览器真实操作无契约/带契约两类定义，含违约与豁免重试路径

## Phase 3：留痕展示

- [x] Task: Results 运行记录行与运行详情显示 invocation 标记（宽松调用 / 端口 X 经自动修复）
- [x] Task: 输入来源 `materialIds` 为空时显示「直接输入」
- [x] Task: Phase 3 验证：1440×900 与 1024×768 实际操作并截图

## Phase 4：回归与证据

- [x] `pnpm typecheck:app`、`pnpm format:check:app`、`tests/invoke.test.ts` 及相关模块测试、相关浏览器用例回归
- [x] 同步 `src/client/AGENTS.md` 功能地图与交接段落
- [x] 记录 evidence.md（实际命令结果、截图、未测边界），更新注册表勾选

## Phase 5：Review Fixes（2026-09-22 review）

- [x] 契约违约响应带结构化 `code: contract_violation`（含修复失败变体），前端按 code 显示豁免按钮，弃文案前缀匹配
- [x] 202 超时经全局 notice 显示「仍在运行」并跳转跟踪
- [x] invokeWork 的 setSelectedRun/setTab 收进 activeWorkId 守卫
- [x] 数字预校验只收十进制，拒绝 Infinity/0x/NaN（补单测）
- [x] InvokeDialog 零端口空态说明（file 来源节点定义提示）
- [x] 「直接输入」提升为头部主按钮（最高频入口显眼化）；结果空态同步
- [x] 命名决定：概念名「一件事」入术语表，按钮保持白描「直接输入」
- 提交：`a1f2bf4`（review 修复）、`12e9707`（入口显眼化）、`b95d93b`（侧边栏新建入口收敛）
