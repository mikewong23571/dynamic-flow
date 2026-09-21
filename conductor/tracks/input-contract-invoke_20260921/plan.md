# 实施计划

- [x] 读 runs.start/完成通知/最终输出提取与 flow 校验现状，定契约字段与 invoke 接线点。
- [x] shared/records + flow：InputContract 类型与 validateInvocation 纯函数（逐端口逐条中文错误），旧定义兼容。
- [x] invoke 路由：裸值包装（sampleId 生成、materialIds 空）、definition 解析（adopted 缺省）、reject/loose 路径与 Run 留痕、wait/timeout 同步返回。
- [x] interpret 修复环：assistant.repairInvocation（单轮无工具会话：契约+违约细节+原始输入 → 修复 JSON → 复检），仍失败如实拒绝。
- [x] 测试：契约校验单测、invoke 形状/违约/豁免/留痕、修复环替身用例；全量回归 158/158。
- [x] 真实 GLM 验证：契约拒绝坏输入（单测覆盖）、loose 豁免放行、interpret 真实修复数字为文本。
- [x] 同步 AGENTS/docs 与 evidence.md。
