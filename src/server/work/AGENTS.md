# 工作、材料与产物

适用本目录，继承上层约定。当前已实现本模块业务；域内证据与产品联测边界见文末实现交接。

## 职责与子问题

用户如何建立工作、提供材料、拿到报告，并用明确选择的结果继续？负责创建/读取工作、追加材料、保留结果、续做输入预览和报告读取。故事：A1、D1、D2、F2、F3、F4。

## 目标

- 缺目标/材料时保留输入并说明问题；追加材料不覆盖历史。
- 保留结果与采用做法独立；续做只使用明确选定的输入。
- 报告说明材料范围、来源和完整性，前端可完整阅读与复制。

## 非目标

不调度节点内部执行，不自动选择“最新结果”，不建多格式导入导出、模板市场或通用 CRUD 层。

## 接口与依赖

提供 createWork/listWorks/rename/archive/addMaterials/keepResults/previewResults。输入为目标、材料、工作属性或所选结果；输出为 Work、WorkPage 或带来源的 Inputs。执行续做由 HTTP 将 previewResults 的明确结果交给 runs.start；报告直接显示对应 NodeResult。

直接依赖 files、runs；无额外第三方业务框架，不直接调用 Pi。参考 [伪代码](../../../spike/src/server/work.pseudo.md)。函数和字段可随真实调用调整。

## 验收与证据

下文编号只是查阅索引：P 表示具体测试场景，T 表示完整用户验收路线；含义见 [术语与编号](../../../docs/glossary.md)。

- [x] 输入检查、结果可读、来源准确，失败报告不冒充完整结果（场景 P01/P10/P11）。
- [x] 只保留、只采用分别正确；旧 F02/F03 与新 F01 续做时实际输入恰好是三条选择；同材料多版本有明确处理（场景 P18/P19）。
- [x] 新材料运行不污染旧结果；与 files 验证真实保存重开（场景 P20/P21）。
- [x] 与 runs/client 联测“输入预览 → 确认 → 实际报告”，不能仅 mock 相邻模块。

## 假设与未知

文本反馈是起点，不代表所有产物都对应单条材料；汇总产物可能覆盖多个材料。遇到重叠应保留真实例子并调整选择规则，不为了现有字段删减业务含义。本清单不穷尽未知。

## 2026-09-20 实现交接

已实现 `createWorkService(files)`：createWork、addMaterials、keepResults、previewResults；签名见本目录 index.ts。目标与非空材料必填，新材料 ID 使用工作内稳定短编号 M01、M02 等；追加在 files.change 内从现有最大短编号递增，避免并发冲突。旧 UUID 材料及历史引用保持原样。只保留成功结果；保留不修改采用版本。预览仅取用户明确选择的成功结果输出，提供 input 端口，保留 materialIds 和 sourceResultIds 并补上直接来源结果 ID。

重复结果、重复样本和重叠材料（包括单条与汇总产物的重叠）拒绝续做预览，让用户明确选择版本。预览不自动取所有保留产物，也不挑最新结果。报告由调用方读取快照中的原始结果；不另复制一份报告权威状态。

域内证据：`pnpm exec tsx --test tests/state.test.ts` 验证旧 F02/F03 加新 F01 恰好三条输入、汇总来源重叠、失败结果拒绝、采用/保留独立、材料追加与重开。状态为 **模块实现完成，产品联测待验收**；预览后确认并实际汇总、真实报告内容和 UI 可读性仍由 runs/client/根联测。


材料引用可读性反例：真实报告引用长 UUID 难以核对，影响 D2/F3。已将新材料改成每工作递增短编号；域内测试新增十次并发追加、文件重开后继续编号、不同工作重新从 M01 开始，以及旧 UUID/结果引用不变。没有迁移或重写历史产物。

## 追加工作维护（G2）

`listWorks({query?,page?,pageSize?,archived?})` 返回共享 `WorkPage`：标题与目标搜索，更新时间倒序，默认第 1 页/每页 10 项，页容量 1–100，超过最后页时返回最后页；默认活动工作，archived=true 只返回归档工作。`rename` 接受 1–80 字标题并标记 titleEdited=true；`archive(true/false)` 归档或恢复，不删除定义、运行或材料。新工作标题暂取目标前 28 字，作者工具另行生成自然短标题；旧工作缺标题时列表读取提供同样回退。

域内证据：状态测试新增搜索/两页结果、标题与目标区别、重命名持久化及手改标记、归档恢复、旧工作回退与分页边界，共 14 项测试通过。独立 WorkLibrary 组件复用现有 Button/Modal 和视觉 token；最终页面接线与正式浏览器证据由 tests/browser/work-library.spec.ts 检查。

G2正式接线域内回归已通过：`pnpm test:browser` 三项通过，其中列表用真实 HTTP 创建 12 项独立工作，浏览器验证搜索分页、重命名同步侧栏、归档恢复和重开。截图与可恢复 fixture ID 见 tests/browser/evidence/README.md。函数工作台两尺寸回归也通过；真实模型和完整用户路线仍由根任务验收。

产品级验证与边界见 [本轮验收证据](../../../conductor/tracks/full-application_20260920/evidence.md)。

## 流水线管理摘要

WorkSummary 增加 definitionState（empty/draft/adopted/changed）及 nodeCount，由真实 draftId/adoptedId 和当前定义读取产生；列表不再把未归档称为进行中。只读取当页定义计算节点数，不为了列表存第二份状态或节点计数。tests/state.test.ts 覆盖无定义→草稿→采用→候选变化→放弃的状态切换。
