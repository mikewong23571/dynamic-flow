# Dynamic Workflow Workbench

原型目标：用户用画布、节点配置与自然语言调整做法，运行并查看结果，用小样本比较改法，再分别采用定义和保留产物。

当前是**代码骨架阶段，正式业务未实现**。目录和类型检查不代表功能可用。

例如：用户提供三条客户反馈，助手生成“分类 → 汇总”的节点图；用户在画布或对话中修改分类要求，选两条样本比较结果，再分别采用做法、保留结果并生成报告。

浏览器提供画布与对话；后端使用 Pi（智能体开发工具包）调用模型和工具，应用自己的执行代码负责步骤间的数据传递与结果保存。

| 入口 | 用途 |
| --- | --- |
| [术语与编号](./docs/glossary.md) | 常见缩写、产品对象，以及故事、场景、验收路线编号的解释 |
| [模块与验收地图](./docs/implementation-map.md) | 子问题拆分、各模块 AGENTS、验收责任、关键连接和待验证假设 |
| [用户故事](./docs/user-stories.md) | 六类目标、19 个故事、T1–T8 验收路线 |
| [当前设计](./docs/design.md) | 画布 + JavaScript 子集工作流定义 + 执行代码的简化方向 |
| [源码约定](./src/AGENTS.md) | 开始模块工作前阅读，目录内部继续读 AGENTS |
| [伪代码 Spike](./spike/README.md) | 接口与行为推演，32 个设计测试场景 |
| [独立骨架评审](./docs/reviews/skeleton-20260920.md) | 无前文背景的子代理如何理解本应用、发现的缺口及修订复核 |
| [Conductor](./conductor/index.md) | 项目约定与工作 track |

```text
src/
  AGENTS.md
  client/       AGENTS.md + Workspace.tsx
  server/       AGENTS.md + index.ts（未来 HTTP/SSE 入口）
    work/       AGENTS.md + index.ts
    flow/       AGENTS.md + index.ts
    runs/       AGENTS.md + index.ts
    assistant/  AGENTS.md + index.ts
    trials/     AGENTS.md + index.ts
    files/      AGENTS.md + index.ts
  shared/       AGENTS.md + records.ts
tests/          AGENTS.md（按实际实现加入行为测试）
data/           AGENTS.md（实际工作数据不提交）
```

每个源码入口当前只有空模块声明。没有运行中的正式应用，没有批量生成未经验证的业务签名，也没有填充假的成功数据。下一步按真实纵向用户路径实现，模块边界与字段可随证据调整。

检查新骨架：`pnpm typecheck:app`、`pnpm format:check:app`。`pnpm typecheck` 同时检查旧组件实验和新源码。

现有 `pnpm dev`、`pnpm build`、`pnpm test`、`pnpm test:browser` **仍服务于旧组件实验**，不代表新产品能力。新产品运行/测试命令随第一条真实路径加入。模型配置位于已有根 `.env.local`，当前骨架尚不加载它。
