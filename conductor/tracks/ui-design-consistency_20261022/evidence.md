# 本轮实施与验证

2026-10-22。源码已完成；以下只记录本轮检查，不把历史通过记录当作当前结果。用户视觉接受仍由用户判断。

## 实际改动

- WorkItemDetail：身份/状态/返回合成一行，稳定页头约108px；阶段、执行、已确认条件以三组标签/值展示，执行解释独立成行，长下一步/阻碍自然三行预览并可展开；保留等待事件、错误、目标与处理方法入口。
- WorkItemExecution：轮次从纵向大卡片改为横向紧凑选择，方法名可见，固定输入和进入方法放同一区域；去掉重复的方法大标题；环节76px等高，标题与状态行对齐。轮次和内容整体构成成果检查region。
- WorkItemArtifact：标题/状态与使用成果操作同一行；产物/输入/执行记录与内容/原始数据工具行并列。仅一层成果内容面，主要动作在报告前，不必滚到全文末尾。
- ArtifactValue：主报告自然页面滚动、76ch阅读宽度、实际正文14px/1.8、表格13px；嵌套文本、原始JSON与工具记录仍局部限高；集合保持宽表、分页、搜索和状态。可选受控view用于组成现有工具行，独立内容查看仍本地管理模式。
- Management：工作项与流水线库共用的页头、列表行间距和内容材质同步，paper背景与surface表格区分。沿用现有页面组合，未给画布和Assistant套管理页布局。
- 控件：详情表单/条件依据/集合搜索使用现有Input/Textarea/NativeSelect；复选框保留原生。共享input边框指向line-strong。删除旧详情页头冲突与本次失效样式，相关CSS就地整理，没有新增基础组件库。

## 浏览器与自动检查

- `pnpm typecheck:app` 通过；`pnpm build` 通过，仍有已有的大chunk提示。
- `FLOWCRAFT_EVIDENCE_DIR=conductor/tracks/ui-design-consistency_20261022/evidence/browser pnpm test:browser tests/browser/workitem-workspace.spec.ts tests/browser/workitem-progress.spec.ts`：12项通过，见 [日志](evidence/browser-regression.log)。
- 主要动作移至内容头部、正文排版修订后，6项workspace通过。用户追加进展区反馈修订完成后，重新类型检查、构建并跑全部12项再次通过，见 [最终日志](evidence/browser-final.log)。
- 用例使用独立临时目录、私有真实HTTP/runtime服务和明确的模型替身；涵盖两种尺寸、采购集合/文本报告、来源/返回、条件草稿、比较/补充证据、历史定位、失败重读、等待/运行/结项重开、50条分页与大正文延迟渲染、非空侧栏。
- 初轮中移动入口越出成果检查region，既有来源路线在查找“在流水线中查看”时失败。修正为整组轮次和成果共享region，未放宽断言。初轮1失败、1人工中断、7通过不作验收；保留 [初轮日志](evidence/browser-initial.log)。
- 真实CVE数据只读检查，无模型调用，无用户数据改写；页面无pageerror和横向溢出，见 [两尺寸样式实测](evidence/performance/visual-observations.json)。环节按钮统一76px、标题与状态行位置一致。
- 此轮没有修改后端状态/投影语义，未重跑后端模块测试或真实模型。没有生产环境性能宣称。

## 截图与设计复核

- [1440主报告](evidence/performance/visual-selected-output-1440.png)、[1024主报告](evidence/performance/visual-selected-output-1024.png)：首屏显示清楚的进展分组、多行下一步、成果入口及头部动作；1024报告标题接近首屏底部，正文向下阅读，行宽受控；原方案第一字段约y797、顶部183px，现页头约108px；随后按用户反馈给进展事实和长下一步恢复分组间距，主报告阅读区域在1024约y698。以首屏状态/待办/成果入口清楚和阅读舒适验收，不追逐正文y目标（最终位置见独立测量）。
- [1024结构化集合](evidence/browser/collection-1024.png)、[1440采购报告](evidence/browser/text-method-1440.png)、[1440业务历史](evidence/browser/business-history-1440.png)：同一构图适配非CVE业务，集合和报告不强制同一内容宽度。
- `evidence/browser/`保留空状态、加载、等待、失败、报告、材料、比较与历史的两尺寸截图；本轮实际查看重点报告首屏/阅读、结构化集合、历史和菜单/表单，不以截图数量代替视觉判断。
- 独立设计review位于`evidence/review/`，逐次记录压缩重复导航、合并工具行、自然滚动、正文实际字号等修正。sample-v1/v2/v3属于中间版本，最终以progress-revision文件与最终源码为准。

## 旧track覆盖

