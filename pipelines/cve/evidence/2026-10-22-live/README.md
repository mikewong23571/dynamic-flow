# CVE-2025-27516 真实双流水线测试

2026-10-22，已完成两条流水线的真实模型执行与产物交接，保持用户要求的 GLM `max`。按用户选择，使用 cve-fix 的真实扫描线索，范围限定 SCC/chatops-api 与 SCC/adr-api。

A 形成 `completed` 的漏洞材料结果，保留 8 份来源正文。B 的执行完成，业务调查结果为 `incomplete / undetermined`：两系统当前仓库和部署证据不可达，不能凭历史 Jinja2 依赖线索判定受影响或排除。工作项仍为 open，3 条完成条件均未确认。

## 查看输入、输出与实际使用

| 环节 | 实际输入 | 实际输出 |
| --- | --- | --- |
| 漏洞材料收集 A | [工作项创建输入](01-create-item-input.json)、[本轮冻结输入](02-A-frozen-input.json) | [完整材料结果](04-A-materials.json)、[材料报告](04-A-report.md)、[各节点输入输出](A-node-inputs-outputs.json) |
| A → B 交接 | [明确选择的 A 结果与系统来源](05-A-to-B-handoff.json)、[选中的真实业务线索](03-business-clues-input.json) | [B 本轮冻结输入](06-B-frozen-input.json)，M02 为 A 完整结果，M03 为两系统业务线索 |
| 业务影响分析 B | 上述材料与限定业务范围 | [结构化影响结果](07-B-impact.json)、[最终业务报告](08-final-impact-report.md)、[各节点输入输出](B-node-inputs-outputs.json) |
| 最终产物的使用 | [B 的实际结果、报告与来源](09-final-product-used-as-item-evidence.json) | 已通过 addEvidence 追加到同一工作项 M04，见 [工作项最终记录](10-final-work-item.json)，待人工复核 |

已核对 A 产物与交接包一致，交接包原样进入 B 冻结输入，B 最终产物原样保存为 M04；旧 Run 不变，不自动确认条件或结项。A、B 两侧的材料/影响结果和报告同时使用 keepResults 保留。

应用通过 pi-mcp-adapter 注册原生 WebSearch 工具，实际调用记录见 [A 工具活动](A-tool-activity-summary.json)、[B 工具活动](B-tool-activity-summary.json)。Agent 不处理 MCP 连接协议或凭据。此前节点自行编写客户端的路线已停止，保留在 [旧运行输入输出](00-previous-A-node-inputs-outputs.json)。

[运行标识与固定版本](run-refs.json) 包含两轮真实运行和最终结果 ID。可在 Flowcraft 的“CVE-2025-27516 · SCC chatops/ADR 真实流水线测试”工作项内，选择第 2 轮 A、第 3 轮 B，检查成果、输入与来源，并在证据材料查看 M02/M03/M04。
