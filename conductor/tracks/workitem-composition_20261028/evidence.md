# 验证与交付证据

状态：当前T仅完成任务访问合同文档，导航改造与NAV验收待办；见末节及task-navigation-contract。以下保留此前原型的分阶段证据，不代表新导航合同已验收。

分别记录模块、HTTP/真实运行、fixture 模型、真实模型、浏览器和视觉结果。实现存在或类型通过不作为完整验收。

## 当前已取得证据

- 起点1881文件快照、独立依赖副本及基线typecheck通过，位置见plan.md。
- runtime已报告新组合调用/分组12项及相邻执行/集合回归通过，具体记录见runtime.md；根后续统一复核。
- backend已报告私有流程、真实输入、交付来源、选记录调用及输入修订定向测试通过，见backend.md。
- frontend已报告1440/1024两条页面主线通过：创建、文件、Assistant fixture保存、call运行、表格、跨Tab/轮询选择、实际两条接续、条件保存及结项。根已独立看图并要求默认收起空配置、业务列标签及逐行来源入口，修订后待最终复核。

## 真实模型

首轮使用用户当前默认模型 `sangfor/deepseek-v4-flash`，没有替身。输入为五条明确标注的假设判断记录，不验证真实漏洞风险。

模型实际读取两种方法合同，保存固定call组合、运行、按仓库版本分组，发布五条明细与三条分组的两份交付。同一轮约124.5秒；中间一次表达式基数错误产生真实失败Run，模型检查后自行修正，未隐藏历史。记录见[evidence/live-model/result.json](evidence/live-model/result.json)。

第二轮发现同项文件链接重复创建引发EEXIST，导致保存复用方法/接续的请求在模型调用前失败。这是必须修复的真实闭环问题，尚不能把该轮计作方法复用通过。另一个新工作项成功处理自己的两条新材料，使用了已有基础方法重新组合；不能将其冒称复用了尚未成功保存的整套方法。原始记录见[evidence/live-model/reuse-result.json](evidence/live-model/reuse-result.json)。

## 根统一回归

一次11个相关测试文件的合并执行为140项，139通过、1失败：新交付测试在动作返回后读取workspace失败。已交backend核查真实响应和修订变化，修复后重验。其余runtime/assistant/IR/集合/生命周期路线通过；本次失败不隐藏。

全部实验使用独立临时数据。模型目录和设置只临时提供给测试进程，报告不包含密钥；每轮结束移除临时凭据文件。托管服务未修改或重启。

## 修复后定向复核与界面重建

根重新运行12个相关测试文件（含持久会话链接测试），142项全部通过。前次140项中的失败是测试新增双输入却未真实绑定输入；修正为selectInputs并检查实际HTTP状态后通过。来源、固定调用、集合、私有工作空间、交付、接续、生命周期与Assistant相邻路线通过，不代表视觉或真实模型全部验收。

用户否定此前工作项信息架构及Assistant入口；此前frontend的通过只证明该版交互接线，不再作为最终UI验收。已用新agent审计全工作项页面，root确认[ui-framework-v2.md](ui-framework-v2.md)，实施与独立复核见frontend-v2.md及ui-journey-review.md。旧截图保留用于说明问题。

## 真实模型复验：接续与整套方法复用

持久会话文件链接修复后，根使用独立临时数据进行了三次真实默认模型对话：保存整套流程及视图模板（17.7秒）、同项只选A1/A2接续并发布第三份交付（97.9秒）、新项以新文件N1/N2调用该整套方法的固定版本并发布两种视图（31.8秒）。三轮均completed，实际启动运行completed；查看保存定义确认新项只有一个固定call，输入直接select_inputs引用当前M01，不带第一项业务材料。见[verified-reuse-result.json](evidence/live-model/verified-reuse-result.json)及对应脚本。

模型中间遇到真实check/save/continue工具错误并修正，日志保留，不能将最终completed描述为全过程无误。接续Run.inputs确实只有A1/A2且保留来源result ID；首轮原交付来自修复前缺少原材料映射的输入，因此该旧链的materialIds为空，不能把此轮当作原材料来源已被补齐。新工作项的M01绑定与文件原文来源正确；完整精确材料交接由定向HTTP测试另外验证。