`visual-sharpness_20260920`中对比/边框相关问题本轮在工作项与管理列表的内容面、输入边框、选中状态中已覆盖；未全盘采用旧token建议，未擅自勾完旧计划。画布/Assistant保持既有专业结构，由独立浏览器操作检查共享变化。

## 性能

同一真实CVE工作项、固定历史运行、1440×900开发服务、全新Chromium上下文，沿用相同measure.cjs与5个环节切换。前后三次串行测量；最终after在构建、浏览器回归和独立review全部结束后单独执行。

| 指标 | Before（三次） | After（三次） |
| --- | --- | --- |
| 首次打开 ms | 1174、1125、1145 | 1209、1169、1166 |
| 五次切换范围 ms | 190–246、146–226、178–226 | 160–248、168–201、160–243 |
| 最大长任务 ms | 209、205、205 | 211、200、210 |
| 初始/五次切换后 DOM | 304 / 554、304 / 554、304 / 554 | 310 / 588、310 / 588、310 / 588 |

原始数据和截图见`evidence/performance/before-{1,2,3}.*`与`after-{1,2,3}.*`。中间版本并发测量保留为`interim-after-concurrent-*`，不替代最终串行样本。测量反映本机开发环境的有限样本，不是生产SLA；首次打开与切换处于原先相近量级，未出现旧版数秒渲染退化。DOM小幅增加来自分组和头部操作，隐藏大正文与50条分页回归仍通过。

## 共享页面独立检查

主代理只读操作两尺寸真实管理/工作区，见 [结果](evidence/review/shared-check.json) 及 `shared-{dialog,inspector,assistant}-{1440,1024}.png`：工作项搜索/筛选、流水线库搜索、菜单键盘和Escape焦点、创建弹窗Tab焦点、节点配置、Assistant本地输入切换保留均通过；无页面错误或整页横向溢出，拦截器记录0写请求。未提交草稿、未修改业务数据。检查脚本首次使用错误库搜索aria-label超时，按实际标签修正后完成；这是验收脚本定位问题。

## 用户追加反馈后的修订

第一次样板把业务状态及解释压成单行、下一步和报告各省略成长行，用户明确认为仍拥挤。已修订为三组事实、自然多行关注事项、简洁报告入口和独立辅助行；报告全文展开后限制76ch，来源入口紧邻。spec与plan同步改为可读性优先，不以‘首屏必须出现正文’反向驱动压缩。此前sample截图保留为过程，不代替最后设计。

最终独立样式检查见 [progress-revision-observations.json](evidence/review/progress-revision-observations.json)：两尺寸页头108px、进展区约231px；正文实际14px/25.2px，报告宽684px，主报告阅读区1440的y≈702、1024的y≈698。顶部事实/长下一步的可读性为优先；报告主要动作首屏可达。

独立验收汇总见 [review/README.md](evidence/review/README.md)。追加展开检查见 [progress-check.json](evidence/review/progress-check.json)：172字下一步自然三行预览约70px高，展开不截断；362字报告展开宽684px、高约140px，来源与目标/方法入口可达。有效最终截图为progress-revision、progress-expanded和shared；pre-feedback-partial及sample属于历史过程。

## 追加交付：状态语言、工作区性能与统一运行检查

### 实现与边界

- 状态统一为集中Lucide映射与无边框文字，轮次紧凑状态保留title和屏幕阅读文本；画布数字进度附带真实状态名。工作项“已结项”与执行“已完成”保留明确不同文本；库中的已采用/草稿状态不再另用彩色边框标签。
- App的工作区三页签首次访问后保留状态，inactive期间memo阻断新父级快照渲染，激活时取新props；Work ID隔离方法缓存。工作项/方法宿主在跨入口返回时保留各自浏览状态。
- 两入口真正共用`results/RunInspector.tsx`、`RunArtifact.tsx`、`run-inspector-model.ts`与`RunInspector.css`。共享的是检查一次固定Run，不是把当前Definition编辑画布与历史Run合并。核心只接收真实work/definitions与RunFocus，不制造WorkItem。
- 核心包含实际参与环节、实例选择、固定定义（含动态展开）、产物、固定输入/上游、执行记录、复制与已访问实例保留。单节点范围外的定义节点不会冒充等待；明确缺失实例不自动替换。
- WorkItemExecution外层保留轮次、读取错误/重读、证据/条件和成果比较；WorkItemArtifact现仅包含业务动作。Results外层保留运行选择、固定版本/等待摘要、选择/保留/续做、失败重试、从结果改进和动态展开固化。普通无业务Run可直接使用。
- App完整交接workId/runId/definitionId/nodeId/resultId/instanceId；返回恢复原业务输入/阅读。比较做法与比较成果分别命名，未合并两种语义。
- 单份产物复制实际值：字符串原文、对象JSON；多份/多端口保留具名结构。业务补证据仍保留来源wrapper。方法页业务上下文为可读标题主行、编号次行、修订/正式或试验独立轻量信息，避免长编号挤压语义。

