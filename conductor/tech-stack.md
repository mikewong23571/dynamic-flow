# 技术栈与决策状态

## 当前状态

Conductor 已初始化，组件接入 Spike 已落地：一个独立 example、锁定依赖、真实 Pi SDK fixture、浏览器证据。实验安装不自动代表所有库进入正式产品。

详细结论：[组件 Spike 结果](./tracks/component-integration-spike_20260919/results.md)。

## 基于实测的建议

| 领域 | 建议 | 状态与边界 |
| --- | --- | --- |
| 前端 | React 19.3.0 + Vite 8.3.0 + TypeScript 7.0.2 | 已运行；TS7 配置已修正 |
| 基础 UI | shadcn/ui + Radix + Tailwind + Lucide | 三个控件经官方 CLI 生成；统一视觉需要业务设计 |
| Chat | assistant-ui 0.15.21，ExternalStoreRuntime | 用户首选；真实 Pi 工具、流式、取消已验证 |
| Agent | Pi SDK 0.85.1 | 真实 AgentSession + faux provider 已验证；真实模型和跨轮恢复未验证 |
| 后端与传输 | Node + Hono + POST/SSE | 已运行；原型无需第二套 Agent loop 或 WebSocket |
| 分栏 | react-resizable-panels 4.12.4 | 拖动与缩放通过；采用 v4 API |
| 样本表格 | TanStack Table 9.2.4 | 排序、多选、筛选后稳定身份通过；锁定 v9 示例 |
| 源码与 Diff | Monaco 0.56.0 + 编辑器 React wrapper 4.7.0 | 可用；Diff 需要薄生命周期适配，体积成本明显 |
| Inspector | shadcn 组合 + react-markdown；JSON viewer 可选 | 不引入独立遥测平台；JSON viewer 安装版本为 alpha |
| Work Map | 树/目录优先；Arborist 按层级需要采用 | 树与图都已试接；React Flow 暂缓进入默认产品依赖 |
| Spike 工作区 | 复用控件，自研版本/样本/产物规则 | 本例仅内存比较与采用状态，未执行 Method |
| 页面状态 | React state | 本例足够；没有引入 Zustand/Redux/TanStack Query |

这些是选型建议，正式产品最终取舍留给用户讨论。不要将 example 中为了比较而同时安装的树与图等组件照单复制。

## 仍待验证的关键决定

- Method 局部执行、取消与源码位置/版本绑定。
- TypeScript Compiler API 与 Babel 的实际索引成本；本轮没有做 AST 实验。
- 真实 Pi 作者会话的跨轮上下文、修改代码与恢复。
- Method、Run、Spike、Artifact 的持久化与续做：文件/JSONL 或 SQLite 元数据 + 文件仍待比较。
- 首个场景真正需要哪些文件解析与呈现能力，不笼统添加 PDF/CSV 全套能力。

## 工程工具

pnpm 10.32.1；Node 实测 24.14.0，Pi 要求 >=22.19；node:test + tsx、Playwright Chromium、Prettier。具体版本见 package.json/pnpm-lock.yaml 和 example 的 evidence/versions.json。

命令见 [工作流程](./workflow.md) 与 [Example README](../examples/component-spike/README.md)。

## 实现约束

- 复用通用机制，自研代码集中于产品语义、状态映射和必要衔接。
- 不重建 Agent loop、模型客户端、编辑器、Diff 算法或布局引擎。
- 不因一个技术实验成功就引入通用平台或所有候选组件。
- 无需求不拆多包；安全、权限、隔离、生产治理不属于本原型选型范围。
- 原设计 v2 是背景，后续用户要求和当前原型约定优先。