复验第一次复制旧临时目录时，持久会话中的绝对文件软链仍指向旧目录，触发已有明确冲突错误；仅测试副本重定位软链后重验。没有为让测试通过削弱产品的冲突检查。此验证证明编排/执行/呈现与方法复用，不证明真实漏洞结论或安全审计已经完成。

## 业务联测发现的来源修复

新增CVE方法配方以明确假设判断测试8条原告警与两行接续时，失败断言确认received的精确source虽已存在于工作项及Run.inputSources，却未复制至每条InputItem。根补齐received/直接成果/记录级选择的固定source；随后加强逐项call的既有测试，真实失败证明子Run此前广播了父Run全部inputSources（含其他目标）。已改为只继承实际映射/广播输入及对应结果来源。

修复后7个相关测试文件49项通过，覆盖runtime、业务配方、backend、lifecycle-integration、child-stage、decomposition及旧batch-result。业务agent后续还加强了重复记录的非零index断言，最终统一检查再覆盖。未修改旧Run或用户数据。

## 最终模块与集成回归

根合并执行16个相关测试文件，159项全部通过（约21秒），包含业务配方最后新增的重复原告警非零source.index断言、来源修复、固定call、旧整批成果、子项阶段/分治、IR/集合、Assistant及生命周期。日志见[evidence/final/module-regression.log](evidence/final/module-regression.log)。typecheck:app同时通过；前端最终整理后的构建/浏览器另记。

独立预览4331仅在确认两个预览工作项无活动Assistant/Run后重启加载修复，沿用原临时数据。托管4320/4321没有修改或重启。

## 历史阶段：设计退回，产品实现冻结（其后已获落地授权）

用户已否定工作区骨架不一致、返回动作位置、工具堆积、子项空态和记录排版；并新增稳定工作台首页。旧内部“无阻断/通过”判断不再作为当前设计结论。根在被要求先完善track之前尝试的共享WorkspaceFrame、Tab/面板与返回调整只是未完成草稿；未对这些最新修改宣称类型、构建或功能验收通过。相关个人截图仅作中间现场。

当前未完成：稳定首页、完整信息架构和可见设计、设计审阅、代表页视觉修正及其后的功能验证。已保留技术资产与模型/HTTP证据，但它们不决定是否恢复编码。用户要求当前只完善track，由主代理执行，后续按workflow推进。

本轮文档修订不运行产品测试/模型、不改产品源码、不重启/部署服务。产品src冻结摘要记录在metadata.json，文档完成时核对摘要未变。

文档核对结果：当前spec/workflow/plan/acceptance/index/contracts/decisions/evidence的本地链接均存在，metadata可解析；入口已登记到conductor/index.md与tracks.md，旧UI方案已标历史。当前计划A完成，B/C及实施阶段未开始。本轮开始/结束的src摘要一致（215个文件），没有产品代码改动。

## 设计重置后的主代理落地（当前结论）

用户明确“落地”后，主代理独立完成B/C推演及完整设计，再按D/E实现、操作和看图修正，最后做F定向验证；未派发子代理。本节替代上文“尚未设计/冻结”的阶段状态，旧日志继续保留。产品仍在独立工作区，未提交或部署。

### 从用户任务组织界面

默认工作台使用需求/文件开始和继续列表；首次提交创建本项并真实请求Assistant规划，不自动运行。WorkItemStart和原创建弹窗复用create-item，部分上传失败保留身份及成功文件；规划失败按itemId绑定，切项不会串错误，重试不会重复创建。

WorkspaceFrame成为流水线和工作项实际共同使用的74px页头、46px导航、主区和侧栏实现；拖拽/键盘调宽/宽度记忆一致。方法返回靠共享页头左侧，普通方法入口无虚构返回。Assistant、Composer和Inspector复用现有组件及同一侧栏，1024停靠时保留真实输入和草稿。

流程默认展示图和必要运行控制，手工编排显式进入；成果内部视图按声明生成，切换不同交付仍保留各自选择。子项真空态不铺筛选/分页，非空和筛选无结果分别处理；记录只保留日期分组时间线，固定执行和来源对应事件。

### 设计与逐屏判断

