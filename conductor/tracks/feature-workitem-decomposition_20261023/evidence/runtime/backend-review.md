# 后端独立逻辑审查（2026-10-23）

范围：只读 children / prepare / run-inputs / queries / 生命周期写入口，核对正常用户路径与明确来源；未改后端所有者文件。下列发现已发送 backend/root 修正，最终状态需看修后测试。

1. 同源候选已经关联 A 后，request.edits.existingChildId 可将本次回执改成 B，随后无编辑重试又通过最早历史 find 回 A。来源对应的子项不能在两个入口漂移；应拒绝与固定关联冲突的新关联。
2. trackingKey 命中直接 linked，没有核对目标/范围冲突。相同 key 的新候选即使目标完全不同也会显示已关联；应明确反馈冲突，不覆盖已有材料/结论。
3. 从 result 来源直接“修订输入”（没有 previous received 项）只存 source/value，不带来源原文材料；后续 model 上下文缺少原本明确交接的原文。应按真实 output.materialIds 及 Run.workItem.materials读取，保持同一交接规则。
4. 父项最后一次 Run 仅建立子项，子项尚未完成，queries仍根据 Run.completed 标 review。应避免把仅等待子项的父项当成用户待检查任务，尤其跨层待办列表。
5. completionValue递归可正确读取固定childCompletions和实际输出值，但每个引用都 files.read 同一个方法。千项共享方法的汇总应在一次解析上下文复用读取，避免重复解析大work.json。

已确认合理：短时层级写串行；child第一次落盘包含parent/origin；父回执保存失败可从child.origin恢复；停止返回已建立前缀；固定完成事件递归读取而非最新summary；有效范围沿被排除关系截断；preview、comparison及普通retry不建立子项。仍需以上修正和全track页面验收才能称全部闭环。

## 修订复查

backend 实施者已修上述 1–5 项，独立源码复读确认：同源已有 origin 拒绝改 childId；同 trackingKey 不同 goal 反馈冲突；从成果修订带实际原文；纯建项父结果不重复列为 review；完成依据递归共享 Work 读取缓存。实施者另补真实文件注入回执保存失败/第二项保存失败测试，独立运行最终数量由 backend 证据记录。

后续私有浏览器规模验证发现每次查询之间仍会重复全扫与解析共享大方法；这是新的跨请求性能问题，见 runtime-browser/scale-*.json 的首轮数据，已交 backend 继续修订，不能以单次请求内缓存宣称千项预算通过。
