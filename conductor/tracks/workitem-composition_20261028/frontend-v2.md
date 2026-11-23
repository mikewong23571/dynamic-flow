# 工作项界面重建

> 当前状态：历史方案/阶段记录，用户后续否定其页面设计，已被当前 spec.md、workflow.md、plan.md 取代。文内“确认/通过”仅表示当时内部判断或技术检查，不能作为当前设计通过或继续编码的依据。

2026-10-28。实施位置：`dynamic-flow-workitem-composition`；本文件是当前前端事实与证据，不以旧版截图作为验收。

## 审计与任务归属（框架确认前）

已读根、src、client、tests 指南，DESIGN-NOTES、ui/README，meta application design / implementation research，以及本 track 的 spec、decisions、contracts、acceptance。现有真实 Assistant、shadcn primitives、Management、MaterialDialog、ArtifactValue、RunInspector 可复用。

| 旧界面 | 新任务归属 | 处理 |
| --- | --- | --- |
| WorkItems 列表与重复概览/状态筛选 | 找到当前需要推进的事情 | 保留 Management 列表、稳定排序/搜索/分页；移除重复筛选栏 |
| CreateItemDialog 全字段表单 | 先说清要做的事 | 标题/目标为主；文件在当前任务内可加；方法/编号/条件按需配置 |
| WorkItemDetail 长页头、独立本轮状态条、重复运行按钮 | 当前事情的工作内容与 Assistant | 已重建；状态与主要动作只出现一次 |
| CompositionInputs 的文件 chip、MaterialCard、received 正文 | 查看资料身份、表示和采用关系 | 紧凑行；正文进统一阅读器；只依据明确 ID/来源建立关系，不能按名称合并 |
| CompositionAcceptance 内联大表单 | 核对完成条件及明确结项 | 独立任务 Dialog；从固定位置可达；保留先保存定义再确认语义 |
| CompositionFlow 与 DeliveryView | 查看处理与成果 | 保留真实画布/有限 Renderer/稳定 ID 选择底座，重建外层任务布局 |
| 旧 WorkItemProgress/Plan/Materials/History/Execution 等 | 原业务能力对应成果、流程、输入、记录 | 依赖审计后删除孤立布局；有效子项/跟进/来源能力纳入新任务面，不叠加旧页 |

源码检查发现：当前 WorkItemDetail 只渲染 composition 路线，旧 WorkItem* 多数组件已孤立，子项/关系等能力并未在当前详情接通。重建不能将“旧组件仍在”当作用户路线存在。

上述为实施前审计。root 确认 ui-framework-v2.md 后完成下列实施；2026-10-28 用户进一步要求与流水线共用实际骨架及左右拖拽，当前停止新增产品改动，等待新共享骨架合同接入，不能将本轮视觉重建称为最终接受。

## 具体输入、输出与错误

- 输入采用 workspace DTO；变更仍走正式 workspace/actions。方法画布保存 expectedDraftId，业务动作使用 baseRevision；轮询不覆盖未保存文本、筛选与稳定 ID 选择。
- 资料主身份是 material.id；接续值以 receivedInput.id 标识，仅 received.materials[].id 或明确 source 建立关系。上传 DTO 只有文件名，不能用相同名字建立实体合并。上传后已有提取材料，页面不再额外铺文件 chip。
- 输出成果严格绑定 delivery 的真实 Run，表格 rowKey 稳定身份；继续失败保留选择及模态，历史交付不换成最新运行。
- 空工作项需直接出现现有 Assistant Composer，不能先点击一个“开始”按钮才可写需求；1024已让同一实例 Composer 停靠，展开消息再覆盖，1440侧栏并排。
- 完成条件入口各 Tab 可达；改定义先保存才可确认，Run.completed 与结项保持不同语义。

最小验证路线：无方法建项→立即输入 Assistant→上传文件只出现一个资料主体→Assistant 保存真实 call 流程→运行→有限表格交付→跨 Tab/轮询/排序保留两条稳定 ID→来源检查并返回→选择继续且真实 runtime 只消费两条→修改合同字段→补材料→条件定义/依据/确认/结项。另检验无来源同名 received 保持独立、过期交付保留选择和错误、子项入口与真实建立。两尺寸截图检查 Composer 可见、成果宽度与无整页横向溢出。

## 验证状态

当前产品代码与近邻指南已收口，最后 `pnpm typecheck:app`、`pnpm build` 通过。构建仍报告已有大 chunk 提示，未在本业务任务扩展打包优化。

- 合并执行 `pnpm exec playwright test --config playwright.composition.config.ts --output=test-results/composition-final`：9/9，56.9s。主路线3条与独立旅程审查6条在同一个worker串行执行，避免各自清理相同artifact目录。
- 追加有未发送草稿的停靠态反例，两尺寸2/2，9.8s。发送禁用时实际footer帮助句可见，不只依靠被草稿遮住的placeholder。
- 主路线使用临时dataRoot/随机HTTP端口及真实正式runtime；Assistant/执行Agent模型是明确fixture，不能据此声称真实模型质量通过。root负责的真实模型证据独立记录。
- 独立旅程覆盖：空项直接输入、48段长会话后Composer/发送在祖先overflow内可见；两尺寸子项导航/父项无自身条件结项；1/2子项阻塞与2/2完成；真实revision冲突保留条件表单；跨方法固定Run记录；错误等待事件局部报错并保留字段、正确事件继续同一Run。
- 主路线覆盖：无方法创建、上传后单一资料身份、Assistant保存call、真实执行、声明表格、分页/筛选/跨Tab与轮询保留稳定选择、来源进入及返回、只执行F03/F26、合同字段修订、第二交付、精确加入完成依据及查看入口、人工结项；过期交付拒绝并保留选择。