设计产物见business-walkthrough、design/index.html和design-review。主代理实际查看1440/1024整页，真实页面见evidence/personal-implementation、personal-browser；设计稿仅作构图，不冒充产品。采用稳定标题/导航，降低常显工具密度，正文和图为主；修正方法设计稿重复运行、窄桌面成果会话挤压、长消息滚动、短交付分页和零条件保存。非空子项使用对齐的事项/进度两列，筛选空保留查找与清除；长标题截断并可查看目标，不撑高页头。

这些是主代理自审结论，用户尚未明确接受新界面；此前被否定的画面不作依据。实际看图后又发现两段call图缺连接，见下方反例及修复，未以先前测试通过遮盖。

### 定向浏览器及类型/构建

- 本轮全执行16项通过：evidence/personal-final/browser-full-16.log。覆盖首页、文件与创建、Assistant交互、图/运行、声明成果、精确记录接续、条件/结项、旧来源、等待/错误、长会话、停靠草稿与共享调宽。
- 交付切换保留选择2项、最终成果/条件视觉4项、长标题/子项非空及筛选空/实际停靠草稿3项随后通过，分别见同目录retention、visual-final-four、children-and-dock-three日志。其后新增测试，不能写作一次全套当前数量通过。
- 首轮首页3项失败不是测试放行：真实FileList在延迟state updater读取前被重置，导致上传丢失。先捕获File数组后重置input，失败重试3项通过，再完整16项通过。初次失败及重验日志保留。
- pnpm typecheck:app与pnpm build通过，日志见personal-final。测试使用临时目录和随机端口，当前浏览器配置没有webServer，不连接托管实例。
- 上文159项模块/HTTP是此前runtime及来源修复结果；本轮前端整理未重新跑159项，保留其版本边界。

### 真实模型：从新的首页开始

使用当前默认sangfor/deepseek-v4-flash，无替身。浏览器实际输入两条虚构任务的需求和tasks.json；模型发现两个方法、检查具体合同、保存固定call组合并绑定原材料。首轮25.3秒完成且无Run；第二次明确要求执行后17.4秒完成，实际Run完成、发布原始明细表和团队归组报告，R1/R2原值和来源保留，WorkItem仍open，未确认条件，无pageerror。evidence/real-home含脚本、result.json及图。

首轮真实select_inputs校验错误由模型检查后修正，日志保留；先前一次脚本在前端轮询更新前按快捷键未发出第二请求，已记录attempt-ui-timing，改为实际可用发送按钮后重验，不计作模型失败或成功。

### 新反例：画布端口与执行语义分叉

第二次真实模型画面复核要求每条真实边都出现，检查失败：两个方法、两条边，实际只显示1条。输入为call的具名records输出接下一方法records输入；失效假设是客户端旧outputPorts仍统一返回output，shared/runtime已支持call的outputNames。受影响为组合流程可检查及两工作区一致性。

最小client测试先真实失败（records/unmatched被画成output），随后删除客户端重复分支，直接重导出shared/node-ports的nodeOutputPorts。修复后client、多输入及布局17项通过；类型及构建通过。单独浏览器验证两call完整连接与两尺寸图通过（call-chain-final.log）；第一次新浏览器用例还曾误用save动作，修正为真实saveFlow/baseRevision再运行，没有放宽边数量断言。

### 范围与工作区

最终文件清单相对任务开始1881文件快照生成，见changes.json；不以HEAD差异把原有未提交修改算作本轮。原目录src摘要与起点一致，产品改动都在独立工作区。4330/4331为预览；托管4320/4321未修改或重启。

CVE领域推演支持7条原告警、8条范围关系、7个调查，具体假设见business-walkthrough；现有业务配方仍只有一告警一个范围的测试，未冒称多范围配方已完成。真实漏洞质量、仓库修复、安全审计、完整历史浏览器套件、移动端及PDF/DOCX真实样本未验；方法沉淀不会自动识别所有写死业务常量。交付范围和入口见delivery。

修复后主代理再次从全新首页使用真实默认模型：规划36.3秒、执行/发布17.4秒，两轮均completed，实际1个root Run完成并产生2份交付，工作项仍open。布局后严格检查定义的2条边实际均渲染，再截图；evidence/real-home-layout-review含result、脚本、执行日志及完整图。修复前模型复核的缺边失败保存在attempt-missing-edge.json，没有覆盖为成功。新增浏览器用例在1440→1024后最初被预期的覆盖会话挡住布局按钮；改用真实收起侧栏再操作后通过，不force点击，不修改产品覆盖规则。

