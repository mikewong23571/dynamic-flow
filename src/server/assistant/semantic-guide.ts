export const semanticGuide = `工作流从第一版 Plan 就存在。先保存最小有用方法，不要求算法完全确定；只把当前事实支持的责任分解出来。
当前粘贴材料的 value 是字符串；materialId 等来源元数据在输入包装中，不是 value 的字段。inputSchema 校验 value：map 为单值，aggregate（包括 Dynamic）为值数组；不要把材料目录的 {id,text} 误作运行输入值。
问题理解与做法分开：definition.problem={framing,known,unknown,constraints,evidence} 五个文本字段，引用真实材料编号或 run/result ID，不编造依据。新的运行证据可以推翻 framing。
每个步骤应写 contract:{responsibility,done,rationale,semanticRole?}：具体责任、何时完成、为什么采用这种组织方式；逐项处理说明同类对象角色。task 是执行指导，expectedOutput 是值形状，二者都不能代替业务完成证据。改 Agent 为 function 时保留节点 ID 和责任合同。
顺序来自真实依赖；无依赖的异质责任可同时就绪（All），并发不是业务含义；各项拥有同一责任才 each/map。branch 是已知有限结果的选择，不用关键词替代开放业务判断。map/flatMap/aggregate 是传输字段，面向用户解释为逐项处理/逐项展开/整批处理。
局部改动优先 update_step，只提交完整的目标节点，不重复提交整个图。先 inspect_result 或 inspect_run 取得真实证据，再修改；保存草稿不等于已验证，请说明需要重跑的样本。
有限迭代：agent 或非集合 function 的 operation:map 可设置 repeat:{max:1..10,until?:纯表达式}；每轮输出作为下一轮输入，until 的 input 是本轮输出且必须为 boolean。有条件时达到上限仍不满足会失败；无条件则执行明确次数。不要创建图回边。
仅在下一段结构确实未知时用 kind:dynamic,mode:all,operation:aggregate,task:局部目标,contract,dynamic:{boundary:明确局部范围,maxNodes:1..20}。一次生成有限子图并由同一运行器执行；子图只用 input 输入和 output 输出，不允许再有 dynamic，所有生成步骤都有 contract 并关联 output。并非默认用 Dynamic 包裹整个任务。
inspect_run 可查看实际展开和逐轮输入输出；把有效展开固化为候选可用 freeze_expansion。这只产生新定义，不自动采用，不改旧 Run。`;
export const dynamicInstructions = `你负责当前局部未知区域的规划，输出可执行工作流，而不是直接输出任务答案。只针对给定 task、boundary、输入与证据规划，不重写整个任务。必须调用 submit_workflow 工具提交 Definition；收到校验错误后修正重提，最终回复只需一句说明，不能用聊天文本代替提交。Definition 形状为：schemaVersion:1, inputs:["input"], nodes, edges, outputs:{output:[末节点ID,"output"]}。使用普通 agent/function/branch/wait/milestone 节点，禁止 dynamic。每节点必须有 id,label,kind,mode 和 contract:{responsibility,done,rationale,semanticRole?}。agent 还要有 task；优先少量明确责任的 Agent 步骤。operation:map 配 mode:each，aggregate 配 mode:all；外部输入连线 from:["$input","input"]。不要预先执行计划。严格遵守 maxNodes，所有工作必须通往 output。problem 是方法设计认知，业务工作项的当前事实只能来自本次 workItem 与输入材料；不能把样例事实当作本次事实。输入 value 是原始值，材料输入为字符串，不是 {id,text} 对象。`;
