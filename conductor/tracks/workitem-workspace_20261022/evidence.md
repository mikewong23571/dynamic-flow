# 工作项成果检查验证记录

2026-10-22。[后续性能与视觉修复](performance-20261022.md) 已补充真实完成数据下的测量与回归；下文保留首轮验证记录。已实现本轮产品行为，类型、构建、模块和浏览器验证通过。用户尚未对本轮界面作最终视觉判断。

## 实际改动

- 工作项默认进入成果与过程；轮次、固定环节、具体实例和实际产物可选取。报告直接定位来源实例，在工作项内打开。
- 固定页头保留业务身份及“方法 → 轮次 → 环节”位置，长内容滚动后仍可辨认；材料、完成条件、业务记录分别查看。
- 集合可查找、排序和检查条目；嵌套/长内容按需展开，保留原文。查看过的实例保留内容标签页、展开与查找状态。
- 输入来源可沿实际上游追溯并返回，冻结输入可检查；字段比较跨轮次/方法可用，不推断业务结论。
- 实际输出可显式补为一条证据，或引用到选择的完成条件。验证了来源与输出完整保存、旧运行不变、条件仍未满足、工作项仍未结项。
- 业务记录按轮次组织，显示新增材料与成果入口；同环节早期报告收起。来源检查后返回业务记录恢复位置；离开方法工作区再返回时保留成果选择和未保存条件。
- 沿用现有业务 API、固定定义、运行与文件结构，无业务字段专用分支，无新增依赖。

## 检查与结果

- `pnpm typecheck:app`：通过。
- `pnpm build`：通过；仍有现有大 bundle 提示，未扩大本次范围处理打包拆分。
- `pnpm exec tsx --test tests/client.test.ts tests/work-items.test.ts`：11 项通过。
- `pnpm test:browser tests/browser/workitem-workspace.spec.ts tests/browser/workitem-progress.spec.ts tests/browser/same-work-reopen.spec.ts tests/browser/opened-pipelines.spec.ts`：14 项通过。
- `pnpm test:browser tests/browser/workitem-workspace.spec.ts tests/browser/workitems.spec.ts`：6 项通过，与上条重叠 4 项；本轮共覆盖 16 个不同浏览器用例。
- 最后增加固定位置断言后，定向重跑 `workitem-workspace.spec.ts`：4 项通过。
- 改动源码与测试的 Prettier 检查、`git diff --check`：通过。

正式浏览器测试使用构建后的客户端。新工作空间测试与进度测试使用临时目录、私有真实 HTTP 服务与正式 runtime；Agent 输出为明确的模型替身，不宣称模型业务结论通过。采购结构化集合、文本周报跨方法复用同一工作项；合同来件验证多实例旧运行的精确定位与取消状态。原有生命周期用例通过真实 HTTP 和 identity/wait/milestone 验证，无模型替身。

旧生命周期浏览器用例复用了本地 4320/4321。此次执行创建的 8 份 `CVE-UI-*` 工作项及其对应已归档测试方法，已在核实身份、创建时间和终态后整体移到 `data/.validation-backups/workitem-workspace_20261022/`，保留恢复能力。未移动此前用户数据；新工作空间用例临时目录在结束时清理。

## 核心路线与反例

1. 两种不同方法连续推进同一项采购业务，切换轮次分别检查集合与 Markdown 报告，所有来源与业务身份保持一致。
2. 集合查找供应商、按数量排序、打开条目；追溯上游及固定材料，再返回原成果，条目检查状态保留。
3. 选择不同轮次成果比较，实际数量由 13 变 14，比较只显示 batch 和数量两处差异；展示字段位置，不暴露运行时输出包装。
4. 引用成果后保持条件未勾选；手工编辑依据 → 进入流水线 → 返回，编辑内容保留。补为证据保存真实来源和输出，前后 Run 完全相同。
5. 来源读取返回 503 时仍显示已加载成果与错误；重试恢复读取，未以空结果代替失败。
6. 同一环节两个实例，给第二份来件报告进展后停止运行；从旧报告准确打开第二个取消实例，返回历史恢复滚动位置。
7. 发现长内容滚动后方法/环节身份离开视口：固定页头追加当前位置，并在真实 CVE 证据表格滚动时重新核实。
8. 原生命周期验收按新的材料/条件/业务记录入口操作，保留等待、事件、依据、结项和重开的原业务断言。

## 两尺寸实际截图

已用本地 Chromium 操作并查看 1440×900 与 1024×768 截图：

| 场景 | 1440 | 1024 |
| --- | --- | --- |
| 文本周报方法 | [查看](evidence/text-method-1440.png) | [查看](evidence/text-method-1024.png) |
| 集合与条目检查 | [查看](evidence/collection-1440.png) | [查看](evidence/collection-1024.png) |
| 两轮字段比较 | [查看](evidence/compare-1440.png) | [查看](evidence/compare-1024.png) |
| 按轮次组织记录 | [查看](evidence/business-history-1440.png) | [查看](evidence/business-history-1024.png) |
| 真实工作项首屏 | [查看](evidence/live-cve-overview-1440.png) | [查看](evidence/live-cve-overview-1024.png) |
| 真实官方证据集合 | [查看](evidence/live-cve-sources-1440.png) | [查看](evidence/live-cve-sources-1024.png) |
| 真实工作项业务记录 | [查看](evidence/live-cve-history-1440.png) | [查看](evidence/live-cve-history-1024.png) |

真实 CVE 实看为已有工作项 `3a1412fb-937b-4add-a7cd-7f23f94bf05a`，只读检查已由原生 MCP 实际取得的三份官方来源、上游返回、历史来源定位及进入流水线后返回。见 [浏览器观测](evidence/live-cve-observations.json)。未发生 pageerror 或整页横向溢出；集合本身可横向滚动。

## 适用边界

未新增任意业务语义推断、内容可视化配置或语义比较。数组比较按原顺序，刷新整个应用不持久化临时浏览状态；手机尺寸与大规模集合性能未验收。

初次 UI 检查时，真实 A→B 模型调查仍独立运行，保持用户要求的 `max`。后续两侧执行及产物交接已于 04:50 UTC 完成，业务结论仍为 incomplete / undetermined，工作项未结项。调查结果以 [真实运行证据](../../../pipelines/cve/evidence/2026-10-22-live/README.md) 为准。