当前新增端口修复之后：17项client/多输入/布局、类型、构建通过；主线浏览器两尺寸仍通过，新双call图检查通过。对应personal-final的call-ports-before/after、call-ports-build、call-ports-browser、call-chain-final日志。新的真实模型图已亲自查看：输入→读取方法→整理方法两段连接完整，窄桌面停靠后保留图的宽度。


## 2026-10-29：侧边入口、真实浏览器历史与列表布局

当前结果及限制见[navigation](navigation.md)。用户明确纠正顶层入口应在侧边栏，且列表留白过多；已撤销顶部入口Tab，将首页/工作项/流水线固定在左侧。两种列表移除1080px居中限制、嵌套边距和重复内标题，统一management-content；创建进入统一页头，搜索/筛选及表格同线，短列表不铺分页。主代理实看1024/1440/1920，当前图在navigation/preview-*，较早截图为过程现场。

此前内部切页只setState、没有History API。现在App/navigation提供有限地址及popstate，controller和工作项详情只恢复已有身份/Tab/固定Run，不重放模型或运行。直接打开及刷新恢复实际位置，第一次可正常退离应用。

最终完整22条浏览器通过（约1.7分钟），client/多输入14项、typecheck:app及build通过。日志在evidence/navigation-final；其间21项回归曾19过2失败，表格选择因方法往返卸载详情丢失，已修复并保留失败日志。额外固定执行路线使用两个真实identity Run，刷新仍选旧Run，切换后退后总Run仍2。截图/fixture/模型边界分别记录；本轮未重跑真实模型，10-28模型证据不充作本轮导航新证据。

所有浏览器使用独立临时目录与随机HTTP端口，预览只读截图；原src与初始快照一致，托管4320/4321未动。列表筛选/页码在当前实例保留，刷新重置；工作项最近详情table store保留，不承诺任意旧项store持久化。用户未明确接受本轮视觉。

## 业务界面与薄工作项收口（2026-10-29，当前）

主代理独立完成，无新子代理。当前合同见interaction-plan、interaction-review及delivery；九步骤图演示仅为历史局部能力。

- `pnpm typecheck:app`、`pnpm build`通过，日志interaction-final/typecheck.log及build.log；构建仍有既有大chunk提示。
- `tsx --test`定向composition-runtime/composition-business/composition-backend/workitem-interface/cve-interface：23通过，domain-runtime-http.log。新工具回执与同源界面检查补验8通过，tools-http.log；旧方案拒绝核对补验2通过，stale-review.log。
- Assistant29通过，assistant.log。首轮受宿主SOURCEGRAPH两项不完整环境配置阻断且测试等待，主动终止；仅在测试子进程移除两项变量后通过，未改产品或凭据，初次日志保留initial-environment-failure.log。
- composition完整29条通过，full-browser-29.log；之后布局/页签修正定向5通过，business-ui-5.log；加入响应到达处于鼠标按下/释放之间的换版本回归，两尺寸2通过，tab-rebind-2.log；最后空列表呈现调整后导航/交互7通过，last-navigation-and-ui-7.log。未冒称全部历史浏览器已跑。
- 真实默认模型（deepseek-v4-flash）两轮实际61.326/43.784秒，工具10/7次，状态completed。第一轮保存一个call、材料来源和四个界面视图/动作、两项未确认要求；第二轮明确执行并publish_ui_plan。完整回执在interface-model/result.json，模型非替身。
- 在真实模型保存的方案上实际页面补依据、明确提交虚构例外确认，三轮根Run全部成功，8条原告警全部保留、acceptedCount=8、未决为空；上游实施仓库仍保留。完成要求未确认且status=open，interface-model/browser-result.json。临时fixture另验证人确认后结项；不把代理填写假设表单称作真实用户安全批准。
- 初次真实预览绑定时，页签在更新中被替换导致选项定位失败，保留initial-preview-tab-failure.log；改为逻辑output稳定标识，并补鼠标时序回归后实际接续成功。重载独立API时一次取图捕获暂时读取错误，startup-interruption截图保留；待API就绪后两尺寸四视图及未确认验收任务重新取图，final-visual-check.log记录成功。
- 主代理实际查看最终1024/1440的分组、改动、逐条交付、空未决/核对入口及两类表单；表单间距与动作可达性已修正。最终图片interface-model/final-*，先前错误图不是当前验收图。用户审美接受、真实漏洞质量、真实仓库整改、多范围总验收及大批量性能均未声明。

