# 验收证据

## 实现

- `shared/records.ts`：`InputContract{item?, required?, onInvalid?}`、`Definition.inputContracts`、`Run.invocation{loose?, repairedPorts?}`，均可选，旧数据兼容。
- `flow/contracts.ts`：checkInputContracts 并入 checkDefinition（端口须存在、schema 可编译、违约行为合法）；validateInvocation 逐端口逐条校验 invoke 裸值，中文错误。
- `server/index.ts`：`POST /api/works/:id/invoke`——definition 缺省 adopted（可 draft/固定版本），裸值包装 InputItem（sampleId 按端口序生成，materialIds 空如实标记 ad-hoc），reject/loose/interpret 三路径，`wait` 经 onFinish 同步等终态返回 outputs（超时上限 600s，超时 202 + runId），`invocation` 留痕。createApplication 新增 runSession 注入便于测试。
- `assistant/index.ts`：`repairInvocation` 修复环——无状态单轮会话（不写作者持久会话），契约+违约细节+原始值 → JSON 数组，数量不符/复检失败如实报错。

## 验证

- `pnpm typecheck:app` 通过；`pnpm test` 158/158（新增 tests/invoke.test.ts 4 项：adopted 缺省+裸值包装+wait 同步输出、违约门口拒绝+零运行、loose 豁免留痕、interpret 修复成功/修复失败两路径、未采用/未知端口/异步返回）。
- 真实 GLM 5.3 Flash：`['导出经常失败', 42]` 触发 interpret → 修复为 `"42"`，运行 completed，`repairedPorts: ["materials"]` 留痕；`[123]` + loose → 放行并 `loose: true` 留痕。探针工作已归档。

## 边界与未知

- interpret 修复环按端口各调一次模型；多端口违约串行修复。修复质量依赖模型，保留"修不出如实拒绝"路径。
- 契约编辑 UI 未做（Assistant update_flow 可携带）；invoke 无鉴权（原型范围）。
- 契约只约束入口，不改变节点间机械算子语义；wait 节点等非终止状态在 invoke 同步等待下按 202 处理（waiting 不算终态）。
