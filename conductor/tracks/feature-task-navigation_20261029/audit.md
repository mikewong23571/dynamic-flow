# 新agent只读审查与系统修复

2026-10-29，navigation_state_audit与navigation_surface_audit均为本次新建，只读调查和复审；实现由主代理统一完成，未派发并行编码。

| 真实反例 | 统一修正 |
| --- | --- |
| 自建父入口push模拟返回；独立对象误成父子 | 原生历史+具名对象链接，固定位置/视图层 |
| requestedFocus effect抢走成果视图；总览与URL不符 | 有限view与Run同一URL权威，三视图常驻 |
| A来处被当成B运行归属 | 页头原任务与运行所属工作项分开 |
| A保存迟到覆盖B/清dirty；保存中继续编辑丢失 | perform和本地回写按activeWorkId守卫，definitionRef比较新编辑；切换前flush |
| A工作项回执卸载B；重开A丢选中/表单/Tab | 按id更新和保留现有详情，显式导航选择，读取缓存阅读位置 |
| 保留页面的Portal仍覆盖新页 | ContentVisibility/DeferredContent统一到Modal及菜单/Popover内容，保持store但停止呈现 |
| A直接输入仍开着时切B，无提示重绑 | usePanels对话框按方法id隔离，保留各方法表单实例；表单显示目标方法/版本 |
| 缺失Run吞页头/原任务入口 | 结果区局部错误，方法骨架与原任务保留；缺失方法也保留原任务 |
| 来源缺失时局部恢复入口消失、旧轨迹跨根 | 轨迹独立于成功读取，根Run隔离；实际来源方法/版本可见 |
| 明确成果/端口/index失效读第一条 | 就地错误，允许用户明确重选；不自动替换值 |

修复前状态agent用实际useActions和延迟fetch重现：activeWorkId=B后释放A保存，baseId变A-v1，并写入busy=false/dirty=false/definition=saved-A，receive虽受保护仍不足。该输出为修复前证据；修复后测试见evidence。

两位agent的App整页missingRun观察来自实施中较早快照；当前源码已移除整页拦截，并用缺失Run浏览器路线核查，不能当未解决问题反复登记。审查结果按反例复核，不直接当最终验收。