独立预览4330/4331保留；本轮只重载该预览API，托管flowcraft服务保持active，未停止或重启。代码未提交/推送/部署，原目录src与任务起点快照相同。

## K：具名界面安排共编（2026-10-29，当前）

- 类型检查、生产构建通过；构建仍提示现有大chunk，没有把构建成功当作业务验收。
- runtime/业务配方/界面及新共编模块早一轮24通过；补完保留名称/结构保护及模板规范化后，共编shared/HTTP和相邻backend/interface最终12通过。各日志独立，不能相加称作36个不同测试。
- composition完整浏览器31通过；最后相关共编/通用交互/虚构CVE路线7通过；随后Tabs语义与只读详情收口，最新共编两尺寸2通过。未重复跑所有历史套件。
- fixture浏览器明确使用工具替身，验证页面焦点、保存、冲突、错误留草稿、选中记录保留及不重跑；HTTP验证坏字段原子拒绝、无关视图ID和旧快照、方法及数据来源。
- 真实默认模型deepseek-v4-flash实际30.843秒完成，只调用inspect_work_item、update_ui_block。人先改列标签，再选impact_detail要求加真实输出已有verification字段，模型保留原6字段，追加“原基线与后继验证”；其余视图、模板、动作及方法版本不变。页面自动接收干净新稿，实际记录详情可见该字段。完整结果见ui-authoring-real/result.json。
- 真实模型前后均3个根Run、根定义1个固定call，Run列表、定义、输入及完成条件均相同；WorkItem仍open。初次脚本在模型调用前发现勾选丢失，失败和修复后结果均保留，未涂改成成功。

命令、日志和实际脚本归档在[evidence/ui-authoring-final](evidence/ui-authoring-final)。截图、fixture和真实模型分别报告。


最终两尺寸current-*截图与final-visual.json为当前画面；较早final-*保留为过程记录。详见[当前规范](ui-authoring-spec.md)、[实施与视觉审阅](ui-authoring-review.md)。

## L：来源展示收敛（2026-10-29，当前）

按用户反例撤销交付来源编号按钮平铺；单来源直达、多来源菜单，复用DropdownMenu/Button/ArtifactPreview。当前两尺寸实看及来源精确性见[source-presentation](source-presentation.md)。来源浏览器2条、相邻业务/共编4条通过，类型及构建通过，日志截图见evidence/source-presentation；未重跑模型或完整历史套件。主目录212个src文件与原始任务快照一致，托管flowcraft仍active，未停止/重启。用户已明确只完善独立预览，不合入4320。

## M：页内来源卡片及Assistant职责（2026-10-29，当前）

用户反馈L菜单看不清，已改为正文内可收展卡片，规范与实际画面见[source-cards](source-cards.md)，日志和截图见evidence/source-cards。复用材料卡片外观、Button/DeferredContent/ArtifactPreview；应用负责稳定来源身份/收展/追溯，Assistant负责同一界面声明中的业务内容。

本轮两尺寸来源浏览器2条、类型和构建通过；实际查看展开/末尾卡片，无pageerror。未重跑模型或所有历史相邻套件。L菜单及其日志为历史结果，不作为当前视觉证据。独立预览4330保留，托管4320与主目录src不变。

## N：工作项调用节点内的流水线引用（2026-10-29，当前）

用户澄清针对流程节点，而非成果Tab；已在节点本体显示实际方法名称及固定版，点击查看对应保存定义。规范、反例与当前实现见[call-node-reference](call-node-reference.md)，日志及两尺寸图片见evidence/call-node-reference。

固定旧版及缺失/往返两尺寸2通过，相邻完整业务两尺寸及共用骨架3通过；类型和构建通过。初次关闭焦点失败留证，修复并重验。截图等待实际布局和fit完成并检查节点均在画布内；节点加引用后的窄桌面密度已修正。无新运行器、后端合同或模型调用，既有真实演示仍3个Run。主目录src及托管实例不变。

## O：单层应用节点及IR原语展示（2026-10-29，当前）

