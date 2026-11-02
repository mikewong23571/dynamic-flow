# 统一运行成果页：共享组件实现与验收

当前版本遵循用户最后确认的信息架构：上方切换最终成果分组，组内选择实例，下方阅读成果。运行表只呈现数量、查看成果和次要的查看过程；仅看成果保留分组列表，同样进入此页面。没有表格内嵌实例列表或独立侧栏布局。

## 实现

- `RunSelection` 提取运行过程已有分组导航和实例菜单；`RunInspector` 与 `RunArtifactsPage` 使用同一 JSX 和样式。
- `ArtifactPresentation` 提取原内容头、复制和查看方式；`RunArtifact` 与成果阅读面共用。
- 成果仍按冻结 Run 的最终输出绑定分组，复合 `resultId/port/index` 区分同节点不同端口；不推断业务字段或主报告。单份无空导航，只有访问过的成果挂载正文。
- 导航请求只消费一次；首次可用成果选定后，迟到实例不会抢走选择；隐藏工作区不重算。切组、过程返回、列表重入保持选中、搜索、展开和正文滚动。
- 复制与保留/续做操作作用当前实际结果和值，使用原来源标识。无成果也可进入空态和过程。

## 当前验证

- `pnpm typecheck:app`：[日志](typecheck.log)，通过。
- `pnpm build`：[日志](build.log)，通过。该构建包含最新三块 JSX 共享实现。
- 定向浏览器：[shared-browser.log](shared-browser.log)，8 项通过：两尺寸总览/独立成果/返回2项，集合查找展开/读位/过程返回/复制失败1项，单份与10份两尺寸4项，无成果1项。
- 首次可用/迟到实例、同节点多端口：[shared-multiport-browser.log](shared-multiport-browser.log)，1 项通过。初次失败是测试切换新方法时只改current localStorage，旧opened-works仍恢复旧方法；改为真实页面“全部流水线→分开记录”并断言标题。未修改产品恢复逻辑。
- 投影模块 `pnpm exec tsx --test tests/artifact-groups.test.ts`：[shared-projection.log](shared-projection.log)，3 项通过，含冻结定义、同Run不同端口与精确值/来源。
- 工作项共享实例/条件/比较回归：[shared-workitem-browser.log](shared-workitem-browser.log)，1 项通过，确认共享实例选择仍保持条件引用和成果比较的名称/来源准确。

两尺寸私有 HTTP fixture 使用临时数据与确定性执行，不调用模型、不写真实工作项。10份菜单实际产生溢出，1024下高度413、内容高度963，测试滚动并选末项；不是仅检查CSS。测试覆盖搜索记录19、展开正文、阅读位置180、复制准确JSON、保留准确resultId、背景快照与流程页签往返不抢选择、成果→过程→返回、列表条件恢复。

## 当前共享版截图

- [10份初始1024](unified-initial-10-1024.png)、[1440](unified-initial-10-1440.png)
- [实例菜单1024](unified-picker-1024.png)、[1440](unified-picker-1440.png)，[几何1024](unified-picker-1024.json)、[1440](unified-picker-1440.json)
- [单份1024](unified-reader-1-1024.png)、[1440](unified-reader-1-1440.png)
- [10份阅读状态1024](unified-reader-10-1024.png)、[1440](unified-reader-10-1440.png)

独立审查位于本 evidence 的相邻 review 目录，真实 A/B 和非CVE单份/10份/空成果均以 shared-* / final-review 为当前证据。`browser.log` 与 `unified-directory-*.json` 是已废弃侧栏方案的中间验证，不作为当前验收；`red.log` 保留新合同最初失败证据。

本轮未运行全仓回归、真实模型或负载测试；无后端/运行数据变更。代码未提交或推送。

独立审查结束后，私有34311服务已发送SIGTERM正常退出（exit 0）；服务退出钩子完成临时dataRoot删除。正式4320/4321未操作，截图与日志保留。
