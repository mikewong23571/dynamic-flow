# coding/ — 编码前置规范（编码前必须知道的风格与原则）

> **用途**：`newTrack` 创建编码类 track 时，将本目录（或按语言挑选的文件）复制到 track 的 `standards/` 下，作为编码 agent 动手写代码之前必须加载的前置规范。
>
> **提取来源**：cospowers 技能库（`D:\Users\User\cospowers\skills\`）
> **提取日期**：2026-09-03

## 文件清单与来源

| 文件 | 内容 | 来源 |
|---|---|---|
| `general-principles.md` | 从两个 backend-developer 技能归纳的通用前置原则（先框架后业务、分层拆分、命名、错误处理、测试要求），每条注明出处 skill；末尾附通用编码 checklist 整文件副本 | `go-backend-developer` / `python-backend-developer` |
| `go.md` | Go 规范要点：Daedalus 前置规则、强制性/建议性要求、API struct 字段类型映射、错误处理/并发/资源管理、单测要求；附 Go checklist 整文件副本与单测规范整文件副本 | `go-backend-developer`（SKILL.md + `references/coding/go-checklist.md` + `references/testing/Go单元测试规范.md`） |
| `python.md` | Python 规范要点：Daedalus 前置规则、Py2/Py3 版本要求、API 参数字段类型映射（sf_apidesc）、错误处理/日志；附 Py2/Py3 强制性与建议性 checklist 四份整文件副本 | `python-backend-developer`（SKILL.md + `references/coding/python-checklist-*.md`） |
| `compliance-checklist.md` | 提交前合规检查项：Python/Go/i18n/审计 高频规则、两个语言的手动检查清单、判定解释规则 | `code-compliance-check`（`references/must-check-first.md`）+ 两个 backend-developer 的手动检查清单 |

## 使用方式

1. **通用原则必带**：任何编码类 track 都复制 `general-principles.md` 与 `compliance-checklist.md`。
2. **语言文件按需带**：track 涉及 Go 代码带 `go.md`，涉及 Python 代码带 `python.md`。
3. `code-compliance-check` skill 本体（fail-closed 门禁流程、Runtime/批次协议）属于执行机制而非编码规范，未复制到本目录；如需接入门禁，直接调用该 skill。

## 待 Owner 裁剪

以下内容提取时不确定是否属于"编码前置"范围，已一并带上，请 Owner 裁剪：

- `go.md` 末尾的 **Go单元测试规范** 整文件副本（源 skill 声明"不涉及测试"，但其中的单测框架选型与命名约定对编码前置有参考价值）。
- `python.md` 中 **Python 2 相关章节与 checklist**（存量 Py2 项目仍在维护，新项目可裁剪）。
- `general-principles.md` 中的 **错误处理环节模型**（检测/传播/阻断/纠正）来自通用 checklist，篇幅较长，可按需精简。
- `compliance-checklist.md` 中的 grep 模板（源 skill 用于合规检查 Agent 的候选发现，编码前置场景可只保留规则条文、删掉 grep 命令）。

## 源 skill 说明

- `go-backend-developer`：自动化 Go 后端开发，专注代码编写质量、规范检查和性能优化（不涉及测试与 Git 流程）。
- `python-backend-developer`：自动识别 Python 版本（Py2/Py3）并按编码规范编写高质量 Python 代码（不涉及测试与 Git 流程）。
- `code-compliance-check`：提交前编码合规门禁，冻结 diff、按规则集逐条检查，fail closed。
