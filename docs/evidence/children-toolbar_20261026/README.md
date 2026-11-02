# 子项工具栏排版（2026-10-26）

原有子项区域直接复用整页 ListToolbar 的 20px/32px 内边距，导致搜索相对标题和表格二次缩进；控件高度也不一致，额外待办筛选缺少分组和窄屏排列。

修复仅涉及 `ItemRelations.tsx` 和 `WorkItems.css` 的局部布局：上行左侧标题、右侧添加/汇总操作；下行搜索与成组筛选对齐；输入、操作及筛选控件统一为 32px 高；900px 以下筛选组整体换到搜索下方，分页左右边缘也与内容对齐。继续使用现有 Button、NativeSelect、ListToolbar 和 ListPagination，不更改查询、建项、汇总或执行逻辑。

`Management.css` 保留了未分层整页规则，本次覆盖限定于未分层 `.item-relations` 布局；原生选择框尺寸通过组件 className 指定，没有增加全局控件外观规则。

## 验证

独立副本 `/tmp/flowcraft-children-toolbar-e0a6l5`，正式构建前端及临时数据的私有 Hono 服务；没有测试写入托管实例或用户数据。同步前校验文件基线，保留工作区已有改动。

- `pnpm typecheck:app`：退出 0。
- `pnpm build`：退出 0，保留现存 bundle 大小提示。
- `workitem-plan.spec.ts --grep 父项`：退出 0，2 passed。1440×900、1024×768 验证搜索和两个筛选实际高度及对齐、搜索字段与区域左缘一致，并实际执行搜索、范围切换和待办筛选。用例还在 800×900 缩放检查筛选组换到下一行且无横向溢出，之后恢复窗口并继续既有父项操作。
- `workitem-decomposition.spec.ts`：退出 0，7 passed，覆盖添加子项、生成拆分方法、候选、修订输入及父子草稿等原路径。
- 1440、1024、800 三张截图均已实际查看。未运行真实模型；相关 Agent 边界仍是既有显式 fixture，不代表业务结论验证。

截图：[1440](children-toolbar-1440.png) / [1024](children-toolbar-1024.png) / [800](children-toolbar-800.png)。

浏览器范围为 Chromium，未验证 Firefox、Safari。
