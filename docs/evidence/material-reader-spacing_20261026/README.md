# 材料阅读器正文边距（2026-10-26）

两层排版造成视图起点不一致：通用ArtifactValue文本视图使用76ch最大宽度与auto左右边距；结构化对象首行还有12px顶部内边距。原文没有这些额外空白。

修正仅限定MaterialDialog：文本取消居中限宽，结构化顶层首行取消顶部内边距，继续使用两种视图共用的正文容器padding；不改全局成果阅读排版或嵌套字段的内部间距。

隔离副本 `/tmp/flowcraft-reader-spacing-wl8GXo`，构建正式前端、临时数据与私有随机端口HTTP/runtime；无托管用户数据修改或服务重启。

- `pnpm build`通过，保留现存bundle大小提示。
- `tests/browser/material-cards.spec.ts`：2 passed，1440×900与1024×768。直接比较对象首字段与原文的x/y起点、纯文本首段与原文的x/y及阅读区宽度；继续覆盖弹窗固定框架、滚动位置、背景卡片、来源跳转与嵌套选择。
- 两尺寸截图已实际检查；Chromium范围，无Firefox/Safari或真实模型验证。本次是局部CSS修正，未重复无关业务回归。

[内容1440](popup-1440.png) / [内容1024](popup-1024.png)。

[原文1440](raw-top-1440.png) / [原文1024](raw-top-1024.png)。
