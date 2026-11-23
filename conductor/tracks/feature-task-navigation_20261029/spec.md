# 整体任务导航优化

2026-10-29。用户已授权按现有合同设计、实施和验证，由主代理独立推进。

## 目标

让用户能定位当前对象，临时检查依据，深入编辑方法，并保留状态继续原工作项。工作项与方法不构成虚假父子层级，浏览器后退/前进遵循真实历史。满足[任务访问合同](../../../docs/task-navigation-contract.md)的NAV-01—12。

## 非目标

不改变执行、采用、输入、完成条件和结项语义；不新增阶段引擎、导航DSL、标签管理器或第三常驻侧栏。CVE仅为合成样例。不处理R跨方法业务结果回接。不操作托管4320/4321，不提交/推送/部署，新的子代理只读调查，主代理统一实施。

## 改动点

client/app/navigation、App、WorkspaceHeader、controller/state选择恢复、useActions迟到回执及useDraft保存中编辑保护；共享WorkspaceFrame；WorkItems/WorkItemDetail；Results/RunInspector及固定方法预览；相关CSS、就近AGENTS、导航/来源浏览器用例与必要模块测试。因审查确认隐藏Portal和方法表单重绑，范围补充ContentVisibility/DeferredContent/Modal与菜单/Popover内容、usePanels/WorkspaceDialogs及InvokeDialog目标身份；只处理已出现的恢复与归属问题，不建设平台。服务端仅在具体反例证明需改时更新本spec，不为导航提前扩展接口。

## 影响域与依赖

承接workitem-composition_20261028的T合同及独立预览现状。App和Sidebar负责对象入口；共享骨架负责身份/视图；结果区负责固定执行与来源；既有本地状态负责阅读和草稿恢复；Assistant仍只声明业务界面。具体交接见[上游记录](../workitem-composition_20261028/task-navigation-contract.md)。

代码范围为现有独立工作区/home/mike/projs/fork/dynamic-flow-workitem-composition，基线为本track启动时未提交快照；不得从HEAD重建而丢掉现有原型。不复用托管进程或用户数据。

## 验收

先代表页面设计/审阅，再实施；先两尺寸实际看图，再定向NAV功能验证。每条NAV记录实际结论与限制，不以类型或历史测试冒称完整验收。
