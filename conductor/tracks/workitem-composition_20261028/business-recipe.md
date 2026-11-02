# 业务配方验收记录

2026-10-28；代码唯一工作区 `/home/mike/projs/fork/dynamic-flow-workitem-composition`。本 agent 仅新增 `pipelines/cve/composition/{recipe.ts,fixture.ts,README.md}` 与 `tests/composition-business.test.ts`；本日志写 canonical track。未修改产品 src、旧 v2、原实例数据或 4320/4321 服务。

## 最小合同与实现

以明确提供的假设判断为输入验证业务组合，不建设漏洞判断引擎。八条原告警包括两条重复；七个调查范围保留仓库、ref、原基线及漏洞身份。一个普通单节点公共方法核对输入判断的范围与必要依据；九节点私有 Definition 使用 groupBy、left join、固定逐项 call、map/flatMap、reduce 形成交付。所有假设判断、变更、验证和确认来自输入，不由测试模型或通用源码硬造。

主要反例：api/main 的 A、B 共用一次升级但分别保留验证；api/release 独立；worker 的修复引入 platform-images 实施仓库但不扩充受影响对象；portal/A 的排除保留原告警；缺判断、例外未确认、不同 ref 判断及不同基线验证不能机械视为齐备。原告警不因复用调查而消失。

交付含三张必要业务表：影响仓库/ref、实施仓库与依赖、逐条原告警。第四份 `completion` 仅是普通 report：原告警数、依据机械齐备数和未决原告警 ID，帮助用户核对缺口；没有第四种组件、业务枚举或额外展示机制。表字段和标签由 `presentations` 声明，不进通用 src。

fixture 的预期是 8 条原告警、7 次固定版本真实子 Run、6 条机械依据齐备、2 条未决（缺判断与未确认例外）。所有工作项条件仍为未满足，结项 HTTP 请求被拒绝；`Run.completed` 和 `accepted` 字段均不代表用户完成验收。README 明示配方仅支持本例的一原告警一调查范围合同；多范围告警须扩展全部关系归并，不能凭行计数宣称闭环。

## 实际联测与发现

最初两项业务定向测试通过，使用真实临时文件、正式应用 HTTP 与 runtime，无模型与监听端口。随后加强为“选中两行后实际执行固定接续方法，并检查真实子 Run 输入”。HTTP receivedInputs 保留正确逐条 source，但子 Run 的 InputItem.source 缺失，新增断言明确失败；保留失败断言并交给 root。

定位为 `work-items/run-inputs.ts` 的 received 分支：全局 Run.inputSources 虽已有值，但逐条 Inputs 没有复制 source。root 已条件 clone 修复，并报告初步 34 项相关回归通过。root 随后又发现 map call 子 Run 的全局 inputSources 广播其他目标来源，继续修正为实际输入来源；最终根回归结果由 root 的 evidence 记录，不以初步通过替代最终结果。

当前业务测试进一步选择第二条重复告警（实际输出 index=1）与缺判断告警，验证只接续该两条真实值、精确来源及来源索引；目标方法仅透传以检查输入，不冒充补查成功。选择准备与执行分开，旧四份固定交付保留。

root 后续通知：来源修复相关 49 项测试全部通过；最后新增的非零 index 断言由最终统一回归覆盖。此前 34 项是较早检查，不能与 49 项累加。本 agent 不重复运行同组合或将待跑断言记为已通过。

曾运行 `pnpm typecheck:app`，发现本目录 schema 的两处 Json 注解过宽及既有 backend 测试缺 materials。前者已改为 satisfies Json，后者已由 root 补齐；最终合并类型检查归 root。新增文件已用定向 Prettier 格式化，未对其他文件批量格式化。

## 交付与未测边界

README 给出 Assistant 的 inspect/read → find_methods/inspect_method → check/save → select/add → execute/inspect_run → publish 具体路径，解释 v2 checks 只提供影响核查，不提供实际变更、验证或例外确认；引用已有报价 HTTP/固定调用测试作为非 CVE 复用证据，不重复搭业务系统。

本验收不证明真实漏洞结论、仓库材料、修复或确认真实性；未执行真实模型、浏览器或视觉验收。schema/范围/必要字段检查仅是机械条件。真实证据与明确用户验收仍是完成条件，通用系统不自动读取 `acceptedCount` 替用户结项。
