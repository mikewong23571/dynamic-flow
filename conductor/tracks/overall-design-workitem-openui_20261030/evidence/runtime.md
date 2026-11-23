# 运行与合同机制证据

独立worktree dynamic-flow-openui，真实临时JSON文件与fixture模型边界；未连接托管4320/4321，无真实模型质量结论。

## Red → Green

以snapshot 2eeab11临时还原本代理owned的schema/assistant/runs实现，执行runtime-mechanisms三个反例，均明确失败：同一schema重复40次compile而非一次；合法advisory-123/URL/evidence被猜成本地材料而拒绝；5个map实例读取整份Work 7次。恢复本次实现后3条通过：等值schema编译一次，200份临时schema不积累Ajv输入对象；业务输出只按显式schema，缺少真正输入材料仍拒绝；整Work读取降为初次持久化追加的1次，不随实例重复。

## 机制

- nodeOperation统一计算单位，删除mode和legacy function/resultOutput执行分支；集合端口必须明确。call广播、多路输出、来源、动态展开、等待、停止和中断恢复保留。
- 所有Run保存冻结materials；requestEdit从private工作项读取实际上下文或本次sampleSource，不再给公共Work写作者业务副本；retrySource显式保存。
- schema按内容有界复用，并释放Ajv临时对象缓存；不可变Definition解析有界复用、读取副本隔离。
- WorkResultSet退役内核代码迁为具体CVE领域schema，普通方法显式增加records数组投影；旧publish CLI与旧workflowId测试fixture删除。

## 验证

- 运行、表达式、集合、嵌套call、生命周期等待/恢复、普通作者/节点及剖析等17个测试文件：117项通过（具体命令/摘要见本轮documentation；含3条回归）。
- 普通CVE方法20项211条真实函数输出：受影响6/不受影响159/证据不足46，三项38份旧轮次保留、实际精确来源和records投影均通过，2项测试通过。
- state/assistant/multi-input/runtime-mechanisms/batch-result组合61项通过。旧泛字段证据断言已改为明确业务schema，不删除真正材料输入/条件来源校验。

旧batch测试中的应用选记录/发布与单步/比较能力由统一OpenUI/business验收承接；本文件不声称其已通过浏览器。

追加验证：sourceNode缺少来源字段曾被checkDefinition接受（Red），最小形状校验后拒绝空/错误类型，合法固定来源不解析外部方法（Green）。work-items/workitem-progress迁移14项全部通过，联合state/assistant/runtime-mechanisms共63项通过，日志/tmp/flowcraft-progress-final.log。

浏览器承接：openui-lifecycle 6项、management 2项、保留普通共享Run 3项均通过。运行使用临时应用/随机端口和各自/tmp输出目录，未接托管。截图在runtime-browser/，退役映射见test-retirement.md。摘要展示绑定的真实模型反例修复后，39项运行/作者/CVE/摘要组合通过；合法schema/count对象、records数组和字符串不会被另一个隐含schema拒绝。
