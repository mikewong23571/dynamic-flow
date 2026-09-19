# 类型化数据流、计算组合与业务影响

2026-09-20。[本轮生命周期设计](design.md) 已实现有限计算运算、schema 检查、等待与里程碑。本文区分实际实现与尚未覆盖的语义；完整路线结论见 [验收证据](../conductor/tracks/workitem-lifecycle_20260920/evidence.md)。

## 一、IR 需要表达什么

计算签名不能单独解释业务工作持续数月的过程。IR 同时表达四个维度：

- **处理职责**：Agent 任务、已有普通函数或有限条件路由。
- **组合运算**：map / flatMap / aggregate 改变一次调用与集合的对应方式。
- **执行依赖**：显式端口连接、有限并发、等待事件或到期；时间与并发不改变数据类型。
- **业务影响**：milestone 显式提交工作项阶段、摘要和输入证据；计算成功本身不结项。

WorkItem 保有持续业务身份；Run 固定方法与工作项输入快照。一个 map 实例不是独立工作项，只有需要独立追踪目标的事情才登记为工作项。

## 二、当前计算签名

借鉴 Java Function<T,R> 与 Stream<T> 的组合，但不照搬线程池、惰性求值或单次消费。当前端口仍是带 sampleId/materialIds/sourceResultIds 的有限输入项集合；它不是任意单值端口类型系统。

| 运算      | 单次调用           | 集合语义                                   | 当前状态                                 |
| --------- | ------------------ | ------------------------------------------ | ---------------------------------------- |
| map       | T → R              | 对每项调用；返回数组仍是一项数组值         | 已实现                                   |
| flatMap   | T → R[]            | 每项返回数组，明确展开一层；来源继承原输入 | 已实现                                   |
| aggregate | T[] → R            | 收齐本次上游输入后调用一次，输出一项 R     | 已实现                                   |
| filter    | T → boolean        | 保留满足谓词的 T                           | expression 集合组合子；不是节点 operation |
| reduce    | (A, T) → A，含初值 | 顺序左折叠；空数组返回初值                 | expression 集合组合子；不自动并行化 |

`operation` 为明确组合语义；缺省 each/all 继续适配旧定义。旧普通 Function 未设 operation 时保留已有透传/合并方式；新定义需显式选择运算，不能把兼容行为描述为新的统一类型系统。

LLM 整批报告是 aggregate，不保证结合律或确定性，不能自动改为并行 reduce。merge 连接既有两路输入，不等于按键 join 或归约。map/flatMap 空集合不调用处理器；aggregate 接收空数组，是否允许由输入 schema 和处理器约定。独立就绪节点最多并行 4 个，逐项并发可配 1–8，最终按输入顺序归集；失败保留其它成功实例但阻止依赖完整结果的下游。

expression 的 pipe、map/filter/flatMap/reduce 和 match/let 详见 [纯函数 IR](functional-ir.md)。图级 operation 与内部值组合的边界不同：表达式返回数组仍是一个值，只有节点 flatMap 向端口展开。

## 三、Schema 的实现边界

当前字段是节点的单次调用契约：`inputSchema` 描述传给调用的值，`expectedOutput` 描述返回值。Map 是 T / R，FlatMap 是 T / R[]，Aggregate 是 T[] / R。运行器身份、来源和状态在记录外层，不让模型构造这些字段。Wait、Milestone、Branch 的 expectedOutput 统一约束整批透传值数组，分流前也校验实际值；Wait 的 event 端口另有事件记录结构，不套用透传数组约束。

[flow/schema.ts](../src/server/flow/schema.ts) 统一使用 Ajv 默认 JSON Schema 编译器；未知 schema 关键字通过 strictSchema 检查，不做类型强转。定义保存检查 schema 是否可编译；运行器对 Agent 和普通处理的实际输入/返回执行校验，错误带实例与字段路径。没有 schema 的旧定义仍兼容运行，不能称为“已经类型证明”。

连接检查只拒绝可确定的顶层 type 不相交情况，并考虑 flatMap 的 items 与 aggregate 的数组包装。**字段必填保证、枚举包含、可空性完整推导以及任意 JSON Schema 子类型关系尚未实现**；保存成功不等于静态证明所有输入均可执行。实际运行检查仍是必要边界。

Schema 属于不可变定义语义；修改它形成候选并使旧比较过期。配置面板提供高级 JSON 编辑及错误提示，画布显示组合方式和并发。业务类型标签、字段表编辑器、样本辅助生成与全图端口类型推导仍是后续工作，没有冒充交付。

## 四、等待与里程碑

Wait 配置事件、原因和可选 timeoutSeconds。Run 保存真正的 dueAt，重启不能重新计算出一个新的等待期限。output 透传原输入，event 输出消息内容/接收时间或 timer 标志；下游明确选择依赖哪一个端口。

Milestone 配置 stage/summary，在 workItem + full + commit 时通过回调提交业务历史，输入材料与来源结果成为依据；按 runId+nodeId 去重。preview、单节点试验和候选比较不写业务进展。预览等待输出 preview 事件，不假装实际外部消息已到达。

完成条件与结项属于 WorkItem 的显式业务动作；Run completed 不自动推进到 completed 业务状态。工作项与运行的边界因此不依赖“最后一个节点”或已完成节点百分比。

## 五、验收反例与剩余范围

运行器域内测试覆盖 map 数组保留与 flatMap 展开、并发上限/顺序/来源、输入输出 schema 失败、部分失败阻断汇总、真实文件等待重开、受控时钟跨 45 天及定时器分段、停止后的迟到事件、预览无业务提交，以及恢复不重复成功调用。这些替身/文件测试不代表真实模型质量或完整产品通过。

[H5/H6/H7/H8 与 L2–L4](workitem-stories.md) 将上述语义接入工作项、HTTP、前端和真实进程重启。验收状态见 track。新增的纯表达式 reduce/filter 与匹配解构由 [本轮 track](../conductor/tracks/functional-ir-management_20260920/evidence.md) 验收；完整端口推导、任意调用栈恢复和生产级调度仍未实现。

## 参考

- [Oracle Stream API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/stream/Stream.html)：函数组合签名与 reduce 约束。
- [Ajv](https://ajv.js.org/guide/getting-started.html)：复用 schema 编译和实际值检查。

结果续做与同输入比较按来源结果继承同一工作项、同一修订的冻结目标和材料。混合工作项、不同修订或方法样本会明确拒绝，需要分别续做。局部重试仍为 preview，不推进业务状态。
