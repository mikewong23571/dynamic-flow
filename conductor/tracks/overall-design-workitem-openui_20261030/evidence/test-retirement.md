# 旧浏览器路线与当前能力承接

本track明确取消公共Work作为业务方法指针、Work作者材料副本和ItemUiPlan。下面退役的是绑定这些机制的GUI测试，不增加测试端旧API翻译器，也不要求新界面重建旧标签/布局。只有下表实际列出的现有断言可以作为对应层级证据；模块通过不代替新界面浏览器或真实模型。

| 退役族（tests/browser/*.spec.ts） | 取消的GUI/接口合同 | 保留业务能力与验收承接 |
| --- | --- | --- |
| work-journey、workitem-plan | workflowId、独立GenerateItemMethod对话框、authorContext/authorInputs、方法方案页 | AC01/03/04/09：openui-workitem、workitem-composition-conversations/method-references；workitem-unification模块固定输入与同一私有Work；真实模型另由总track记录 |
| child-stage-inputs | 子项成果→复制新Work作者输入/旧生成对话框 | AC04/05/13：child-stage-inputs、descendant-stage-inputs模块保持多轮分组/精确材料/显式选择；openui-process读取真实内部成果，openui-workitem继续选中记录 |
| workitem-decomposition、workitem-decomposition-lifecycle | 公共workflowId运行、旧处理方案/批次窗口布局与旧字段编辑 | AC06/07：workitem-decomposition的11个真实文件/HTTP场景全部迁唯一私有Work；item-batches、create-items-integration、lifecycle-process保持批次暂停/在途观察/恢复/preview不写等机制。当前子项GUI由workitem-composition-navigation验收，不声称旧窗口布局存在 |
| workitems | 新建时绑定公共workflow、旧准备执行对话框 | AC04/07/11/13：openui-lifecycle两尺寸等待→提交事件→同Run继续→发布→人工依据结项→重开→补材料，证明运行成功不结项、材料不改写旧Run |
| workitem-progress、workitem-report、workitem-review、workitem-citation | 旧详情“进展/成果与过程”页签、旧报告依据侧栏和逐项引用布局 | AC08/11/13：work-items/workitem-progress模块14条保留Pi报告/当前来源/迟到拒绝/条件/重开/汇总/失败保存；criterion-citation模块保留精确引用；openui-lifecycle实际人工条件及重开；openui-process实际来源链路。旧侧栏阅读位置不再是合同 |
| cve-fanout、result-summary | 旧WorkItem结果总览、专用摘要布局与旧格式读取 | AC08/10/11：cve-v2模块保留23目标精确配对/无模型汇集/并发/失败原文；result-summary模块保留普通schema及真实摘要；openui-lifecycle31个真实map实例检查材料→结果精确一一对应和旧轮次冻结；OpenUI呈现声明的Report/Records，无专用CVE内核 |
| output-layout、material-cards | 旧成果卡片展开/原始值工具栏与材料历史卡片几何 | AC02/05/11：openui-lifecycle实际31记录分页、长详情、来源精确实例、搜索、旧交付不变及横向溢出；openui-workitem官方Records/InputForm；material-presentation模块保留可读材料命名。旧卡片布局被原生OpenUI表格/详情及输入清单取代 |
| workitem-workspace中绑定旧详情GUI的场景 | 跨公共方法更换workflow指针、旧成果检查入口/旧总览选择状态 | AC05/11/12/13：openui-process真实固定call→子Run→内部输入/输出与来源；openui-lifecycle来源跳转和旧交付冻结；workitem-unification失败输入新commit及显式汇合。原文件保留3条普通无WorkItem运行的失败重试、多选续做/改进、无成果态、迟到结果选择及多端口检查，继续测试共享Run界面 |

management-presentation保留列表排序、分页、刷新焦点和键盘断言，只更新真实WorkItem必需字段。普通方法画布/表达式/结果检查等其它spec不因业务GUI退役删除。新lifecycle使用随机端口和临时数据，无托管数据写入；fixture函数计算并非真实模型质量验收。

原生OpenUI旧DSL族迁移与浏览器实测另见 [OpenUI validation](openui/validation.md)，由OpenUI代理维护。当前native生命周期另增加父子独立业务输入、逐条候选回执/同源去重与当前子项对话框往返，两尺寸实际通过；不只由模块覆盖。
