# 模块拆解与验收地图

更新：2026-09-20。正式 src 已实现各模块并通过 HTTP/SSE 接线，默认开发、构建与测试命令面向正式应用。下表记录职责及已有实现范围；是否通过用户路线仍以 [当前 track 的验收证据](../conductor/tracks/workitem-lifecycle_20260920/evidence.md) 为准，不以模块存在或类型检查替代产品验收。

当前目标见 [持续业务工作项故事](./workitem-stories.md)，原有 [用户故事](./user-stories.md) 继续回归；[Spike](../spike/README.md) 是历史行为推演。源码下的 AGENTS 是后续修改该模块时就近读取的约定；具体接口字段仍可按真实连接调整。

编号说明：A–F 是核心用户目标类别，G1/G2 是追加的模型设置与工作库维护，P01–P32 是具体测试场景，T1–T8 是完整用户验收路线；本轮 H1–H11 为生命周期故事，L1–L5 为跨时间/跨模块路线；都不是行业缩写。技术缩写和对象含义见 [术语与编号](./glossary.md)。

## 1. 模块、职责与子问题

| 模块与就近约定                                   | 要解决的子问题                                               | 主要交接                              |
| ------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------- |
| [client](../src/client/AGENTS.md)                | 用户如何编辑方法并管理持续业务进展？                         | 后端业务操作、定义快照、节点/工具活动 |
| [server 入口](../src/server/AGENTS.md)           | 具体操作、Pi 活动和保存内容怎样成为真实 HTTP/SSE 行为？      | 方法/工作项、运行恢复与前端           |
| [work](../src/server/work/AGENTS.md)             | 如何维护工作库、提供材料、拿到产物并选择结果继续？           | files、runs                           |
| [work-items](../src/server/work-items/AGENTS.md) | 持续业务身份、目标、条件依据、进展和跨方法历史如何保持？     | runs 回调、独立文件、client、HTTP     |
| [flow](../src/server/flow/AGENTS.md)             | 人与 Agent 如何修改同一份可执行做法？                        | files；调用方为 client/assistant/runs |
| [runs](../src/server/runs/AGENTS.md)             | 固定输入如何并发执行、持久等待、停止与恢复？                 | flow、assistant、files                |
| [assistant](../src/server/assistant/AGENTS.md)   | 如何配置模型，并让 Pi 修改流程、完成节点任务、返回工具活动？ | flow、files、Pi SDK                   |
| [trials](../src/server/trials/AGENTS.md)         | 同输入比较是否成立、是否过期、是否可以采用？                 | runs、files；最终判断由用户作出       |
| [files](../src/server/files/AGENTS.md)           | 保存后能否重开，失败/中断时状态是否可信？                    | Node 文件能力、入口的保存通知         |
| [shared](../src/shared/AGENTS.md)                | 调用方是否对同一个字段/状态具有相同理解？                    | 只共享实际需要的类型，无业务运行依赖  |

各模块 AGENTS 已包含：职责、目标、非目标、输入输出意图、核心内外依赖、验收用例、联测要求与当前未知。每模块一个目录是为了让约定就近生效，不要求拆包、部署或服务化。

## 2. 如何领取一个子问题

范围说明：原十九个故事、G1/G2 保持回归。本轮用户已授权 H1–H11 / L1–L5 持续生命周期设计与实现，按 workitem-lifecycle track 验收。尚未授权的生产平台与无关扩展不得自动纳入。

一次实现任务以一条可观察结果为单位，例如“Pi 修改分类要求后画布节点立即更新”，而不是“完成 assistant 全部架构”。明确输入、结果、涉及模块和用例；必要时一个任务可以跨目录完成真实连接。

交付至少说明：改了什么、相关用例的实际结果、与相邻模块的联测证据、尚未验证的假设。涉及接口变更时同步调用方和就近 AGENTS，不让下一个任务按过期假设工作。

当前共享字段见 [records.ts](../src/shared/records.ts)，模块交接见 [实施 handoff](../conductor/tracks/workitem-lifecycle_20260920/handoff.md)。历史 [接口意图](../spike/interfaces.md) 只保留推演价值。后续调整先对齐关键输入、输出、错误与具体例子，再用真实调用校准，不能用占位函数代替行为。

