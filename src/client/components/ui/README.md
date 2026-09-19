# 正式 shadcn/ui 控件

本目录于 2026-09-20 从 shadcn 官方 `new-york-v4` registry 获取 Radix 组件源码（MIT），例如 [Tabs registry](https://ui.shadcn.com/r/styles/new-york-v4/tabs.json)。接入方式参考 [官方文档](https://ui.shadcn.com/docs)、[主题变量](https://ui.shadcn.com/docs/theming)。源码纳入仓库是 shadcn 的使用方式。

- `components.json` 指向正式 `src/client/styles.css`，`@/` 在 TypeScript 与 Vite 中均指向 `src/`。
- 官方 `cn` 导入改为本项目 `client/lib/utils.ts`（clsx + tailwind-merge）；组件之间的 registry 路径改为正式路径；Dialog 关闭文本本地化。
- 主题 token 对应现有 Geist 暗色。Tailwind 的主题与工具类作用于正式代码；不全局引入 preflight，以免重置尚未迁移的画布和编辑器。原生控件旧样式使用低优先级 `:where(...:not([data-slot]))`，不会争夺这些组件样式。
- `../ui.tsx` 仅兼容原有业务 `primary/secondary/ghost/danger` 和 `Modal`、业务状态 Badge API，底层使用这里的 Button/Badge/Dialog；新页面直接使用 primitives。
- `../Management.tsx` 只组合两页已重复的页头、搜索、分页、载入状态；列、请求和业务动作留在各页面。
- NativeSelect 是官方样式的原生选择控件，键盘选择由浏览器提供；Tabs、Dialog、DropdownMenu 的焦点及键盘行为由 Radix 提供。简单列表用 Table，不引入通用数据表配置平台。

旧 Spike 保留自己的 `tsconfig.spike.json` 别名，不能据旧样式修改正式控件。全项目剩余原生编辑控件尚未全部迁移；此次范围是两个管理页、共享按钮/弹窗以及函数式编辑使用的新控件。
