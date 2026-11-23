# CVE Agent v2

两条普通方法使用现有Agent和数据接线；业务研究路径由Agent决定。

| 方法 | 明确输入 | 实际输出 | 工具 |
| --- | --- | --- | --- |
| 漏洞事实研究 | question：CVE编号、组件和问题文字 | facts对象：版本、机制、触发条件、来源摘录、未知及简短报告；summary：本轮范围和研究记录数 | CVEAWG、WebSearch |
| 仓库漏洞核查 | facts：一份研究对象；targets：每条为用户仓库/ref文字 | checks：逐目标核查对象；report：完整核查记录数组；summary：本轮摘要、范围及判断分布 | verify仅Sourcegraph；report/summary为普通函数 |

B将一份facts与每条target分别包装，再用现有join逐目标配对；配对键仅表示本次共用事实，不作为仓库或漏洞身份。取出`{facts,target}`后，verify逐项、并发1，每个实例只继承共用事实与当前目标的材料来源。facts数量不是一份时明确失败，不能隐式选择第一份。report用普通aggregate/identity汇集完整核查对象，由前端集合阅读器呈现，不再调用模型重写长报告。summary 在记录数组之后用普通表达式统计本轮记录总数及既有 conclusion 的三类数量，通过 Definition.summaryOutput 显式声明为界面摘要。统计不会复查或改写模型判断，也不暗示原扫描已排除。没有新增算子、CVE专用后端判断或表达式来源推断。

旧collect→flatMap版本在值层面正确分发，但汇集后的全部材料编号被每项继承；新方法用现有join的逐行来源避免该问题。输入targets仍要求非空字符串；不隐含HEAD或预设仓库。Agent按指定仓库/ref核查，实际返回commit用于追溯，未确认映射的候选范围仍须明确选择，程序不自动扩大或缩小范围。

所有Agent显式builtin=[]，没有宿主文件/命令工具，不链接旧uploads或运行时，不注入工作项data。结构化节点通过submit_result协议提交并当场校验；事实研究的文字报告仍为Markdown；源码核查汇总保持结构化对象。研究节点只加载声明的MCP业务服务；未选服务即使配置错误也不参与本次会话。省略tools字段的旧普通节点仍使用原行为。

## 安装

先由操作者处理需要替换的旧方法。此脚本只安装下列两份定义，不删除任何记录，不创建业务工作项，不启动模型：

```sh
pnpm exec tsx pipelines/cve/v2/install.ts http://127.0.0.1:4321
```

安装前校验全部定义；同标题/目标且同定义可重复执行，已有不同版本明确报错并保留。各方法保存可读标题、目标、布局并采用版本。定义文件：[A](research.json)、[B](source-check.json)。

工作项启动A时选择漏洞问题材料；启动B时把A的facts成果放入facts端口，用户提供的每条仓库/ref材料放入targets端口。不得把历史业务结论或宿主扫描路径作为隐含输入。

## 验证与边界

`tests/cve-v2.test.ts`用隔离HTTP/runtime及明确Agent fixture验证23目标逐项调用、每项仅共用事实与当前目标两条来源、无模型汇总与空target拒绝；不是模型判断验收。工具选择测试在node-tools、assistant、mcp。实际high模型、安装画布、工具记录与首版反馈见[本轮track](../../../conductor/tracks/feature-cve-agent-v2_20261022/index.md)。未知源码条件保持未知，不把材料研究或源码核查成功等同业务结项。

两条方法均用 summaryOutput 显式提供普通函数摘要。源码核查成果可以汇成父项整体结果，直接选择记录交给下一段方法补证或处理；只有确需独立业务跟踪时才显式建子项，不由模型 conclusion 自动创建或结项。


## 父项整批成果

`batch-result.ts` 是第三条普通纯函数方法：输入每个CVE的ChildStageValue及明确选定的单目标verify产物，输出本目录result-records的普通业务数据，并以record-list纯函数投影为可由OpenUI绑定的records数组。通用运行器不再解释resultOutput或CVE处置。保留原始判断、每个仓库/ref及提交范围、原文证据与未知；本方法仅汇集源码判断，不直接生成整改或补证动作：actions为空，disposition=pending。unknown原文可能是决定性证据缺口，也可能是范围说明，须由后续处置判定区分。无提交记录明确写范围待确认。这里不重新调查、不生成模型摘要、不自动建项或确认完成。

`publish-batch-result.ts` 从给定业务处理清单的verificationRunIds解析实际完成产物，核对父项完整范围、每项目标数和同目标多版本，再经正式HTTP保存方法并运行父项。先用`--check`只读核对；`--publish`才形成业务产物，保存精确交付清单供追溯。同方法版本和选择已完成时不重复创建运行。

```sh
pnpm exec tsx pipelines/cve/v2/publish-batch-result.ts /path/to/progress.json http://127.0.0.1:4321 --check /tmp/batch-result-check.json
pnpm exec tsx pipelines/cve/v2/publish-batch-result.ts /path/to/progress.json http://127.0.0.1:4321 --publish /tmp/batch-result-delivery.json
```

页面按源码判断筛选或逐条选择，进入后续处置判定；只有带独立判定理由的已判定记录才显示需处理/需补证计数；输入是保留CVE身份与原值的{item,record}记录，不要求先验收。验收与业务结项仍遵循原条件。

2026-10-30：旧publish-batch-result.ts只服务已退役progress清单和旧工作项API，已删除。公共方法仍通过显式保存版本复用，交付/记录接续统一走工作项OpenUI和固定来源；业务数据默认可重建，不保留旧API兼容脚本。tests/batch-result.test.ts以真实普通runtime保留20项211条、6/159/46判断、38份旧轮次及精确来源/数组投影断言，应用选记录和发布由OpenUI路线验证。
