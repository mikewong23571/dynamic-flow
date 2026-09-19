# Dynamic Workflow Workbench

原型目标：用户用画布、节点配置与自然语言调整做法，运行并查看结果，用小样本比较改法，再分别采用定义和保留产物。

当前是**代码骨架阶段，正式业务未实现**。目录和类型检查不代表功能可用。

| 入口 | 用途 |
| --- | --- |
| [模块与验收地图](./docs/implementation-map.md) | 子问题拆分、各模块 AGENTS、验收责任、关键连接和待验证假设 |
| [用户故事](./docs/user-stories.md) | 六类目标、19 个故事、T1–T8 验收路线 |
| [当前设计](./docs/design.md) | 画布 + JS 子集 IR + runtime 的简化方向 |
| [源码约定](./src/AGENTS.md) | 开始模块工作前阅读，目录内部继续读 AGENTS |
| [伪代码 Spike](./spike/README.md) | 接口与行为推演，31 个设计测试场景 |
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