### 验证分期

统一前状态/性能阶段：14项通过，[日志](evidence/workspace-tabs/browser-regression.log)。真实B三页签基线见`evidence/workspace-tabs/before-*.json`，首次结果2869–2911ms、再次2415–2482ms；中间版本`after-*`为504–589ms、232–249ms。此阶段数据不代替最终共享核心复测。

共享核心当前版本：

- 最终类型检查与构建通过，沿用原大chunk提示；没有后端语义改动，未另跑全部后端单测。
- 19个不同浏览器案例验证通过：`workitem-workspace`11项、`workitem-progress`6项、`semantic-workflow`2项。一次整体运行17项通过，2项分页断言因同时匹配保留的隐藏流水线库而报严格定位冲突；限定实际“工作项管理”region后6项progress全部重跑通过，保留相同分页可见断言。[整体日志](evidence/unified-run/regression.log)、[progress最终日志](evidence/unified-run/progress-final.log)。
- 复制修正后再跑两尺寸同Run入口与普通运行3项通过，并实际调用Clipboard API读取断言字符串原文和对象JSON。[复制最终日志](evidence/unified-run/clipboard-final.log)。
- 覆盖普通无WorkItem失败→新版本重试→保留→跨运行多选→续做→从结果创建候选；旧失败Run深比较不变。真实function比较生成非空两侧大对象，验证分页、搜索和三页签选择/展开/scroll保留；不同方法缓存不串用。
- 动态展开、固化为候选、后续有限迭代与实例选择，两尺寸通过；动态旧用例原先期待所有实例同时铺开，按当前导航先选真实迭代环节后验证第2轮与实例选择，没有删除迭代验收。[首次定位记录](evidence/unified-run/initial-regression.log)。
- 所有写入路线均为独立临时目录、私有真实HTTP/runtime；Agent响应/动态规划为明确fixture，无真实模型调用。

### 独立真实运行复核

[两入口检查数据](evidence/unified-review/checks.json)：1440/1024两入口同runId、resultId、heading及产物全文SHA一致；上游实际来源可到达并返回原报告，方法与业务动作可达，回工作项保留原报告。可见状态为一个Lucide SVG、border 0；无pageerror/整页横向溢出。

[1024工作项](evidence/unified-review/item-1024.png)与[1024方法](evidence/unified-review/method-1024.png)、[1440工作项](evidence/unified-review/item-1440.png)与[1440方法](evidence/unified-review/method-1440.png)由主代理只读实看；执行代理另实看非CVE同Run、迭代实例和动态固化截图。原工作项概览/条件/材料/记录与方法画布/Assistant保持各自任务结构。

### 最终性能

最终独占测量完成，脚本加入timeOrigin一致性断言并确认结束时仍处于目标成果检查页面。同步src内指南曾触发Vite重载，相关受污染样本保留为`interim-hmr-*`，不作为性能结论。

| 路线 | 实施前 | 共享核心最终版（三次） |
| --- | --- | --- |
| 流水线运行结果首次进入 | 2869–2911ms | 375–376ms |
| 再次进入运行结果 | 2415–2482ms | 231–248ms |
| 返回流程 | 614–698ms | 132–232ms |
| 比较做法（真实B为空态） | 81–177ms | 97–158ms |
| 三页签DOM | 运行结果7391，流程740 | 首次999，访问后1002，保留已访问状态 |
| 工作项首次打开 | 本轮原基线1125–1174ms | 1125/1198/1162ms |
| 工作项环节切换 | 原基线146–246ms | 15次158–311ms |

原始数据：`evidence/workspace-tabs/unified-after-{1,2,3}.json`及`evidence/performance/unified-after-{1,2,3}.json`。工作项结束DOM968，包含保留的已访问宿主和统一图标，不能直接与此前卸载宿主的DOM数量按一比一解释。未出现旧版数秒渲染退化；墙钟为本机开发环境有限样本，不是生产SLA。真实B比较为空态，非空比较用私有真实运行fixture补足，不将两者混称同一实测。

完整独立验收、同Run哈希/来源/图标与测量排除说明见[最终独立证据](evidence/unified-review/README.md)。

## 最新追加：运行检查的对象与操作优先