## 3. 模块验收的责任

“牵头模块”负责在对应实现任务中给出结果，协作模块不能被永远 mock。完整 Given/When/Then 在 [P01–P32](../spike/tests/cases.md)；这里分配责任，不另写一份重复断言。

| 用例             | 牵头模块           | 联测对象                       | 证据重点                                       | 实现状态（不等于验收）     |
| ---------------- | ------------------ | ------------------------------ | ---------------------------------------------- | -------------------------- |
| P01              | work               | client / files                 | 输入检查与真实创建                             | 已有对应实现；结论见 track |
| P02              | assistant          | flow / client                  | 真实 Pi 生成与失败                             | 已有对应实现；结论见 track |
| P03              | client             | runs                           | 职责节点与运行实例可辨                         | 已有对应实现；结论见 track |
| P04              | flow               | runs / client                  | 连线修改影响实际执行                           | 已有对应实现；结论见 track |
| P05              | flow               | client / runs                  | 局部错误与可修复性                             | 已有对应实现；结论见 track |
| P06              | runs               | flow / assistant               | 空分支/汇合真实结束                            | 已有对应实现；结论见 track |
| P07              | runs               | flow / client                  | 固定版本与输入                                 | 已有对应实现；结论见 track |
| P08              | runs               | assistant / server             | 真实中止和迟到结果                             | 已有对应实现；结论见 track |
| P09              | runs               | files / client                 | 失败输入局部重试                               | 已有对应实现；结论见 track |
| P10              | client             | work / runs                    | 检查来源与保留选择                             | 已有对应实现；结论见 track |
| P11              | work               | runs / client                  | 报告内容与完整性                               | 已有对应实现；结论见 track |
| P12              | assistant          | flow / client                  | 请求上下文固定                                 | 已有对应实现；结论见 track |
| P13              | flow               | assistant / client             | 旧提案与新修改交错                             | 已有对应实现；结论见 track |
| P14              | trials             | runs                           | 两条输入不扩成全量                             | 已有对应实现；结论见 track |
| P15              | trials             | runs / client                  | 同输入对齐与不兼容提示                         | 已有对应实现；结论见 track |
| P16              | trials             | flow / client                  | 比较过期与迟到完成                             | 已有对应实现；结论见 track |
| P17              | flow               | trials / client                | 布局与语义分离                                 | 已有对应实现；结论见 track |
| P18              | flow               | work / files                   | 采用、保留、放弃独立                           | 已有对应实现；结论见 track |
| P19              | work               | runs / client                  | 混合产物的明确输入                             | 已有对应实现；结论见 track |
| P20              | work               | runs / files                   | 新材料不污染历史                               | 已有对应实现；结论见 track |
| P21              | files              | runs / server / client         | 真实文件、刷新与重启                           | 已有对应实现；结论见 track |
| P22              | files              | flow / client                  | 写失败不冒充成功                               | 已有对应实现；结论见 track |
| P23              | server             | files / client                 | SSE 重连读取当前状态                           | 已有对应实现；结论见 track |
| P24              | assistant          | server / runs                  | 三协议真实端点分别验证                         | 已有对应实现；结论见 track |
| P25              | client             | 产品交付任务                   | 浏览器截图及用户视觉判断                       | 已有对应实现；结论见 track |
| P26              | assistant          | flow / client                  | 坏提案和假修改不生效                           | 已有对应实现；结论见 track |
| P27              | trials             | runs / client                  | 停止比较不启动下一侧                           | 已有对应实现；结论见 track |
| P28              | runs               | trials / client                | 重复启动的实际调用次数                         | 已有对应实现；结论见 track |
| P29              | assistant          | flow / files / server / client | 工具实改到 Canvas                              | 已有对应实现；结论见 track |
| P30              | runs               | assistant / client             | 节点/实例/版本活动关联                         | 已有对应实现；结论见 track |
| P31              | server             | files / flow / client          | 含定义的快照与视口保持                         | 已有对应实现；结论见 track |
| P32              | flow               | client / assistant             | 历史问题的候选起点与已有草稿处理               | 已有对应实现；结论见 track |
| 模型设置（G1）   | assistant / client | server                         | 环境初值、工作台配置保存、参数限制、密钥不回显 | 已有对应实现；结论见 track |
| 工作库维护（G2） | work / client      | files / server                 | 搜索分页、标题维护、归档恢复与重新打开         | 已有对应实现；结论见 track |

