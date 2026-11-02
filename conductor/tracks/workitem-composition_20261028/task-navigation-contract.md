# T 任务访问业务合同落地

2026-10-29。权威规则在[任务访问与导航合同](../../../docs/task-navigation-contract.md)。本轮完成文档及旧取舍修正，导航代码未改。用户随后明确要求启动独立track实施，后续统一转入[导航优化track](../feature-task-navigation_20261029/index.md)，不在两个track重复推进。

## 反例及当前差距

从工作项A/R查看M/v1/r1，再进入M编辑，随后查看属于B的运行：原任务A与运行真实归属B必须分开；继续A不能自动采用v2或改变r1。方法引用不是父子页面关系。

只读源码定位：app/navigation.ts的flowcraftParents/returnToParent以pushState模拟父入口；App.tsx将其接到工作项/方法标题；WorkspaceHeader和WorkItemDetail有标题箭头；Results.tsx同一局部入口可能返回原成果/总览/列表；RunInspector有内部来源轨迹。共享页头不足以解决不同访问意图。

## 最小交接

| 模块 | 输入与输出 | 错误及边界 |
| --- | --- | --- |
| App/navigation/Sidebar | 目标ID/视图/固定运行/可选原任务 → 有限URL与真实历史 | 无来处不编造；不新建父栈或导航服务，popstate不执行业务 |
| WorkspaceFrame/Header/Tabs | 对象身份/当前视图/具名原任务 → 固定位置与内容层 | 来处与Run归属分别呈现，不加返回横条或第三侧栏 |
| WorkItems/WorkItemDetail | 查询/分页/滚动/视图/记录 → 普通往返恢复 | 失效记录明确处理，不选相邻项，不把正文/草稿塞URL |
| Results/RunInspector/MethodPreview | 固定定义/Run/端口/索引 → 稳定结果导航与临时检查 | 缺失不读最新；关闭恢复焦点，避免递归弹窗 |
| 既有草稿/Assistant | 对象/会话身份与各自草稿 → 恢复原工作 | 不复制业务状态或另造会话系统；声明仅影响业务视图 |
| 既有服务/shared | 固定定义、运行和来源 → 现有权威记录 | 当前没有新增领域对象/接口需求；有具体反例才改 |

## 推进与证据边界

合同、旧spec/指南修正及NAV-01—12定义已完成。代表页面设计→实施→两尺寸视觉→定向NAV验证由新track负责；当前标题箭头和旧父栈仍存在。本轮不运行浏览器/模型/模块测试、不改服务或运行数据；产品文件不变性与文档检查见evidence。R跨方法业务结果回接仍独立待解，导航不能替代。
