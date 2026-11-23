# user-req —— TR1 用户需求规格说明书模板（用户需求分析阶段）

- **源 skill**: `requirement-analysis`（D:\Users\User\cospowers\skills\requirement-analysis\）
- **关联 skill**: `aireq-evaluator`（D:\Users\User\cospowers\skills\aireq-evaluator\，质量评估关卡）
- **提取日期**: 2026-09-03
- **使用方式**: newTrack 创建用户需求分析（TR1）类型 track 时，将本目录整体复制到该 track 的 `standards/` 下，作为该阶段产出文档的模板与检查清单。

> 本目录所有文件均为整文件复制，未做内容改写。源 skill 的流程性正文（SKILL.md）不属于文档模板，未复制；其路径见上，需要流程编排时回源查阅。

## 文件清单

| 文件 | 来源路径 | 用途 |
|---|---|---|
| user-requirement-template.md | D:\Users\User\cospowers\templates\user-requirement-template.md | TR1 用户需求规格说明书输出模板（9 章结构、QS-001~008 检查项、DFX 基线），`config.templates["ai-requirement"]` 默认值 |
| init-aireq-template.md | D:\Users\User\cospowers\templates\init-aireq-template.md | 背景情报收集 init 模板（§1~§12，写入 `docs/agent-rules/1-ai-requirements/input/` 由用户填写） |
| requirement-document-reviewer-prompt.md | D:\Users\User\cospowers\skills\requirement-analysis\agents\requirement-document-reviewer-prompt.md | 需求文档评审子代理提示词（轻量评审轮：章节缺失、占位符、阻塞项健全检查） |
| aireq-evaluator-dispatch-prompt.md | D:\Users\User\cospowers\skills\aireq-evaluator\agents\evaluator-dispatch-prompt.md | 质量评估子代理调度提示词（REQ-AI-01~34 逐条扫描 + 加权评分，≥B 方可通过关卡） |
| user-requirement-quality-standard-checklist.md | D:\Users\User\cospowers\rules\requirement-checklists\user-requirement-quality-standard-checklist.md | 用户需求质量标准检查清单（init 模板 §11 DFX 约束背景预填依据之一） |
| user-requirement-dfx-baseline-checklist.md | D:\Users\User\cospowers\rules\requirement-checklists\user-requirement-dfx-baseline-checklist.md | DFX 基线检查清单（L0 底线要求，init 模板预填与 TR1 §2.2 填写依据） |
| ai-native-doc-adaptation-checklist.md | D:\Users\User\cospowers\rules\requirement-checklists\ai-native-doc-adaptation-checklist.md | AI-Native 文档格式检查清单（frontmatter、高密度概要、`[待确认]` 标记等），评估器使用 |
| user-requirement-planning-principles-checklist.md | D:\Users\User\cospowers\rules\requirement-checklists\user-requirement-planning-principles-checklist.md | 需求规划原则检查清单，aireq-evaluator 引用 |
| user-requirement-experience-guide-checklist.md | D:\Users\User\cospowers\rules\requirement-checklists\user-requirement-experience-guide-checklist.md | 用户需求体验指引检查清单，aireq-evaluator 引用 |
| user-requirement-product-spec-baseline-checklist.md | D:\Users\User\cospowers\rules\requirement-checklists\user-requirement-product-spec-baseline-checklist.md | 产品规格基线检查清单（QS-004 相关）。**待 Owner 裁剪**：四个 SKILL.md 未直接引用，仅由 requirement-checklists 目录同源收纳 |

## 备注

- 源 skill 中 `config.templates["ai-requirement"]`、`config.evaluators["aireq"]` 为扩展点配置项；落库后由 Owner 决定对应 Conductor 侧的配置方式。
- 评估器关卡（等级 ≥ B）与 `[待确认]` 解决关卡是 TR1 交接到 TR2 前的硬门，README 仅记录模板本身，流程语义见源 SKILL.md。