## 实际改动与复用

直接复用现有 Button/Input/Textarea/NativeSelect/Tabs/Table/DropdownMenu primitives、Management 页头/搜索/分页、MaterialDialog、ArtifactValue/ArtifactComparison、RunInspector，以及现有 Assistant 的 Runtime/Thread/Composer/ModelSelector。新业务页的 Button 直接从 `components/ui/button` 导入。Modal继续沿用已有的Radix Dialog封装，没有新增基础模态或表格/工具栏平台。

| 当前业务组合 | 不可替代的职责 |
| --- | --- |
| WorkItemDetail | 当前业务身份、四Tab、跨任务选择与返回；未保存流程/条件/对话和资料选择的工作项上下文 |
| useCompositionWorkspace | workspace轮询、修订先后顺序、真实HTTP命令和文件保存；不复制服务端业务状态 |
| CompositionAssistant | 同一个实际Assistant实例的会话/Composer显示及模型设置接线；不重写聊天 |
| CompositionFlowTask / CompositionFlow | 本工作项真实运行/等待/子项入口，及同Definition图编辑 |
| CompositionInputs / DeclaredInputForm | 材料ID、输入修订ID、明确表示/来源/采用关系；实际方法合同字段与保存 |
| CompositionAcceptanceTask / CompositionAcceptance | 条件草稿、先存定义再确认、精确依据、子项阻塞与显式重开 |
| CompositionChildrenTask | 明确子项身份的管理/创建，阶段成果与已确认完成依据的不同交接；复用现有Relations/Prepare/Candidate业务任务 |
| CompositionActionTasks | 选择记录接续、保存方法、提交等待事件、精确成果引用各自的小表单和错误；不建立通用命令平台 |
| DeliveryView | 有限Renderer/store、真实交付绑定、稳定记录选择，及就近来源/引用/比较/明确子项动作 |

原长页头/本轮状态横条/重复运行按钮/开始示意/文件chip/材料大卡与received原文常驻布局已移除。条件入口固定于四Tab旁，无交付、已结项仍可达。输入清单只基于明确ID和来源建立关系；无来源接续值保留独立身份。未将CVE字段写进通用源码。

已删除无调用的旧布局/桥接16个文件：WorkItemAcceptance、WorkItemArtifact、WorkItemBatchOverview、WorkItemChildPlan、WorkItemCriteria、WorkItemExecution、WorkItemHistory、WorkItemMaterials、WorkItemPlan、WorkItemProgress、WorkItemReport、WorkItemRunOverview、WorkItemCitation、WorkItemWorkspace.css、useItemSnapshots、execution-model。保留仍承载真实任务的CandidateItems、ItemRelations、BatchItemRun、ItemBatchProgress、PrepareItemRun、ChildStageChoices、CompletionInputChoices、ReceivedInputs等；新任务入口调用它们，没有叠回旧详情页。

`src/client/AGENTS.md`已同步1024默认真实Composer停靠、同实例展开、固定条件任务与输入身份合同。最后收口去掉列表默认“待处理”与业务状态重复；dirty已有草稿时footer也显示保存原因。

## 操作和实际看图

截图目录：[evidence/ui-v2](evidence/ui-v2/)。本agent实际打开查看了以下两尺寸图片，而非仅确认文件存在：

- `list-1440/1024.png`、`create-1440/1024.png`、`inputs-1440/1024.png`：列表/创建任务完整，短桌面创建动作可达；上传文件只出现一行资料主体，不再三份重复展示。
- `list-final-1440/1024.png`：最后列表去重后的独立4330只读截图；业务待复核与执行已完成分列，默认stage不再重复。
- `delivery-1440/1024.png`、`flow-1440/1024.png`、`input-revision-1024.png`、`completed-1024.png`：表格保留主宽度；流程/填写字段/完成条件各自任务清楚，1024动作不被裁切。
- `dirty-composer-1440/1024.png`：已有草稿仍保留，输入及发送完整可见，footer明确先保存的原因。
- 另实看4330长会话高度修复图 `/tmp/workitem-v2-host-fix.png`，host/detail为900px，Composer底部888px；独立框架/旅程agent另查看并记录canonical round2长会话证据。

最初长会话失败原因是App内item-workspace-host没有受限高度，随正文撑到1479px；已通过本地工作项CSS限定host→Detail→body→Thread高度链，未用固定定位假输入框掩盖。

## 当前边界与后续交接

本轮未复验全部历史H/T路线、所有批量/分治大数据路线。记录比较与候选审阅入口已接，未将所有旧跨方法比较场景称为已验；历史公用方法Run仍通过记录进入共享检查器。无来源旧fixture没有通过名称/字段猜测伪造来源。真实模型、模块/HTTP测试、fixture浏览器和用户视觉判断分别报告。

最新用户反馈要求与流水线共享实际页面骨架并具有同样左右拖拽和宽度记忆。root已要求保持当前业务功能与已过证据，停止新增产品改动；等待全新框架agent提供最小共享app/components合同，然后接入工作项。当前状态是“业务重建与本轮验证完成，共用骨架待接”，不是最终交付。
