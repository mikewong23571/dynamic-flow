# 实施证据与迁移处置

本目录记录实际治理结果；baseline/ 是修改前审查，不能替代修复验收。隔离基线为 `99cef65b63155322a3f6f3ac684daaadcc760a25`；它包含用户此前未提交现场，不是治理实现。首个逻辑提交为 `6ebd59bdd34a85a83256a51a0ed6265cea7f83b4`，后续提交涵盖所有权清理、交接边界及最终验证。全部产品改动只在独立 worktree，不修改托管源码、服务或用户数据。

## 验收映射

| 合同 | 实现入口及证据 |
| --- | --- |
| SG01/02 | styles.css 保留 token/base/共享模式，App、Assistant、ModelSettings、NodeInspector、Results、WorkspaceDialogs 与 Prose 各有实际拥有者 CSS，WorkflowCanvas 拥有 ReactFlow 适配。所有自有规则在 components/base 层；第三方 ReactFlow 样式进入 vendor。DialogContent application 布局避免默认 utilities 压住应用尺寸；不靠提高选择器优先级补偿。guard 检查未分层/重复嵌套层和内部覆盖。 |
| SG03/04 | Button 唯一 API，标准32/紧凑28；Input/Textarea/NativeSelect、Field/FormFields/FormActions 公共接口。控件 font-normal 避免 Field 标签550泄漏；FormFields 自身清 UA padding/border/min-width。矩阵断言尺寸、weight、fit/fill、焦点、invalid、禁用和组内对齐，稳定截图已实看。 |
| SG05 | WorkspaceFrame 按窄视口计算有效停靠，保留用户 preferred mode/保存宽度。新测试实际命中启用动作；包括 item/method、1440→1024→1440、手动展开/隐藏、已保存560宽。 |
| SG06 | Modal/MaterialDialog 共享 useTaskDialogFocus；普通 Escape、关闭、成功提交返回原动作，真实移除或 disabled 触发回当前任务标题，隐藏页不抢焦点。DialogPortal 与材料根 open 遵守 ContentVisibility；真实SPA明确 flow→inputs 历史回退/前进验证无旧Portal。 |
| SG07 | 保持14px根字号，以现有根暗色语义token作为当前主题，不开启休眠.dark分支；success 取代未定义 completed。颜色/常用字体、间距、圆角、控件高度集中；保留业务几何与少数专用文字/间距值。guard 阻止新字面色/内建彩色调色板旁路。 |
| SG08 | inventory-after.json 逐源文件SHA与原生保留项；所有旧兼容Button调用及raw可编辑input/select/textarea已迁移，死WorkResultSet.css移除。原生与动态样式处置见下表。 |
| SG09 | check:styles 与独立PostCSS开发依赖；style-guard-positive.txt 阳性注入后还原。5张稳定golden（两尺寸工作表面/任务及控件矩阵）避免时间/ID动态区域，最终回归无update-snapshots。 |
| SG10 | 既有55浏览器与24模块测试、最终22直接受影响回归；失败保留/503重试、导航、草稿/会话、固定Run、材料/来源/版本引用等真实临时后端路线。合成材料与纯函数真实执行；未测试真实模型或托管用户数据。 |

## 全模块迁移及保留

修改后为103个TSX、26个CSS文件，未分层文件0、未达CSS0。该静态扫描为候选清单，关键调用双方人工核对，数量不是验收门槛。全部260个一般动作使用统一Button；保留的18个native button是带专用布局/状态的交互模式：

| 拥有者 | 保留项与原因 |
| --- | --- |
| CanvasPane / CompositionFlow | 各1个问题定位导航项，不采用普通动作外观 |
| ContextPanel / CompositionAssistant | 各2个面板Tab，保留selected导航语义 |
| Assistant | 1个建议卡片（整块内容入口） |
| WorkLibrary / ItemRelations | 各1个管理列表标题链接式入口 |
| ArtifactValue | 2个展开/表格单元内容入口 |
| RunSelection / ChildStageChoices | 各1个步骤/阶段导航 |
| CompositionInputs | 2个材料标题/内容阅读入口 |
| RecordTable | 1个列排序表头 |
| Sidebar | 2个复合资源/模型状态导航入口 |

27个native input全部为23个checkbox和4个file；保留真实原生选择/上传语义，所在业务拥有者见inventory-after.json。Inspector/SemanticFields/CollectionEditor/ExpressionEditor、设置目录、工作空间表单、工作项/条件/子项/输入、OpenUI、结果/Assistant均已迁移可编辑字段和普通动作，不再依赖兼容Button或后代内部外观覆盖。

三个动态style入口保留：WorkspaceFrame用户宽度、WorkflowEdge第三方边几何、ResultsOverview运行数据决定的列比例。画布位置/曲线、表格列宽、专用reader/source-editor高度、导航卡片几何不转成通用控件token。native checkbox/file和导航选择器仍可由自己的组件定义；页面不得覆盖已迁移控件内部padding/font/颜色。

## 分轮证据与限制

- regressions-red.txt：实施前3个有意失败反例；foundation-browser.txt：基础样板3条通过。
- controlled-focus-red.txt：普通受控任务 Escape 回BODY的真实产品反例。focus-diagnostic-observed.txt 为扩展测试诊断；中间“DOM复用”推测已撤销。Radix aria-hidden 导致普通 getByRole 计数0并不等于真实移除，最终用 includeHidden 屏障验证动作确实移除。
- material-visibility-red.txt：修正后的有效反例；明确回到flow且aria-selected=true后旧Dialog仍有1个。恢复可见性约束后的对应通过日志 material-visibility-green.txt。最初裸URL回退不保证隐藏inputs的测试前提错误已丢弃，不用作产品缺陷证据。
- adjacent-55.txt：冻结产物上55条既有浏览器全部通过，产物SHA见adjacent-build-manifest.json；此轮早于最后的材料Portal与字段组细节修复，不声称它是最终产物全量重验。
- modules-24.txt：24条client/navigation-actions/openui/canvas-layout/canvas-view-state模块回归通过。
- final-contracts-and-navigation-22.txt：最终构建14条治理、2条方法引用、6条导航合计22/22通过，无更新golden；最后变更的直接影响路线已重跑。既有55条中8条重复，去重为69条不同浏览器用例，不把轮次累计为更多覆盖。
- final-typecheck.txt / final-build.txt / final-style-check.txt：最终类型、构建、守卫通过；构建仍提示既有bundle大小警告，未扩展为拆包优化。

全部浏览器测试使用fixtures.ts创建的临时dataRoot、随机端口及独立--output，不接触4320/4321与用户模型。模型设置截图中的密码为未提交的合成字符串，取消/重开断言为空；没有保存密钥或复制models.toml。两尺寸工作区、任务、材料和设置截图已实际查看，新矩阵字段组左右与普通字段对齐。真实模型、用户业务数据、完整原型所有长尾路线与用户主观视觉确认未执行；69条测试也不表示所有行为均穷尽。