- pnpm typecheck:app及pnpm build通过；构建仍有既有大chunk提示。
- 布局/聚焦/视图状态/client模块19通过，layout-client-19.log；工作项工具/HTTP相邻模块8通过，tools-http-8.log。
- 固定版本及原语浏览器两尺寸共4通过，fixed-and-primitives-browser-4.log：旧保存版不替换为后续新草稿、缺失版本明确错误、单层名称、精确端口、条件两路、多路收集、共享输入及3次真实调用实例。
- 完整业务两尺寸及共用骨架3通过，adjacent-browser-3.log；两个固定方法具名端口串联的两尺寸检查1通过，named-chain-browser-1.log。分轮日志不冒称一次全历史套件。
- 新增primitive-display-fixture为合成记录P1/P2/P3：同一个eachPort逐项call产生3个子Run，共同facts端口广播；方法内expression.match按明确输入标记返回lane，外层branch分路，review得到P1/P3、ready得到P2，collect按两路收集。ready同时直接绑定根输出，未添加假收集节点。全部纯函数，无模型判断。
- 独立预览已安装同一明确合成演示，item=a60e11e5-a0a5-444d-8c24-31798a1337c6：实际HTTP执行1个根Run/3次调用并发布真实输出，仍open。实际浏览器随后只查看/整理布局，rootRuns和定义未变。原虚构告警演示仍3个根Run，本轮未对其重跑、补材料或确认条件。

Assistant指令同时纠正为“薄不强制单call”，明确必要输入构造/按项分发/分路/汇合可在本项，领域处理归公共方法；call仅map/aggregate，expression.match值变换与branch路由分开。工具合同/服务及运行语义均未改，8项相邻工具/HTTP通过。本轮没有重新验证真实模型自主规划质量，不借历史模型结果冒称本次新模型验收。

只重载独立4331以载入指令，事先检查4个独立预览工作项无活动Run或Assistant。托管4320/4321未停止/重启，原目录src未改，无提交/推送/部署。

当前视觉与职责取舍见[call-application-design](call-application-design.md)。

## P 当前实施与验收（2026-10-29）

展示闭环现有一条连续的页面路线：Assistant同时安排处理及可操作界面→输入/运行→绑定真实成果→按声明补信息/继续→更新成果→人工核对与结项。成果绑定后PlannedWork继续呈现状态与下一步，而非消失；when/actionBlockers只从当前uiPlan及Definition的固定绑定计算，未知规则不推断。方法已有但方案缺失/失配时，InterfacePlanTask把完善请求交给当前会话。历史成果继续保留并标记“此前”，不计入当前待办。已结项动作禁用原因与服务端一致，没有新增状态机或CVE逻辑。

多会话沿用Work.messages与原Pi runner。assistantConversations保存元数据，conversationId固定消息归属；只读GET投影main，新建/发送才登记旧消息。main仍使用原assistant/work-item目录，新会话使用assistant/work-item-conversations/<uuid>，彼此不复制JSONL。会话请求先验证归属，更新固定requestId，按同一Work串行，失败只落在相应线程。普通流水线作者入口不混入有标签的工作项聊天。

标题栏复用DropdownMenu/RadioItem及Button新建，原Assistant/Composer和可拖侧栏不变。选择/草稿存在当前浏览器标签页sessionStorage；切换和刷新恢复，旧发送回执只清理原会话草稿。正在回复的其它会话有返回入口。所有会话共享实时业务，外部完善/规划请求也进入当前选中会话；新建不运行、不复制材料或条件。

### 具体反例与修正

1. 初版刷新后storage仍有草稿而输入框空白：Assistant只取首次draftText，effect恢复太晚。hook改为首次即返回恢复草稿，并在切换/输入同步写入；保留失败日志，双尺寸刷新断言通过。
2. 补充处理发布新界面后，旧交付的when还贡献待办。仅当前planId/definitionId绑定计入下一步，旧制品标记“此前”且固定来源仍可检查；浏览器保留从1项待办到更新后人工验收的断言。
3. 结项测试在仍打开验收模态时寻找外部查看验收按钮。修正用例通过真实关闭入口回工作区，不修改业务断言、不穿透模态。
4. 宿主注入Sourcegraph网络配置使普通assistant用例不退出。仅测试子进程unset SOURCEGRAPH_MCP_URL/SOURCEGRAPH_AUTH_HEADER后重跑；未改全局配置或真实模型配置。此项为测试环境处理。

