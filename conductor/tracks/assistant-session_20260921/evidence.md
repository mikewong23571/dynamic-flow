# 验收证据

## 实现

- `pi.ts`：`SessionInput.sessionDir` 可选；提供时 `SessionManager.continueRecent(dir, dir)` 创建/恢复持久会话、启用 SDK 自动 compaction、目录不删；省略时维持一次性内存会话 + 临时目录用完即删（executeNode 路径不变）。
- `assistant/index.ts`：requestEdit 传入 `files.sessionDir(workId)`（新增 FileStore.sessionDir，落 `<workId>/assistant/`）；首轮无 `.jsonl` 时 prompt 注入 recentMessages 引导，之后历史由会话提供；同一 Work 请求经 sessionQueues 串行。
- 停止/重试/版本冲突等既有语义未动。

## 验证

- `pnpm typecheck:app` 通过；`pnpm test` 154/154（新增 3 项：首轮 bootstrap/有会话文件后不再注入/重启等价物复用会话文件、同 Work 串行）。
- 真实模型（GLM 5.3 Flash，max）多轮连续性：turn1"记住阈值 0.83、代号蓝鹬，不要修改"→ completed+unchanged；**停止并重启后端进程**后 turn2"我刚才让你记住的阈值和代号是什么"→ 精确回答 0.83/蓝鹬（RECALL: PASS）。会话文件 `data/<workId>/assistant/*.jsonl` 实际存在并追加。
- 浏览器 workspace 两尺寸回归通过；探针工作已归档清理。

## 边界与未知

- 自动 compaction 未做真实长会话触发验证（SDK 默认阈值，按配置启用）；JSONL 随轮次增长的磁盘治理未做（原型范围）。
- 历史会话切换 UI 未做；SDK 的 list/open/fork 能力留作后续评估。
- abort 中断后 JSONL 的半截消息一致性依赖 SDK 行为，未单独构造反例。
- 并发来源：UI 运行中隐藏发送按钮，串行队列是 API 层兜底。
