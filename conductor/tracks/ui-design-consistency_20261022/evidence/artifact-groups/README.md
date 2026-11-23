# 成果分组与共享实例检查：本轮实施证据

本轮修改results投影/总览/详情/共享检查器及对应指南，保留后端和真实运行数据。工作项页头/条件/轮次由另一实现者负责；独立reviewer只读审查。源码未提交、未push。

## 实际行为

- 同Run、冻结最终输出绑定(nodeId/port)为一组，多个别名不重复产物；不同Run/port不混组。未知技术输出键回退冻结步骤名，没有checks/CVE特判。
- 多项组在完整表格行展开，两项并列呈现真实标量预览与短“查看”动作；单份报告直达。仅成果视图使用相同规则，展开/查询返回保留。
- 预览显示最多6个原顺序实际标量字段；长字符串截断/两行显示，title保留全文，复杂字段不预渲染，不解析JSON字符串或猜业务身份。
- 共享实例菜单按需打开，足宽/限高滚动；步骤导航为名称+统一状态图标。独立成果标题/来源/动作合并，低频保留/改进/原始数据进入“更多”。
- 多实例引用标签补与选择器一致的第N项，条件和比较可区分，来源ID不变。

## 最新验证

1. `pnpm exec tsx --test tests/artifact-groups.test.ts`：[3项通过](model-green.log)，[原红](model-red.log)。跨实例/多端口/跨Run分组、别名去重、旧Run固定标签、准确focus和值、长标量保留均验证。
2. `FLOWCRAFT_EVIDENCE_DIR=... pnpm test:browser tests/browser/workitem-workspace.spec.ts --grep '成果按冻结输出|成果集合查看过程|结果总览按执行|普通无工作项|大成果按需渲染'`：[最新整行展开8项通过](browser-final.log)，38.4秒。两尺寸分组→具体项→过程→原成果→列表保留展开/查询；仅成果、多实例选择、普通无业务失败/重试/续做、大集合按需渲染与阅读状态、旧总览返回均覆盖。
3. 最后身份标签修复：`pnpm test:browser tests/browser/workitem-workspace.spec.ts --grep '同环节实例'`，[1项通过](identity-browser.log)。私有HTTP页保存第2项引用后校验真实resultId/label，两项比较栏名称不同。
4. 最后源码与指南完成后重新执行：[typecheck](typecheck.log)、[build](build.log)均通过；git diff --check通过。构建保留既有bundle体积提示。没有用旧结果代替本轮验证，也未扩跑全局测试。

浏览器写入全部在私有临时HTTP/runtime fixture；旧测试的全局工作项导航定位及控件定位按当前真实动作同步，没有在用户data创建测试项。

## 实看与审查

实施者实际看了[1024整行展开](groups-expanded-1024.png)、[1024实例菜单](instance-menu-1024.png)、[1024独立成果](group-artifact-1024.png)。1440对应图同目录。首次版本把展开塞入220px成果单元格并过滤长身份字段，经独立审查改为整行和截断保留；[browser.log](browser.log)的6项是该早期版本，不替代最终8项。

真实数据独立两尺寸审查在[result-groups/review](../result-groups/review/)。根已查看最终主体并核对真实2个Work+WorkItem未变。标签序号最后收口由新增私有浏览器用例验证；根负责最终track状态与证据索引。
