# 子项阶段成果接续 · 2026-10-27

## 实际交付

父项“子项”页面新增“使用子项成果继续处理”：按业务子项选择具体轮次和产物组，可合并取消轮次的已完成部分与后续轮次，并逐份取舍；默认不选择最新或全部历史成果。选择器固定主从布局，切换方法保留当前子项；完整内容按需使用既有 MaterialDialog 查看。已有“已确认完成依据”入口独立保留。

新增显式 child-results 输入选择及只读 stageInputs/stagePreview，复用真实成果解析、版本/材料校验与运行冻结。每个子项形成一项带冻结业务身份的输入，内部保留精确来源及 JSON 原值；下一方法可以保持分组、展开或汇集成列表。生成方法保存 authorInputSelections，供其首次执行准备重新解析。不增加业务实体，不自动确认或结项。作者不再强制生成摘要/文字报告，声明过的 summaryOutput 校验不变。

## 反例与验证

真实调查发现：部分 CVE 的旧轮次已完成若干目标，后续轮次仅处理剩余范围，因此“每项取最新 Run”会漏结论。正式集成夹具覆盖 20 个开放子项，其中一项将旧轮次两个成功核查产物与续做的一份列表产物合并；共享方法的各项最终产物刻意使用相同 M01 样本名，保持独立。父项消费20项输入，再将整批列表精确引用给第二套方法，结果原值一致；补材料不改旧 Run。另验18项部分选择、明确作者交接、读取预览、重复/空选/越界/错属/排除拒绝启动，以及最终完成仍受子项约束。

所有开发/构建/测试位于 `/tmp/flowcraft-child-results-20261027` 的源码副本，模块夹具使用临时数据，浏览器夹具使用随机私有端口。未使用托管4320/4321作为调试或写入夹具。

- `pnpm typecheck:app`：通过。
- `pnpm build`：通过；存在原有大chunk提示。
- `pnpm exec tsx --test tests/child-stage-inputs.test.ts tests/assistant.test.ts tests/functional-author.test.ts tests/workitem-decomposition.test.ts tests/lifecycle-integration.test.ts tests/criterion-citation.test.ts tests/result-summary.test.ts`：59项通过。
- 使用无webServer的独立 Playwright 配置，`child-stage-inputs.spec.ts` 2项、`workitem-citation.spec.ts` 2项、`workitem-decomposition-lifecycle.spec.ts` 7项，合计11项通过（包含定向重验）。
- 检查1440×900与1024×768截图：选择多轮、切换方法、生成作者上下文。新流程检查弹窗固定尺寸、选择保留、完整原值查看和启动后服务端输入；旧路线检查完成快照、祖先重开、千项查询、输入修订和批量窗口。

验证期间修正了新浏览器夹具的列表搜索、原生选择器定位、异步保存等待与SSE清理；旧浏览器用例将“已结项”计数限定在列表行，并兼容已有“开始处理”按钮名称。没有删减业务断言或改用固定业务结论通过验收。

## 边界

这些是正式HTTP/文件/runtime与真实浏览器交互的验证，作者模型边界使用已有明确fixture。未调用真实模型，未重跑现有20条真实CVE，未替用户判断业务覆盖是否完整。跨轮次同目标但不同形状成果的业务去重由明确的方法/用户选择决定，应用不猜测。运行完成不表示业务结项。

截图：`multi-run-1440.png`、`multi-run-1024.png`、`prepared-1440.png`、`prepared-1024.png`、`author-1440.png`、`author-1024.png`。

## 当前服务交付检查

代码和构建文件已同步到托管工作目录，未手动停止或重启服务。只读检查确认 flowcraft active、前端及新增组件HTTP200；实际批次 stageInputs 返回20个范围内子项，20项均有可选阶段产物，来源读取错误0。此检查只发现选项，未创建方法、启动运行或修改业务数据。
