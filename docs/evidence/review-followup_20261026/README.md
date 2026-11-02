# 待复核与补证/整改闭环

2026-10-26，本次实现与验收记录；截图全部来自隔离 fixture，不代表用户漏洞结论或真实业务修复完成。

## 实际交付

- effectiveStatus 新增 review，持久 WorkItem.status 仍为 open/completed。完整视图、分页摘要、全局/范围计数和筛选共用派生函数。当前意图的成功执行即待复核，证据 blocker 单独保留；重开/换方法后的旧执行不充当新进展。业务状态用独立紫色 ListChecks，方法运行列表的关联业务列也显示同一状态；Run 状态继续独立。
- 父项集中显示六类数量，卡片按同一直属范围过滤；没有本项方法的父项主动作进入待复核子项。范围内待办继续跨层，有 blocker 的复核项仍能从“需补材料”筛出。背景、范围卡片与各页签保持位置；短内容页签保留阅读空间。
- 具体成果的“复核与跟进”分别支持引用验收依据、建立补充证据子项、建立影响整改子项。复用 createChildren/receivedInputs/trackingKey，传真实 JSON 及精确输出引用、原材料；重入展示既有后续，窗口外框在表单/回执间保持。关闭恢复复核按钮焦点；第一次产生子项不自动离开当前成果。
- 后续未结项时，前端禁用原项结项，并提供“查看待处理子项”；正式 HTTP 完成动作同样拒绝。后续处理并验收后，再回到原项、上级逐层确认，运行与成果不改写。确认不受影响由人引用实际依据验收，不按模型 conclusion 自动处理业务状态。
- 历史对比真实方法、版本和新增材料，实际引用继续链接原运行；旧 JSON 报告中性提示说明缺失，原文保留可查。新 reportProgress 拒绝纯 JSON 对象/数组摘要，旧同 ID 原样重试仍幂等。
- 两条正式 CVE 方法均提供普通函数摘要，不增加报告模型调用；源码核查提示按补证/整改子项承接。内建剖析/历史示例保留既有产物合同，历史 Run 不回填新摘要。

## 验证事实

- 41 项相关模块测试通过：workitem-progress、workitem-decomposition、work-items、cve-v2、result-summary、client、functional-author。覆盖实际 HTTP/文件/运行/作者交接、待复核与重开、JSON 报告拒绝及研究摘要无模型调用；Pi 边界为明确 fixture，隔离副本移除继承的部分 Sourcegraph 环境配置。
- 新 browser/workitem-review.spec.ts 两尺寸完整路线通过：三个目标分别为补证、整改、不受影响；验证独立计数/筛选、方法侧状态、旧 JSON 原文、固定弹窗几何、来源/原值交接、同来源重入、焦点与阅读位置、未解决时按钮/API 双重拒绝、后续/原项/整批逐层结项。
- 16 条相邻路线分批通过（CVE、结果摘要、方案/父子推进、进展与跨方法成果）：初次 13/16，修复短页签滚动上限导致的背景位移，并将历史选择定位到轮次标题后，受影响的 4 条重验通过。未删除业务断言。
- 正式类型、构建与格式检查通过；构建有既有 canvas chunk 体积提示。UI 用临时数据/私有 Hono 与当前 dist，1440×900、1024×768；已查看两尺寸概览、表单、阻塞与闭环截图。未重新调用真实模型，未全仓浏览器回归。

## 当前应用交付

同步前确认无 queued/running/stopping Run，逐文件核对基线后同步 41 个源码/测试/指南文件，保留已有未提交现场；托管服务保持 active，未为调试停止/重启服务。当前工作区正式类型与构建通过，前端 HTTP 200，交付源码与隔离验证副本逐文件一致。

通过正式 saveDraft/adopt/saveLayout 更新两条方法，旧定义和所有原运行 ID/顺序保留，没有新业务执行或自动创建/结项真实跟进工作项：
- source-check: `7f570fde-30a2-49aa-bbcd-776cacab7760` → `13ffa13b-2209-4d1c-b101-31361c9b1a83`；原 44 轮执行保持。
- research: `8b3ada7e-c67b-4531-96af-3601abae63d2` → `c26317c9-a64d-4b5b-96e4-ba2f4f7bdb84`；原 33 轮执行保持。

应用只读核验：SCC 首批范围内 20 个直属子项均显示 review，status=review 可精确筛出 20 项；已结项仍为 0，原业务条件/判断保持。

## 视觉证据

- [整批待复核 1440](batch-review-1440.png) / [1024](batch-review-1024.png)
- [方法侧业务状态 1440](method-review-1440.png) / [1024](method-review-1024.png)
- [补证表单 1440](evidence-followup-form-1440.png) / [1024](evidence-followup-form-1024.png)
- [整改表单 1440](remediation-followup-form-1440.png) / [1024](remediation-followup-form-1024.png)
- [未解决时阻止结项 1440](evidence-blocks-close-1440.png) / [1024](evidence-blocks-close-1024.png)
- [逐层闭环 1440](closed-loop-1440.png) / [1024](closed-loop-1024.png)
