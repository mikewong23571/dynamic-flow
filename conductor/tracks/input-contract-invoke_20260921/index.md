# 输入契约与 invoke 触发面

[计划](plan.md) · [证据](evidence.md)

## 目标

- Definition 可声明输入契约 `inputContracts`：按端口声明条目 schema、必选性与违约行为（`onInvalid: reject | interpret`），缺省端口保持宽松（现状）。旧定义无契约字段正常读取运行。
- 新增 `POST /api/works/:id/invoke`：裸值输入（字符串/记录数组）由服务端包装为 InputItem；definition 缺省打 adopted，可显式 draft/固定版本；`wait` 同步等终态返回 runId/status/outputs，超时转 202。
- 逃生通道显式且留痕：调用级 `mode: "loose"` 豁免记进 Run；声明级 `interpret` 走 agent 修复环（校验失败 → 反馈违约细节 → 修复后复检 → 仍失败拒绝），修复使用记进 Run。不允许隐式降级。
- 三条地板规则不变：批次边界可判定、机械算子字段真实、每条可编址。

## 非目标

- 不做契约的编辑 UI（本轮由 Assistant/手写定义携带，Inspector 表单后续）。
- 不做 invoke 鉴权、限流、密钥（原型范围，本地单进程）。
- 不做 webhook/cron 等其它触发器；工作项的 signal/resume 语义不动。
- 不改动 `$input` 端口语义与材料池模型。

## 改动点

- `src/shared/records.ts`：InputContract 记录、Run 的 invoke 留痕字段。
- `src/server/flow/`：契约校验纯函数（每端口每条目，错误中文可读）。
- `src/server/index.ts`：invoke 路由（裸值包装、定义解析、同步等待与超时）。
- `src/server/assistant/`：interpret 修复环（复用 runPiSession，工具无关的最小会话）。
- `tests/`：契约校验、invoke 形状、reject/loose/interpret 路径、Run 留痕。

## 影响域

- Definition 记录扩展（可选字段，向后兼容）；Run 记录扩展。
- 回归范围：flow/records 单测、integration、真实模型修复环验证。
