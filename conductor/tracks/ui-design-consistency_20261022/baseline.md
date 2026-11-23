# 问题与证据基线

2026-10-22。下列内容来自此前代码审计、真实页面操作与截图，作为本 track 的输入。**这是实施前输入；引用的历史测试和测量不代表最终版本，当前结果见evidence.md。**

## 用户反馈与当前状态

| 问题 | 已有处理 | 本 track 要继续解决 |
| --- | --- | --- |
| 详情没有重点、历史缺少环节来源、跳转迷失、制品全文堆积 | 已提供工作项内的轮次/环节/成果检查、来源、比较、使用与返回能力 | 用设计建立整体主次和稳定定位，避免新功能继续占满页面；保留跨流水线适用性 |
| 渲染很慢，卡片标题/状态/成果标记错位，暗色层次不清 | 已修正按需渲染、稳定更新及部分对齐/颜色，见性能记录 | 维持性能，检验整页层次与空间比例，不能把局部修复当作设计完成 |
| 缺乏呼吸感 | 已截图诊断，尚未调整整体布局 | 顶部占用、正文进入首屏的时机、套框、文字宽度和间距节奏 |
| 设计语言不稳定，定制和微操编码过多 | 已有 Geist 方向、shadcn/Radix 和控件指南 | 将原则落实到页面、默认值及样式归属，适当复用，避免多处重做基础控件 |
| 重点应是设计，而不是堆砌组件和功能 | 本 track 明确为首要原则 | 每阶段以整页用户体验评估，组件盘点仅用于支持设计决策 |

## 已有证据

- [成果工作空间范围与验收](../workitem-workspace_20261022/spec.md)：已有操作与业务边界，重排不能削弱这些能力。
- [呼吸感截图 review](../workitem-workspace_20261022/spacing-review-20261022.md)：两尺寸页头约 183px；1440 下页头加概览约 385px，第一条实际数据约在 y=797；1024 首屏几乎没有成果正文。含首屏、报告、业务记录截图与尺寸记录。
- [性能与对齐修复](../workitem-workspace_20261022/performance-20261022.md)：同一真实数据的首次打开由 7.8 秒改善到约 1.2 秒、切换由 7–11.5 秒改善到约 0.18–0.26 秒；含脚本、原始测量和截图。这是历史本地样本，不是通用性能保证。
- [当前设计实例](../../../src/client/DESIGN-NOTES.md)、[产品指南](../../product-guidelines.md)、[控件约定](../../../src/client/components/ui/README.md)：已有方向与默认语义，实施时修订这些正式入口。

## 代码审计的具体入口

正式 `components/ui/` 已有 13 个控件源码，包含 Button、Tabs、Dialog、Input、Textarea、Table 等；`components.json` 指向正式 shadcn new-york / neutral / Lucide 配置。缺口集中于页面构图、控件使用方式与样式治理，不能据此得出“需要再换一套库”。

- `components/ui.tsx` 兼容层与 primitives 各有尺寸/外观来源；部分业务表单仍自行处理原生输入控件。逐处判断统一入口，避免机械替换所有标签。
- `WorkItems.css` 的未分层 `.items-heading` 与 `WorkItemWorkspace.css` 的 `@layer components` 规则存在覆盖冲突；此前截图实测页头仍为 28/32/22px padding。Tabs 的 utilities 也会压过组件层规则，必须核对最终 computed style。
- `styles.css`、`WorkItems.css`、`WorkItemWorkspace.css` 的边界需要按实际职责整理；文件长或短都不能独立证明设计质量。
- React Flow、assistant-ui 和 Markdown 有各自的专门交互，统一视觉不等于替换这些能力。

## 参考的具体用途

| 参考 | 用途 |
| --- | --- |
| [Linear 界面演进](https://linear.app/now/behind-the-latest-design-refresh) | 位置与视图层次、导航退后、内容优先 |
| [Geist Materials](https://vercel.com/geist/materials)、[Typography](https://vercel.com/geist/typography) | 材质角色、暗色层次与成套文字规格 |
| [Primer PageHeader](https://primer.style/product/components/page-header/)、[PageLayout](https://primer.style/product/components/page-layout/) | 定位、标题、操作、导航和内容的布局关系 |
| [shadcn 官方文档](https://ui.shadcn.com/docs) | 利用已有基础控件的交互与组合能力；页面构图仍由本产品设计负责 |

以上为此前已查阅的参考。Phase 1 需针对实际布局选取少量实例，记录采用理由；不增加第二套视觉皮肤或组件依赖。

## 与既有 track 的关系

本 track 基于已交付的工作项进度/成果工作空间继续设计，旧实现不重复立项。与 [视觉锐利度提升](../visual-sharpness_20260920/index.md) 的颜色/边框范围有重叠；其旧 token 数值和配色建议是历史方案，本轮结合真实页面重新判断，不直接照搬，也不将该未完成任务当作阻塞依赖。本次不改写其计划或完成状态，实施后登记实际覆盖情况。
