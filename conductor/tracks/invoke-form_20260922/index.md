# 再来一单：invoke 表单与调用留痕展示

[规格](spec.md) · [计划](plan.md) · [证据](evidence.md)

## 目标

- 工作区提供「直接输入」调用入口：按当前定义 inputs + inputContracts 生成表单，裸值走 `POST /api/works/:id/invoke`（wait 同步等待），完成后跳到该 Run 结果。
- 契约违约如实拒绝并给出显式「豁免契约重试（留痕）」逃生通道；不预勾选 loose。
- 结果视图如实展示 `Run.invocation` 留痕（宽松调用 / 自动修复端口）与「直接输入」来源。
- 后端 invoke 语义不动；本 track 是纯前端入口与展示。

## 非目标

- 助手唤起调用（后续 track）；契约编辑 UI（input-contract-invoke 已排除）。
- 任意历史版本选择 UI、webhook/cron、工作项里程碑语义变更。

## 改动点

- `src/client/core/`：表单模型与解析纯函数（端口 → 字段类型/必填；字符串条目 → 裸值数组，中文校验）。
- `src/client/features/workspace/`：InvokeDialog 组件；WorkspaceDialogs 组合。
- `src/client/app/WorkspaceHeader.tsx`、结果空态：入口。
- `src/client/state/`（usePanels/useActions）：对话框状态与 invoke 动作。
- `src/client/features/results/Results.tsx`：invocation 标记与来源呈现。
- `tests/`：表单模型单测；浏览器实测两类定义。

## 影响域

纯前端增量；复用既有 invoke HTTP 合同与 `Run.invocation` 记录。回归范围：工作区运行入口、结果视图、既有浏览器用例。
