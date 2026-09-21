# Assistant 持久会话

[计划](plan.md) · [证据](evidence.md)

## 目标

- Assistant 对话从"每轮全新内存会话 + 最近 12 条纯文本"改为 Pi 持久会话：`SessionManager.create/open` JSONL 落盘到 `data/<workId>/` 下，历史完整保留，模型可见自己之前的工具调用与结果。
- 复用 SDK 内建 auto/manual compaction 处理上下文膨胀，不原创会话机制。
- 每轮 prompt 仍注入当前定义全文、节点范围、样本与材料清单（当前真相）；历史连续性由会话提供。
- 停止、重试、服务端重启恢复语义不变：重启后 `open` 同一会话文件继续；同一 Work 的 assistant 请求串行。
- 首次升级的旧 Work：首个请求用现有 `Work.messages` 文本引导新会话，之后不再注入 recentMessages。

## 非目标

- 不做多会话并行与历史会话切换 UI（SDK 的 list/open 能力留作后续评估，本轮只保证单会话可恢复）。
- 不改变 `Work.messages` 的界面记录合同；画布/inspector 不变。
- 工作流 agent 节点执行（executeNode）保持每实例临时会话，不持久化。
- 不做会话清理策略以外的存储治理。

## 改动点

- `src/server/assistant/pi.ts`：runPiSession 支持持久会话模式（SessionManager.create/open、固定 agentDir、不落 rm 会话目录；临时目录仍用于执行 cwd 或评估会话目录兼作 cwd）。
- `src/server/assistant/index.ts`：requestEdit 接持久会话；同 Work 请求串行；bootstrap 逻辑；重启恢复路径。
- `data/AGENTS.md`、`src/server/assistant/AGENTS.md`：同步会话存储与行为合同。
- `tests/assistant.test.ts`：连续性（第二轮引用第一轮事实）、重试/停止后会话一致、进程重启后会话恢复。

## 影响域

- 模型侧上下文质量变化：所有真实作者行为的验收以真实模型重验（指代、延续修改、compaction 后仍认得当前定义）。
- 数据目录新增会话文件；`data/AGENTS.md` 边界。
- 回归范围：assistant 模块测试、浏览器工作区链路、真实 GLM 多轮对话验证。
