# 验收证据

状态：P0–P3 已实现，工程回归通过；最终观感待用户判断（不以测试通过代替审美认可）。

## 实施内容

- P0 tokens（styles.css `:root`）：`--canvas:#000`、`--paper:#0a0a0a`、`--surface:#141414`、`--hover:#1f1f1f`；`--line:rgba(255,255,255,0.08)`、新增 `--line-strong:rgba(255,255,255,0.16)`、`--line-hover:rgba(255,255,255,0.22)`；新增 `--ink-strong:#fff` 并用于 h1/h2/h3 与品牌、选中项；`--subtle:#666`；阴影减为 `0 8px 30px rgba(0,0,0,0.5)`。表单控件边框用 `--line-strong`。
- P1 侧边栏：hover `rgba(255,255,255,0.04)`、selected `rgba(255,255,255,0.08)` + 纯白文字；分组标签 11px + `letter-spacing:0.06em`；右分隔线随 token 变 alpha。
- P2 中间编辑区：节点卡片、空状态卡片、画布浮动工具条/提示卡边框统一 `--line-strong`（原硬编码 `#383838` 已清）；tab 与开关本就白/灰，蓝色保留在焦点环、链接、节点选中/运行描边、连线聚焦、状态 badge——与 Geist「蓝色仅焦点/选择/状态」一致。
- P3 全局：modal 边框 `--line-strong`、阴影随 token 减轻；滚动条 `rgba(255,255,255,0.14)`。

## 截图（本目录 screenshots/）

- `after-canvas-1440/1024.png`：工作区画布（纯黑底、alpha 分隔）。
- `after-node-selected-1440/1024.png`：节点选中描边。
- `after-modal-1440/1024.png`：创建对话框（含此前页脚对齐修复）。
- `after-items-table-1440/1024.png`：工作项表格（用户指出「不专业」后整改）。
- `after-library-table-1440/1024.png`：流水线表格（共用管理表格样式，同步受益）。

## 管理表格整改（用户反馈「非常不专业」）

- 表头去底色带，11px muted + `letter-spacing:0.04em`；行高 39→36px。
- 行 padding 16→10px，行高收到 ~52px；行 hover 改 `rgba(255,255,255,0.03)`（原 paper 底色在纯黑底上不可见）。
- 业务进展列层级修正：badge 为主，阶段文字降 11px muted（原 12px 前景色比 badge 更抢眼，层级倒挂）。
- 时间列右对齐 + tabular-nums；工作项列宽 30/30/25/15 → 34/30/22/14，消除稀疏列的大片空白；流水线页时间表头同步右对齐。
- 业务进展列去重（用户指出「一格塞三样」）：该列原是派生状态 badge（待推进）+ 业务阶段 stage（待重新评估）+ 进展摘要三件套，默认派生态与业务阶段语义重复。现有 stage 时 stage 作主标签（12px 前景色），「待推进」兜底 badge 不再显示；badge 只保留推进中/等待中/需处理/已结项等有信号的状态，并列时阶段文字退为 11px muted；摘要保留为 muted 第二行。截图 `after-items-progress-1440.png`。

## 工程回归

- `pnpm typecheck:app` 通过；`pnpm test` 113 项全过；`pnpm test:browser` 15 项全过。

## 未测与边界

- 真实观感由用户在两种窗口尺寸实际操作判断；候选 badge、警告横幅的 soft 底色未进一步压暗，如用户觉得突兀再收。