### 分层验证

- pnpm typecheck:app、pnpm build通过，保留既有大chunk提示。当前日志在evidence/conversations-final。
- 44项模块/HTTP：assistant、持久session files、会话、组合后端、interface及ui-authoring/HTTP；全部通过。测试使用临时目录、真实文件/HTTP和明确runner fixture，验证main兼容、独立目录、重启、归属拒绝、失败及跨会话串行，不冒称真实模型。
- 8项浏览器通过：两尺寸共编2、两尺寸跨会话完整业务2、界面失配1、迟到回执1、两尺寸完整虚构CVE交付/人工验收2。独立临时dataRoot/随机HTTP，当前dist。跨会话路线有2个真实纯函数根Run、独立草稿、补依据、成果更新、人工确认及结项后动作禁用。CVE用例以明确fixture判断及证据推进，不构成实际安全审计。
- 真实默认模型deepseek-v4-flash三轮：原main只记合成短词6.634秒→新会话inspect_work_item读取共享4视图/3根Run且没有该短词27.679秒→原main再次回忆成功5.871秒。全部完成，只有一次只读工具调用，无写入工具。实际证明Pi上下文独立及旧会话继续，而不是靠模型mock。该演示方法/材料/输入/Run/条件/业务状态均与验证前一致，仍open，未确认真实安全条件。
- 独立4330实操1440×900、1024×768：查看历史列表、切新会话阅读真实模型答复、切回旧main；无pageerror，两尺寸只读检查未新建/发送或改动业务。live-visual.json及四张live-*截图位于evidence/conversations-real。主代理已看实际截图，包括fixture当前待办、已结项及历史标记；用户最终视觉接受另列。

### 当前范围

仅独立预览，托管4320/4321不停止/重启/部署，原目录src保持任务起点一致，无提交/推送。只重载独立4331载入本轮后端；既有4个预览工作项当时无活动Run/Assistant。

首版无会话删除/分叉/自动摘要、多个会话并行写业务或独立模型覆盖；草稿不是跨浏览器服务端同步。消息仍随Work读取，未做无具体需求的分页平台。当前下一步只反映声明且可确定的任务，不是完整业务证明或通用完成率。真实模型本轮只证明上下文隔离/延续及只读业务感知，未证明任意长尾需求自动产出优秀UI；全部漏洞判断仍为假设。O图形原语证据保留，但未把所有历史套件算成本轮重验。

## Q 工作项流程原生标识

根因有两层：nodePrimitive将技术原语翻译成中文，工作项outputLabels又用交付业务标题替换了真实输出端口。现由CompositionFlow显式启用nativeLabels，WorkflowNode的原语、输入/输出及连线辅助文本使用原始标识；编辑与阅读保持一致，CompositionStep同样显示原生原语。示例为call · map/call · aggregate、branch、collect、input/output、matched/unmatched；分路条件显示真实equals等运算符。业务步骤标题不改写，计划交付沿用业务名称，交付别名只作为辅助提示。没有修改定义、Handle、边或执行，普通流水线及固定方法预览保留原有展示。

类型与构建通过；client/布局/聚焦/视图状态19项通过，固定调用和原语浏览器两尺寸4项通过，完整需求到成果路线两尺寸2项通过。首轮窄屏用例进入编辑自动展开Assistant后，结束按钮被侧栏覆盖；通过实际收起入口再退出，未force穿透或删除英文标识断言。失败日志保留。真实独立4330两尺寸只读检查仍为1根Run/3调用，无pageerror，已看live-primitive截图；英文原语和端口均可见。原目录src未改，托管不变，未运行模型。

当前日志及实际截图见evidence/native-labels；O的中文原语截图是历史，不作为当前标签依据。新真实模型设计属于R独立记录。

## R 无模板的真实Assistant设计与当前缺口

见[fresh-assistant-design](fresh-assistant-design.md)：高强度仅配置文件，模型代码撤回；真实空白目录自主生成5视图并修正合同，顶部伪待办已撤回。跨方法动作自动回接原界面仍缺合同，本轮不声称完整闭环。

## S 明确导航、输入职责及记录详情

