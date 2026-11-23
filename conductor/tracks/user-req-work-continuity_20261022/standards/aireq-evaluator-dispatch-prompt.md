# Aireq Evaluator 派遣提示词模板

当从 `requirement-analysis` 派遣 `aireq-evaluator` 子代理时使用此模板。

**Purpose:** Run a full automated quality evaluation of an AI requirements document (`*-requirements.md`) **in an isolated context**. The subagent executes Phase 0 (loading), Phase 1 (item-by-item rule scanning for REQ-AI-01 to REQ-AI-34), Phase 3 (scoring), and Phase 4 (report generation) without filling the main conversation context with hundreds of per-rule check lines.

**注意：** 此评估器专用于 AI 需求文档（Epic/Feature/Story 格式）。跨文档一致性检查由 `doc-quality-evaluator` 负责。

**派遣时机：** AI 需求文档已写入 `docs/agent-rules/1-ai-requirements/output/` 且子代理评审步骤已完成之后。

```
Agent:
  subagent_type: "general-purpose"
  description: "AI 需求质量评估：[文档名]"
  prompt: |
    你是一个 AI 需求文档质量评估器。按照 aireq-evaluator skill 运行完整质量评估。

    **第 1 步：** 使用 Skill 工具调用 `aireq-evaluator` skill，再做任何其他事情。
    **第 2 步：** 严格按照 skill 指示执行所有评估阶段。

    **待评估文档：** [DOC_PATH]
    将 [DOC_PATH] 替换为 AI 需求文档的实际文件路径，例如：
      - docs/agent-rules/1-ai-requirements/output/2026-04-21-xxx-requirements.md
    如果路径尚未确定，省略此字段，让 skill 自动发现。

    Complete all phases:
    - Phase 0: Load the AI requirements document and all relevant evaluation rule files
    - Phase 1: Item-by-item rule scanning (REQ-AI-01 to REQ-AI-34, output each check result in real time)
    - Phase 3: Weighted scoring with full deduction breakdown (7 dimensions: 结构完整性 20%, DFX需求质量 20%, QS质量基线 20%, 需求规格质量 15%, 设计策略质量 10%, 移交就绪性 10%, AIN文档质量 5%)
    - Phase 4: Save quality report to quality-reports/

    **返回给父代理 —— 仅返回紧凑摘要（禁止输出完整报告）：**

    ## 质量评估结果

    **等级：** [A/B/C/D/F] — [分数]/100
    **报告已保存至：** [path/to/quality-reports/YYYY-MM-DD-xxx-quality-report.md]
    **红线状态：** R1 [✅/❌] | R2 [✅/❌] | R3 [✅/❌]

    **需修复的问题（仅 Critical + Error，按严重程度排序）：**

    | ID | 位置 | 问题 | 修复方向 |
    |----|------|------|----------|
    | ISSUE-001 | [Epic/Feature/Story 名称] | [什么问题] | [具体修复操作] |
    | ISSUE-002 | ... | ... | ... |

    **Warning 级问题（建议性）：**
    - ISSUE-XXX: [简要描述]

    **是否继续？** 是（等级 B 及以上，≥ 80）/ 否（需要修复）
```

**父代理根据返回结果执行的操作：**

| 等级 | 操作 |
|---|---|
| **A 或 B（≥ 80）** | 如有简单的 Warning 级修复则顺手处理；进入系统需求分析阶段 |
| **C（65–79）** | 根据问题表修复所有 Error 及以上问题；使用更新后的文档路径重新派遣此子代理；重复直到等级 ≥ B |
| **D（< 65）或 F** | 需要大幅返工 —— 回到 `requirement-analysis` 修复根本问题后再重新派遣 |

**C/D/F 级重新派遣：** 使用相同的提示词模板和相同的文档路径。skill 会从头重新评估，生成新的分数。反复迭代直到等级 ≥ B。
