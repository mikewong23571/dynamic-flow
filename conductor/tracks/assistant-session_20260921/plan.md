# 实施计划

- [x] 摸清 SDK 接入面：createAgentSession 与持久 SessionManager 的组合方式、auto compaction 触发条件、abort 后 JSONL 一致性、open 恢复的消息回放形状。
- [x] pi.ts 持久会话模式：会话文件固定在 data/<workId>/assistant/，与临时执行目录解耦；保持 tools/活动/文本回调合同不变。
- [x] requestEdit 接线：per-work 会话获取（create/open）、同 Work 串行、旧消息 bootstrap、移除 recentMessages 注入（会话覆盖历史）；停止/重试/重启恢复验证。
- [x] 测试：连续性、恢复、停止一致性用例；现有 assistant 测试适配。
- [x] 真实模型验证（GLM 5.3 Flash）：多轮指代与延续修改、长会话 compaction 后仍认识当前定义、重启后续聊。——指代与重启续聊已真实验证；compaction 真实触发未验证（见 evidence 边界）。
- [x] 浏览器两尺寸回归（workspace 链路）+ 全量测试；同步 AGENTS 与 data 约定；写 evidence.md。
