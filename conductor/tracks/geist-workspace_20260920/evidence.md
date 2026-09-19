# Geist 暗色工作区：实施与验证

2026-09-20。用户指定 Vercel 系列参考、暗色默认、统一组件参数、纠正侧栏与文字密集节点。本轮是正式 src/ 的视觉和信息结构调整。

## 参考与实现

实际打开 [Geist 颜色](https://vercel.com/geist/colors) 并切换 Dark，阅读 [Button](https://vercel.com/geist/button)；采用中性背景、填充、边框、文字的分层，白色主要操作。现有 React Flow、Radix、assistant-ui 继续使用，没有添加 UI 依赖。

- styles.css 集中暗色变量，统一字体、基础控件、边框、状态、弹窗和结果阅读区域。
- Sidebar 只展示紧凑导航、最近五项工作、当前工作输入材料及设置。MaterialsDialog 承载全文、多选、全选/清空、新增入口。
- WorkflowCanvas 采用相同节点身份区、执行摘要、端口条。标题预留两行，任务长文留在 NodeInspector；Agent 名称在新增选项及节点中保持一致。端口 ID 与图编辑语义保持不变。
- WorkLibrary 收紧行距与图标尺寸，使用同一暗色控件。

## 实看证据

以下为正式应用截图，使用已持久化的真实“客户反馈分析”工作；本轮未重新调用 LLM。模型内容来自上一轮真实运行，不能将其计为本轮模型验证。

| 场景 | 截图与观察 |
| --- | --- |
| 画布 | [1440](screenshots/canvas-1440.png) / [1024](screenshots/canvas-1024.png)：名称、方式、状态、具名端口分层；两行标题不推移普通 Agent 节点端口。窄窗口可平移或收起侧面板。 |
| 配置 | [1440](screenshots/inspector-1440.png) / [1024](screenshots/inspector-1024.png)：任务全文在配置区编辑，底部试运行保持可达。 |
| Assistant | [1440](screenshots/assistant-1440.png) / [1024](screenshots/assistant-1024.png)：回复、保存卡、工具展开及输入框共用暗色层级。 |
| 材料 | [1440](screenshots/materials-1440.png)：全文、编号、选择对齐；实际打开新增材料弹窗，入口可达。 |
| 报告 | [1440](screenshots/report-1440.png) / [1024](screenshots/report-1024.png)：真实长 Markdown、表格与来源。 |
| 比较 | [1440](screenshots/comparison-1440.png)：固定两侧内容和过期提醒可读。 |
| 工作库 | [1024](screenshots/library-1024.png)：截图包含明确命名的自动验收工作，用于检查密集列表、分页和长标题。 |
| 设置 | [1024](screenshots/settings-1024.png)：协议、端点、模型和推理字段可读，长表单可滚动；未改动配置。 |

刷新后读取 DOM：默认 color-scheme 为 dark，1440 的文档宽度为 1440；1024 实看文档宽度为 1024，没有页面横向溢出。全图适配会调整缩放，流式更新仍遵循原有保留视口行为。

## 自动验证

- `pnpm test:browser`：4/4，通过 1440/1024 的实际函数流程编辑、连接修错、执行、重开，以及工作库搜索/分页/重命名/归档/恢复。同工作重新打开保留未提交内容。
- 材料迁移后更新浏览器路线，实际清空/全选三条材料，再完整执行并核验产物包含三条原材料；同工作重开通过材料面板读取原文。初次测试新增 locator 变量遮蔽了已有材料数组，已更名修正，重新运行 4/4 通过。
- `pnpm test`：44/44，通过模块和真实 HTTP/文件集成测试。
- `pnpm typecheck:app`、`pnpm build`、`pnpm format:check`、`git diff --check`：通过。构建保留既有大 chunk 提示（约 952 kB 未压缩），没有为视觉修改扩展打包架构。
- 28 项本轮测试生成的列表/流程工作已通过归档接口归档，原真实工作保留。

## 范围与边界

没有改变 IR、执行、模型设置、持久化格式。原型仍支持桌面窗口；本轮未验收手机布局或大型复杂图。旧浅色/紫色设计不作为后续视觉模板；本轮工程和截图检查完成不代表用户已认可审美。设计规则同步到 product-guidelines.md 与 src/client/DESIGN-NOTES.md。