Workspace增加navigation=tabs/select，views顺序决定呈现顺序。工具schema要求模型明确选择，结构编辑器有“视图导航”，描述formatter/parser往返同一字段；旧缺省只按tabs读取，无迁移。ViewNavigation在执行前预览和真实成果共用现有Tabs/NativeSelect，没有4/5个视图阈值或任意布局平台。使用明确12px，溢出按同一Tabs横向阅读，不切换控件。navigation是UI计划属性，不进入Definition/Run。

composition-ui保存navigation并按原规则检查修订/同Run重绑。实际先发现其显式字段拷贝漏了navigation：文本解析正确但刷新值丢失。HTTP断言保留失败现场，补齐保存字段后同源往返通过；没有删除断言或退回前端本地状态。

PlannedInputs从原组件拆出，保留真实合同、受控草稿与输入修订，放到输入Tab。PlannedWork只负责尚未绑定当前成果时的执行/绑定；成果发布后不再占位置。修改输入后旧成果仍固定，明确重新运行。业务缺口/下一步及review只在模型声明的视图/动作中表达，全局完成条件入口保持，运行/发布不自动结项。

resolvedUiView把Detail.title连同字段冻结为presentation.detailTitle；内联详情标题规范化进模板。详情显示该业务标题和真实记录ID，正文的数组间距收紧。底部左侧来源及RecordTools更多菜单，右侧为既有UiActionBar声明动作；没有新的业务动作种类或执行器。detailActionSpec复用deliverySpec编译，明确recordIds=[详情ID]而不修改表格selection。输入动作关闭详情再开原有表单；错误留在相应上下文，必要revision/store依赖明确。

## 实际验证

- 类型/构建通过，保留既有大chunk提示。
- UI协议/HTTP/输入合同7项通过：tabs/select往返、非法navigation拒绝、模型详情标题冻结、导航保存重绑同Run；原子失败和条件规则仍有效。
- 相邻组合/会话/合成CVE模块9项通过，单独日志，不冒称全仓重验。
- 当前导航/详情/输入浏览器5项通过：两尺寸5视图Tabs→人改select→工具fixture改tabs→刷新一致；详情标题唯一、工具收纳，表格选R1但详情动作只使用R2，原勾选保持；输入页保存/修订与旧成果固定。
- 相邻共编/多会话/完整模板CVE路线8项通过，原来源/引用/结项主线两尺寸2项通过。分轮共15条，各使用临时数据/随机HTTP与明确fixture，没有连接托管实例。新用例最初遗漏saveFlow的expectedDraftId而失败，修正用例通过真实版本参数，不改产品并发保护。
- 真实默认DeepSeek V4 Flash/high一轮64.635秒，inspect_work_item/describe_capabilities/check_ui_program/save_ui_program/publish_ui_plan/inspect_work_item后明确保存navigation=tabs。理由为需要反复比对范围、缺口、实施改动和逐条记录。5视图、顺序、全部字段/模板/动作/inputs、Definition、4次Run、材料与条件均与此前一致；只改展示及固定成果绑定。不是前端默认或fixture冒充模型选择。
- 实际4330查看1440×900、1024×768：五个明确Tab、详情标题与编号、紧凑数组、更多菜单；打开worker-D详情的真实补核查表单并关闭，未提交。输入任务仅在输入页，成果无旧输入保存/核对条。两尺寸零pageerror，Run/Definition/uiPlan/条件不变。已逐屏看图，最终图在navigation-contract-real；用户审美接受另列。

日志分组位于evidence/navigation-contract-final，真实模型/脚本/8张实际截图位于navigation-contract-real。模型代码/密钥配置未因本轮改动；仅更新工作项Assistant作者合同与提示。后端仅在审计5个预览工作项无活动Run/Assistant后重载独立4331，托管4320/4321未停止/重启/部署，原目录src保持起点一致，无提交/推送。

## 未解决的边界

R阶段跨方法动作自动回接原界面的合同缺口仍在，不因本轮导航/详情操作可用而声称解决。真实预览只打开表单，没有代填例外或确认完成条件；原合成判断不代表真实安全审计。当前有限导航/字段/动作不支持任意布局或UI脚本，未扩展未来通用平台。

## T访问合同文档交付

本轮仅更新文档。启动快照330个非Markdown产品/测试/配置文件哈希一致；尚未执行新NAV浏览器/模型验证。用户随后要求独立导航track实施，后续代码证据由其记录。
