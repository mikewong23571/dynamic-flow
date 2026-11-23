# overall-design —— 总体设计（含 TRD 与 OpenAPI 契约）模板

- **源 skill**: `overall-design-spec`（D:\Users\User\cospowers\skills\overall-design-spec\）
- **关联 skill**: `overall-design-evaluator`（D:\Users\User\cospowers\skills\overall-design-evaluator\，质量评估关卡）、`finishing-system-design`（Route C 收尾拆模块任务书）
- **提取日期**: 2026-09-03
- **使用方式**: newTrack 创建总体设计类型 track 时，将本目录整体复制到该 track 的 `standards/` 下，作为该阶段产出文档的模板与检查清单。

> 本目录所有文件均为整文件复制，未做内容改写。源 skill 的流程性正文（SKILL.md，含 TRD→总体设计→OpenAPI 三段产出顺序与增量对齐检查点）不属于文档模板，未复制；需要流程语义时回源查阅。

## 文件清单

| 文件 | 来源路径 | 用途 |
|---|---|---|
| overall-design-template.md | D:\Users\User\cospowers\templates\overall-design-template.md | 总体设计文档主模板（主入口 + 10 个子文档结构索引），`config.templates["overall-design"]` 默认值 |
| init-overall-design-template.md | D:\Users\User\cospowers\templates\init-overall-design-template.md | 总体设计前置信息 init 模板（现有架构、技术约束、硬件方案输入、交付边界等，写入 `docs/agent-rules/3-overall-design/input/`） |
| openapi-template.yaml | D:\Users\User\cospowers\templates\openapi-template.yaml | OpenAPI 3.0 契约模板（模块/子系统间接口规格说明），`config.templates["openapi"]` 默认值 |
| overall-design-chapters/ | D:\Users\User\cospowers\templates\design\overall-design\ | 总体设计各章模板：ch02-系统总体架构、ch03-硬件方案、ch04-系统工作原理、ch05-模块设计说明、ch06-系统DFX特性设计、ch07-对软件总体架构的影响、ch08-方案风险分析、ch09-部署视图、ch10-总结、ch11-变更控制与修订记录 |
| overall-design-chapters/technical-requirements-design/ | 同上目录的 technical-requirements-design\ 子目录 | 技术需求设计（TRD）模板：1-技术需求设计.md（总入口）、1-1-架构技术需求设计.md（架构型 TRD）、1-2-特性技术需求设计.md（特性型 TRD），按 init §0.1 分流选用 |
| design-01-doc-writing-standards-checklist.md | D:\Users\User\cospowers\rules\design-review\design-01-doc-writing-standards-checklist.md | M1 文档撰写标准检查清单（评审必选模块） |
| design-02-tech-requirements-design-checklist.md | D:\Users\User\cospowers\rules\design-review\design-02-tech-requirements-design-checklist.md | M2 技术需求设计（TRD）检查清单 |
| design-03-overall-design-checklist.md | D:\Users\User\cospowers\rules\design-review\design-03-overall-design-checklist.md | M3 总体设计检查清单 |
| design-04-high-level-design-checklist.md | D:\Users\User\cospowers\rules\design-review\design-04-high-level-design-checklist.md | M4 概要设计检查清单（M1–M6 评审体系一员；模块设计 track 侧同样使用，此处随体系一并复制）。**待 Owner 裁剪**：总体设计 track 主用 M1/M2/M3/M5/M6 |
| design-05-i18n-design-checklist.md | D:\Users\User\cospowers\rules\design-review\design-05-i18n-design-checklist.md | M5 国际化（i18n）设计检查清单（评审必选模块） |
| design-06-never-again-principles-checklist.md | D:\Users\User\cospowers\rules\design-review\design-06-never-again-principles-checklist.md | M6「不犯重复错误」（不贰过）设计原则检查清单（评审必选模块） |
| design-document-reviewer-prompt.md | D:\Users\User\cospowers\skills\overall-design-spec\agents\design-document-reviewer-prompt.md | 设计文档评审子代理提示词（轻量评审轮） |
| overall-design-evaluator-dispatch-prompt.md | D:\Users\User\cospowers\skills\overall-design-evaluator\agents\evaluator-dispatch-prompt.md | 质量评估子代理调度提示词（按设计子类型组合 M1–M6 模块并行审查 + 加权评分） |
| 安全.md | D:\Users\User\cospowers\rules\dfx\安全.md | DFX 安全维度规则（第 6 章 DFX 特性设计依据），经 `config.rules["dfx"]` 引用。**待 Owner 裁剪** |
| 性能.md | D:\Users\User\cospowers\rules\dfx\性能.md | DFX 性能维度规则（第 6 章 DFX 特性设计依据），经 `config.rules["dfx"]` 引用。**待 Owner 裁剪** |
| 安全需求识别检视表.md | D:\Users\User\cospowers\rules\dfx\安全需求识别检视表.md | 安全需求识别检视表（DFX 辅助）。**待 Owner 裁剪**：SKILL.md 未逐名引用 |
| story-module-matrix-template.md | D:\Users\User\cospowers\templates\story-module-matrix-template.md | Story–模块映射矩阵模板（finishing-system-design 按 REQ↔挂载节点拆模块时使用）。**待 Owner 裁剪**：属 Route C 收尾产物模板，非总体设计文档本体 |
| task-spec-template.md | D:\Users\User\cospowers\templates\task-spec-template.md | 模块任务书（Task Spec）模板（finishing-system-design 幂等创建模块 Task 时使用）。**待 Owner 裁剪**：同上 |

## 未复制文件说明

- `rules/design-review/` 下另有一批疑似旧版同义文件（总体设计review规范.md、总体设计文档模版.md、文档撰写规范.md、概要设计checklist.md、详细设计checklist.md、不贰过设计准则.md）：源 skill 与评估器均未按名引用，判断为被 design-01~06 取代的历史版本，未复制。如需比对回源查阅。
- `templates/总体设计checklist评估.md`、`templates/总体设计评分模版.md`：全库无引用，未复制。
