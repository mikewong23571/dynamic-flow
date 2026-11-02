# 工作项原语与动态界面调研证据

日期：2026-10-28。结论与范围见[实现调研](../../workitem-meta-implementation-research.md)。本目录保存无模型探针及输出，不代表 Flowcraft 已实现这些能力。

## 环境和来源

- Node 25.4.0、React 19.3.0、Ajv 8.20.0、Zod 4.6.5、项目现有 tsx。未进行 Node 22 产品验收。
- json-render 官方源码 SHA：`c6f73d7d5f69acb80fc89faefd12c0865c8603d1`，core/react manifest 为 0.21.3。使用官方 codeload 源码和临时依赖映射，不是 npm 发布包集成。
- A2UI 与 JSON Forms 仅进行官方规范、固定源码和上游测试审读，未执行它们的测试套件。固定 SHA 见实现调研。
- LangGraph 1.2.18、Python 3.12.3，跨进程恢复另用 checkpoint-sqlite 3.1.2。完整依赖见 langgraph-requirements.lock.txt。
- 公开浏览器示例 https://no-ai-demo.json-render.dev/ 为访问当日部署，未取得它的部署 commit，不能归因到上述源码 SHA。

## 结构合同实验

```sh
node docs/evidence/workitem-meta-research_20261028/schema-probe.mjs
```

输出为 schema-output.json。验证现有 Pi Type 导出可直接交给 Ajv；空 groupBy keys 被拒绝；不存在的业务路径仍可通过结构校验；纯校验保留原值；启用 coercion 和删除额外字段会改变数据。

## json-render 源码与 SSR 实验

将固定 SHA 的官方源码及依赖放在独立临时目录，设置 JSON_RENDER_SOURCE。该目录需要能解析 zod/react，以及指向源码的 @json-render/core、@internal/react-state。可用临时 node_modules wrapper 指向 packages/core/src/index.ts、packages/core/src/store-utils.ts、packages/react-state/src/index.tsx；不修改上游源码。

本轮复核命令：

```sh
JSON_RENDER_SOURCE=/tmp/flowcraft-json-render-research-20261028 pnpm exec tsx docs/evidence/workitem-meta-research_20261028/json-render-probe.ts
JSON_RENDER_SOURCE=/tmp/flowcraft-json-render-research-20261028 pnpm exec tsx docs/evidence/workitem-meta-research_20261028/json-render-renderer-ajv.ts
```

两个脚本退出码均为 0。前者输出 json-render-output.json 中的校验、事件丢失、动作参数与流式截断反例；后者输出 json-render-renderer-ajv-output.json，证明普通 registry、Renderer 与项目 Ajv 校验可共同使用，无需再声明 Zod props catalog。

原始实验环境说明保存在 json-render-README.md，其中 /tmp 路径只说明本轮来源；已归档脚本使用 JSON_RENDER_SOURCE，支持移动源码目录。没有归档临时 node_modules 或完整上游源码。

## 工作流实验

脚本为 langgraph-probe.py 与 langgraph-restart_probe.py，输出为 langgraph-probe-output.txt，恢复后的调用计数为 langgraph-restart-counts.json。

使用独立 Python 3.12 venv 安装 lock 中依赖后运行普通探针。跨进程探针将 SQLite 和计数写在 FLOWCRAFT_RESEARCH_DIR；每轮使用新的空目录，按 first、second 顺序运行，避免复用前轮数据。脚本主体与原实验相同，仅将固定临时目录改为参数。本轮复核命令如下，其中目录需替换为本轮新建的空目录：

```sh
/tmp/flowcraft-orchestration-research/venv/bin/python docs/evidence/workitem-meta-research_20261028/langgraph-probe.py
FLOWCRAFT_RESEARCH_DIR=/tmp/flowcraft-restart-new-run /tmp/flowcraft-orchestration-research/venv/bin/python docs/evidence/workitem-meta-research_20261028/langgraph-restart_probe.py first
FLOWCRAFT_RESEARCH_DIR=/tmp/flowcraft-restart-new-run /tmp/flowcraft-orchestration-research/venv/bin/python docs/evidence/workitem-meta-research_20261028/langgraph-restart_probe.py second
```

探针观察成功任务恢复不重跑、不同 barrier 行为、显式失败值收集、嵌套 interrupt 的重执行，以及正常任务回执对副作用重复的影响。未验证远端操作成功但本地回执未保存时的崩溃，不证明恰好一次。没有实跑 Node LangGraph 或 Windmill。

## 公开示例浏览器实验

```sh
node docs/evidence/workitem-meta-research_20261028/browser-probe.mjs
```

独立 Playwright Chromium 153.0.8010.12、1440×1000，无登录、无模型请求、不使用本地应用端口。输出 browser-output.json，截图 public-demo.png。

本轮完成表单值编辑、Japan/Tokyo 的联动与计算展示，再切换 Canada，确认可选城市已更新而计算结果仍保留 Tokyo。observedDependentValueMismatch=true 表示成功复现不一致，probeCompleted=true 仅表示实验完成，不能解释为示例业务正确。

最初脚本因页面 hydration 和组合框可访问名称假设失败，改为等待具体内容及按页面既定顺序选择控件。另一次“空值必须显示 placeholder”的假设被实际页面否定；最终脚本检查可观察的选项与计算结果，并保留实际空 trigger 文本。没有把这些定位调整算作产品修复。

## 未验证范围

未运行完整上游测试套件、真实模型生成、项目组件与新 renderer 的浏览器集成、并发文件保存、生产分布式执行或任意远端副作用。本目录中的探针验证能力与边界，不替代设计文档所列产品验收。