### 持续工作项的模块责任

| 业务故事                 | 牵头与相邻模块                        | 必须观察的结果                                                    |
| ------------------------ | ------------------------------------- | ----------------------------------------------------------------- |
| H1/H2 身份与总览         | work-items → HTTP → client            | 两项共用方法但材料/进展独立，阶段/等待/最近业务进展真实           |
| H3/H4 固定执行与业务影响 | runs → work-items、flow、trials       | 固定工作项快照，只有 full/commit 里程碑写业务，重复回调不重复历史 |
| H5 并发与契约            | flow/schema → runs → assistant/client | map/flatMap/aggregate、有限并发、顺序/来源；坏结果阻断依赖        |
| H6/H7 事件/到期与重启    | runs → files → server → client        | 等待落盘，原 Run 跨重启继续，已成功调用不重复                     |
| H8 停止与中断            | runs → files/server/client            | 迟到事件不能推进；不确定调用需显式恢复，不伪称恰好一次            |
| H9 方法演进              | work-items → work/flow/runs/client    | 同一业务 ID 换方法/补证据继续，旧版本/输入/历史不变               |
| H10 结项重开             | work-items → client                   | 条件及依据齐全才结项，Run 完成不等于业务完成，重开保留记录        |
| H11 外部观察             | server → work-items/runs              | HTTP 查询与页面状态一致，显式消息动作才推动等待                   |

本表只声明实现责任，不提前勾选产品通过。字段见 shared/records.ts，模块域内测试与真实产品证据分开记录。

shared 的验收嵌入 P07/P14/P16/P19/P21/P30/P31 的真实读写；类型相容不能替代字段含义正确。业务测试位于 tests/，默认 `pnpm test` 运行正式模块与 HTTP 测试，`pnpm test:browser` 运行正式浏览器用例。覆盖边界与实际通过结论仍需分别记录。

## 4. 模块之间必须连起来验收的路径

| 路线  | 必须实际连接                                                        | 为什么不能只分别验收                                                 |
| ----- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| T1    | client → work/assistant → flow/files → runs → assistant → 结果/报告 | 看得见图、模型能回答、函数能运行，各自成功不等于同一份定义能产出报告 |
| T2    | client → flow → runs → files → client                               | 拖线成功必须改变真实数据去向；空分支需要真实结束                     |
| T3/T4 | Pi 工具 → flow 保存 → 入口快照 → Canvas；trials → 两侧 runs         | 工具文字不等于修改；两边结果必须同输入且版本有效                     |
| T5    | flow 采用与 work 保留独立 → 明确选择结果 → runs → 新报告            | 不能自动选“最新结果”或把试验产物全当正式输入                         |
| T6    | client 停止/重试 → runs → Pi → files → client                       | 取消 HTTP 成功不等于真正停止；失败重试不能重做全部                   |
| T7    | work/files → 真实文件 → 服务重启/页面重连 → client                  | 内存 mock 无法证明重开与中断状态                                     |
| T8    | 代表性完整工作区操作 T1/T3/T5                                       | 单组件截图和自动测试不能替代整体可用性与品味                         |

每个实现任务负责自己改变的模块及连接；最终产品交付任务负责 L1–L5 及 T1–T8 回归。不能在模块全部“完成”之后才第一次尝试这些路径。

### 本轮跨时间验收路线

| 路线                  | 必须实际连接                                                                | 不可由什么替代                 |
| --------------------- | --------------------------------------------------------------------------- | ------------------------------ |
| L1 两项共用方法       | client → work-items → runs → 文件 → 管理列表                                | 同一个内存对象复制两份界面     |
| L2 等待/重启/消息     | milestone 回调 → work-items 历史；Run 落盘 → 真实服务重启 → signal → 原 Run | 页面延时动画、另起一轮全量重跑 |
| L3 到期/停止          | 持久 dueAt → 启动恢复/计时器；stop → 迟到事件                               | 只测试内存定时器或接口返回 200 |
| L4 坏输出/方法演进    | Ajv → 失败实例 → 下游阻断；预览修改 → 新版本 → 原工作项新 Run               | 手写成功分类替代真实输入检查   |
| L5 结项/重开/外部观察 | 条件依据 → 结项 → 新证据/重开 → HTTP 与 UI 一致                             | Run completed 或节点计数       |