已移除成果主体前“本次固定的问题认知”的说明块和动态展开节点长列表/连接文字串。运行依据与环节要求统一进入两入口共有的“输入与依据”：运行依据使用现有Dialog按需显示冻结真实字段；环节要求按需展开，有数据才出现。动态节点由已有导航检查，“保存为候选做法”位于当前父责任或生成环节的方法动作区，保留原freezeExpansion协议与禁用条件。

成果比较的独立实现说明收敛到“字段 / 位置”表头及其title，实际差异、过期警告、真实报告、错误与必要空态指引保留。没有全站文案替换或新增业务功能；产品/设计/模块/控件指南同步了对象与操作优先原则。

本轮类型检查、构建通过；仅运行相关6项浏览器用例，全部通过：[日志](evidence/content-organization/browser-regression.log)。覆盖两尺寸动态固化与后续迭代、跨方法成果比较、同Run两入口冻结依据。新增断言验证：未访问依据不挂载；当前定义已改为新目标/职责后，两个入口仍读取旧Run冻结字段；新的保存候选动作真实执行。先前19项与性能测量保留为分期记录，本轮没有重复全套或性能矩阵。

[独立两尺寸实看](evidence/interface-content/README.md)与[数据](evidence/interface-content/checks.json)：主界面旧说明块不存在；产物主面没有额外依据入口；两入口依据Dialog均匹配真实Run的5个冻结字段，Escape关闭有效，未出现pageerror或整页横向溢出。执行代理另实看动态主界面与非CVE依据截图；截图完成后才同步src指南，避免热重载干扰。


## 最新追加：业务总览与独立成果层级

方法运行结果现在默认业务聚合表格，展开查看本方法历次执行；独立运行按真实scope/effectMode标识。显式最终成果可以独立浏览，查看过程才进入共享RunInspector；业务状态来自当前items，Run只保存历史身份和执行状态。结果空间全宽，回画布恢复原面板草稿。

按用户最新意见撤掉重复面包屑；从列表进入详情返回原列表，从成果进入过程只返回原成果，跨工作项保留原工作项返回和查看方法总览。所有返回保留当前列表/阅读状态。显式新运行回更新总览，后台记录不会抢走当前成果。

[本轮独立记录](evidence/results-hierarchy/README.md)含源码责任、原型边界、类型/构建与18项浏览器回归（全部通过）。其中真实HTTP/runtime+临时文件验证与Agent fixture明确区分，未调用真实模型。过渡失败日志保留，未算完成证据；前阶段19项/6项与旧性能属于历史，未冒充本轮测量。

最终真实数据证据：[两尺寸独立实看与三轮新口径性能](evidence/results-overview-review/README.md)。总览218–253ms，成果283–299ms，过程400–450ms，返回原成果167–183ms；无页面异常/整页横溢出。先前版本直接进入检查器与本轮总览终点不同，不作同口径比较。

## 最新追加：成果分组、操作归位与独立设计审查

用户指出checkschecks报告及工作项结果页通过旁白堆层级。本轮已将成果按冻结输出分组、整行展开真实预览，实例引用/比较名称区分；工作项轮次/步骤紧凑导航，默认旁白和重复面包屑移除，运行/成果使用/条件保存结项按对象归位。

[本轮总证据](evidence/result-groups/README.md)包含独立初审和最终两尺寸复看、根复核、真实数据不变证明；[results验证](evidence/artifact-groups/README.md)3模块+8浏览器+1引用身份，[工作项验证](evidence/result-groups/workitem/README.md)12浏览器，合计21个不同浏览器案例。最新typecheck/build/diff-check通过，构建保留既有bundle体积提示；未全局回归、未重跑模型、未提交push。

独立审查推动修正了首版长值过滤丢身份、窄列展开和ghost入口难辨的问题；最终无阻碍本轮交付的设计问题。条件编辑表单和通用数据预览的现有边界如实记录，不声称全站设计完成或用户审美已验收。

## 最新局部修正：Table成果入口与操作列

用户指出居中/左对齐混杂及意符不清；只修当前table。统一对象行、数量/展开信号与动词操作按钮，稳定列宽和真实顶部/左侧基准。2项非CVE两尺寸浏览器验证与最新类型/构建通过，独立实际截图/文字坐标复看通过；上轮21项未重复。见[本轮证据](evidence/result-affordance/README.md)。阅读工作区重做提议已按用户纠正撤回，未实施。

## 最新：统一运行成果页，共享过程页构图

最终统一运行成果页已完成：复用过程页分组/实例/内容组件，表格统一入口，单份直读与多份切换；10浏览器+3模块、类型/构建通过，两尺寸真实与私有样例独立审查完成，真实数据不变。未提交/push。 [完整证据](evidence/unified-artifacts/README.md)；旧sidebar证据为撤回中间方案。
