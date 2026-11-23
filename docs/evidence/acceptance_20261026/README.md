# 人工验收入口（2026-10-26）

完成条件是工作项闭环中的人工核对步骤。原有概览计数按钮与普通页签重复导航，未体现当前需要人做什么。

本次将页签命名为“验收与结项”，附验收图标和状态徽标；概览用固定待办条显示未保存修改、待核对条件、未结项子项、缺少条件或执行未结束。条件已保存且有依据、范围内子项完成、执行结束后，入口强调“检查并结项”。点击只查看验收页，最终结项仍需用户确认；页内用提示替代顶部重复导航。原上下文“用于完成条件”动作保持不变。

`WorkItemAcceptance` 直接投影已有业务状态，没有新增模型、API 或持久状态。`WorkItemDetail.canComplete` 同时驱动入口强调和最终按钮，服务端继续执行最终校验；独立条件不绕过未结项子项。

## 验证

隔离副本 `/tmp/flowcraft-acceptance-xCt1el`，构建前端、临时数据、私有 Hono HTTP/runtime；没有写入托管实例或用户数据。同步前核对源文件基线，保留既有改动。

- `pnpm typecheck:app`、`pnpm build` 通过。
- `playwright.debug.config.ts` 无默认 webServer/baseURL，各用例自建私有服务。
- `workitem-progress.spec.ts`、`workitem-decomposition-lifecycle.spec.ts`、`workitem-decomposition.spec.ts`、`workitem-workspace.spec.ts`，筛选 `整体数量|整体确认|跨方法成果|同环节实例|工作项拆分`：9 passed。覆盖待人工核对、未保存阻止结项、保存后显示入口、点击入口不结项、最终结项与重开、执行未结束阻止结项、父项整体验收及相关来源返回。
- 最后方案/报告回归 `workitem-plan.spec.ts`、`workitem-report.spec.ts`：通过（6 + 4 个用例）；父项有独立条件时仍须等待子项结项，共享业务背景在页签间保持稳定。
- `playwright.lifecycle.config.ts` 在隔离副本启动 4331 独立后端（构建静态前端、独立 data），`workitems.spec.ts`：2 passed，覆盖登记、等待、事件、依据结项与重开。首次补跑因旧返回按钮定位超时，修正为当前“返回”入口并将禁用结项断言放在验收页后通过。
- 本次源文件及相关浏览器用例 Prettier 检查通过；`git diff --check` 通过，已核对交付源文件与测试副本一致。
- 1440×900、1024×768 实际操作并检查截图。Agent 边界使用明确 fixture，无真实模型调用；浏览器验证范围为 Chromium。

待核对：[1440](pending-1440.png) / [1024](pending-1024.png)。

具备结项条件：[1440](acceptance-ready-1440.png) / [1024](acceptance-ready-1024.png)。

进入验收页：[1440](acceptance-review-1440.png) / [1024](acceptance-review-1024.png)。

执行未结束：[1440](acceptance-running-1440.png) / [1024](acceptance-running-1024.png)。

父项子项待结项：[1440](parent-plan-1440.png) / [1024](parent-plan-1024.png)。