## 5. 保持设计与真实问题一致

当前设计足以指导起步，不足以证明完整性。把“已明确的用户目标”和“暂定实现假设”区别对待：目标不因实现困难被偷偷改掉；假设可以被真实证据推翻。

| 暂定假设                                   | 用什么尽早检验                                   | 不成立时怎样调整                                          |
| ------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------- |
| 三协议都可经现有 Pi 调用路径工作           | P24：逐协议工具、流式、取消与错误                | 明确哪种能力不兼容，修正最少接入代码；不假装统一成功      |
| 有限节点/端口足以表达首版任务              | T1/T2/T5 的真实材料和合并输入                    | 保留最小无法表达的例子，调整节点或输入规则；不假连线      |
| 同节点比较能承载主要改法                   | P15/P19，使用模式变化和多材料结果                | 明确可比/不可比，必要时调整范围；不强行对齐               |
| 工作快照与节点事件足以维护 UI              | P29/P30/P31 的迟到、重连与切换版本               | 修正信息和更新顺序，不先建通用事件平台                    |
| 单进程文件与有限检查点足以承载当前生命周期 | L2/L3 的真实重启、跨截止与迟到事件；记录保存延迟 | 按具体反例评估持久运行时或存储；不假装分布式保证          |
| 画布与上下文面板可让人理解操作             | T8 真实代表页面与用户反馈                        | 修改交互/布局和必要模块边界；类型检查不作为反驳反馈的依据 |

这些不是所有未知。出现新问题时，在相关任务/AGENTS 留下四项即可：**具体输入或反例、原假设哪里失败、影响哪些故事/接口、下一步最小验证**。不另建通用风险管理系统。

验收状态区分“未实现、实现中、待验收、通过”；每项通过都要给适用条件和证据。仅 fixture 通过要写 fixture；真实模型或视觉未测则明确留下空缺。已通过项遇到反例应重开，不用文档上的勾选压过事实。

## 6. 当前实施与后续验证

Work 保留方法工作区，WorkItem 新增持续业务身份，Run 保存固定输入、等待、事件与实例检查点。wait/milestone、map/flatMap/aggregate、有限并发与 Ajv 校验已有实现；纯表达式提供 filter 与有初值的顺序 reduce、模式匹配和解构；完整端口类型推导与图级独立 filter 未实现。任意调用栈恢复和生产级调度不在范围。

当前按 L1–L5 核对生命周期真实接线，再回归方法编辑与 T1–T8。域内替身、真实文件/HTTP、受控时间、真实进程重启、真实模型、浏览器分别提供证据，不能互相替代。

`pnpm dev`、`pnpm build`、`pnpm test` 与 `pnpm test:browser` 面向正式应用，历史实验改由 `pnpm spike:*` 运行。类型、模块测试、真实模型调用、浏览器操作和用户视觉判断分别报告；不因为脚本已切换或源码已实现就宣称整体验收完成。

本轮 [管理页与函数式 IR](../conductor/tracks/functional-ir-management_20260920/index.md)：flow 负责表达式完整形状/作用域校验，runs 执行纯变换并保留 schema/来源边界，assistant 通过相同校验保存，client 提供结构化配置与紧凑摘要。共享类型位于 src/shared/expressions.ts，无新运行服务。

## 多路输出组合交接

shared/node-ports.ts 统一前端、flow、runs 的实际端口与集合分发；flow/collections.ts 校验配置，runs/collections.ts 执行拼接、具名收集和键关联，client/CollectionEditor 提供结构化控件，assistant/collection-guide.ts 对齐模型工具。模块输入输出及错误例子见 [集合语义](multi-input.md)，真实验收见 [本轮证据](../conductor/tracks/multi-input_20260920/evidence.md)。
