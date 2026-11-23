# create-items 运行与作者验证（2026-10-23）

已实现：明确的 all/aggregate 业务节点，固定 node-input 来源、正式 full/commit 接线、预览零写、逐容器回执、部分失败与同源恢复。父项来自 Run.workItem；不改变普通 retry 的 preview 或正式静态单步允许范围。Dynamic 提案拒绝该业务节点。

## 自动验证

- `red.log`：首次用例因 create-items 尚未获 flow 支持而失败，保留实际 red。
- `module-final.log`：38 项通过。命令：`pnpm exec tsx --test tests/create-items-author.test.ts tests/create-items-runtime.test.ts tests/create-items-integration.test.ts tests/runs.test.ts tests/lifecycle-runtime.test.ts tests/semantic-author.test.ts tests/semantic-workflow.test.ts`。
- 新用例覆盖直接输入无上游、两容器同候选 ID、固定输入在 hook 调用前可读、preview/比较零写、单步 commit 拒绝、停止不继续下一容器、部分失败保留回执、hook 异常保留清单入口、中断复用首次 resultId、迟到旧 hook 不覆盖恢复、恢复输入不一致失败、作者工具实际保存与 Dynamic 拒绝。
- HTTP 联测使用临时真实文件与 createApplication：A 建立、B 缺目标失败；固定 node-input 补 B 后复用 A，旧失败 Run 不改；模拟中断恢复复用原来源及两个已有子项。模型为明确测试替身。
- 正式源码 typecheck 曾在并行实现完成后通过；全 track 最终构建/浏览器由根交付记录，本文不代替该验收。

## 少量真实模型

`real-probe.ts` 使用已有模型目录配置的私有副本与 high 思考级别，不写用户默认或真实 data。输入为非 CVE 的两条客户反馈（导出失败、搜索漏项），真实 Pi Agent 通过结构化提交生成两候选，HTTP 正式运行接 create-items，最终建立两条真实子项，父 Run completed，子项均保留 open。

- `real-probe.log`：启动/完成摘要。
- `real-result.json`：固定输入、实际候选输出、建立回执、子项接续材料及来源；不含密钥。
- `real-fixture.json`：私有数据目录与方法/父项/Run ID的历史记录；前端与独立审查完成后目录已清理，无服务持续运行。

真实验证只证明该少量明确反馈样本的 Agent→候选→建项路径，不代表千项真实模型质量或性能。千项使用私有 fixture 验证，不触发千次模型。
