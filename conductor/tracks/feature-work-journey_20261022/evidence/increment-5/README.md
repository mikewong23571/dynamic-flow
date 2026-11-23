# 完整确定性路线与相邻回归

当前实现使用真实HTTP、文件存储、runtime与作者工具保存；executeNode/runSession是明确fixture，不冒充模型产物。全部测试在私有临时目录，无原业务数据写入。源码未提交。

- [核心33项](modules.log)：`pnpm exec tsx --test tests/lifecycle-integration.test.ts tests/work-items.test.ts tests/workitem-progress.test.ts tests/trials.test.ts tests/runs.test.ts`。输入/原文范围、跨方法值与来源、重复版本、普通单步正式/预览、比较原始输入、条件修订、等待恢复通过。
- [相邻50项](adjacent-modules.log)：`pnpm exec tsx --test tests/assistant.test.ts tests/semantic-author.test.ts tests/client.test.ts tests/lifecycle-runtime.test.ts`。作者工具、报告边界、比较/等待与客户端纯逻辑通过。
- [6项页面](browser.log)：`pnpm test:browser tests/browser/work-journey.spec.ts`。1A两尺寸、1B多入口、结构化交接/来源错误重试、完整故事两尺寸。之后新增重开新材料操作，由下一日志验证。
- [最终完整故事两尺寸](reopen-browser.log)：`pnpm test:browser tests/browser/work-journey.spec.ts --grep '完整路线'`。从无方法/无条件创建开始，生成→明确M01/M03→改分类→原始输入比较→旧新成果单步正式汇总→B合同拒绝→Assistant修正→对象交接→来源返回→条件引用/结项→重开/新增M04→仅M04新运行，旧Run保持。
- [旧入口定向回归批次](regression-browser.log)：同文件外加workitem-workspace/semantic-workflow，grep记录于日志。8项相邻回归通过；该批次完整故事2项轮询使用两份Snapshot造成版本读取竞态，修为一次读取后由reopen-browser.log通过，不将失败批次整体记为通过。
- [最终类型](final-typecheck.log)、[构建](final-build.log)、[差异空白检查](diff-check.log)。构建保留现有较大bundle提示，未以本轮声称消除。

截图按实际路线：[1024运行表](overview-current-1024.png)、[1440运行表](overview-current-1440.png)、[1024正式汇总](formal-summary-1024.png)、[1440正式汇总](formal-summary-1440.png)、[1024完成依据](completed-with-evidence-1024.png)、[1440完成依据](completed-with-evidence-1440.png)。实施者已实际查看1024运行表与完成依据，行列、状态、引用与动作均可辨，无横向溢出。无宽度后缀文件属于早期单尺寸过程证据，最终使用带尺寸后缀文件。

真实模型、默认max、外部WebSearch429、重试和真实CVE合同调整由根在live-model目录独立记录；此处不将fixture结论替代真实模型。[最终独立两尺寸、真实模型与响应观测](../live-model/README.md)已由根记录；额外CVE scope也已completed，实际输入/输出及未调查边界在同一证据入口。
