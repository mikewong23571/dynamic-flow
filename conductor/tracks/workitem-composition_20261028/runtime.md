# Runtime/shared 实施记录

2026-10-28：在独立源码区读取 shared/flow/runs 完整调用链及track spec/plan/contracts；代码不写原产品树。冻结call多端口/逐项广播、子Run关系、groupBy与页面DTO，已通知backend/frontend/root。首个失败用例 `pnpm exec tsx --test tests/composition-runtime.test.ts`：3/3失败，原因是call kind未识别、groupBy函数/配置未支持，符合新增能力边界。

开始实现：call使用同一schedule/perform的内部子Run入口，不递归公共start；子Run独立job key避免公共owner占用及递归等待自身。复用原有map/flatMap、collect/join、表达式reduce与DAG就绪收口；新增groupBy确定性函数。运行/边界测试结果继续追加。

## 当前完成与验证

- shared：call/groupBy、具名输入输出函数与canonical配置schema；工作项私有流程/选择/多交付/方法模板DTO；InputItem.source跨方法精确引用、NodeResult.call与Run.parentCall、Run.materials与RunWait.source。
- flow：checkCall/validateCallReferences校验形状、固定版本端口、私有归属、直接/间接循环与32层有限嵌套；groupBy按多个typed自身字段路径分组，坏草稿给问题不崩溃。
- runs：同一schedule/perform内部子Run调用，先存父回执后派发；map指定单端口逐项+其他端口广播；真实多端口结果投射。停止沿调用树传播、子取消唤醒父；等待投影到父并转发事件；重开/显式resume复用原child与成功实例。业务onFinish只对根Run触发，子Run业务hook保留真实来源及继承effectMode（backend已配合reportProgress根血缘和reconcile忽略子Run）。
- 材料反例修复：每个call子Run只冻结batch实际材料，共享facts保留，其他targets和无关材料不广播；普通方法用Run.materials而非callee样例。来源缺失真实失败。

定向测试（独立源码区，全部临时目录，无端口/模型）：

`pnpm exec tsx --test tests/composition-runtime.test.ts tests/runs.test.ts tests/lifecycle-runtime.test.ts tests/semantic-workflow.test.ts tests/multi-input.test.ts tests/functional-ir.test.ts`：62/62通过（当时新增11个composition用例），包括调用/普通DAG/等待恢复/动态展开/纯IR/多路集合回归。`pnpm typecheck:app`通过。

之后补充显式停止等待子Run唤醒父的最小反例，并再次运行composition定向测试；最终结果以下次追加为准。未做真实模型或浏览器验收，不声称任意部分失败自动汇总；当前保留成功实例并阻断要求成功的下游。模块AGENTS已同步实际入口。

最终定向确认：`pnpm exec tsx --test tests/composition-runtime.test.ts` 12/12通过；`pnpm typecheck:app`通过。最后新增“显式停止等待子Run唤醒父并显示实际取消”的反例。未重复扩大全套（根集成验收负责）。

跨模块只读审查：已向backend/root反馈同流程continue丢失其他输入端口、Assistant缺停止/恢复/信号工具；backend已修并补测。另反馈Assistant.inspect_run不能读取真实子Run，以及目录outputContracts未区分flatMap/集合/控制节点整批校验schema和实际每项输出schema；待backend收敛。未改backend/front代码。

跨模块复核收敛：backend已增加inspect_run可选workId并沿parentCall验证根运行归属，且methods.outputContracts改为实际每项输出schema；原先四个具体闭环问题均已给责任模块并看到源码修复。复核新代码时另指出NodeResult.input误写inputs的字段错误、wait event端口不能套透传schema，已通知backend处理。未进行新的产品级结论推定。
