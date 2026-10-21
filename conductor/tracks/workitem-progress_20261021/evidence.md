# 验证记录：工作项进度总览与单项推进状态

## 2026-10-21 规划

本次只创建规格、实施计划和注册表入口，未修改正式应用、用户数据或模型配置，未开始功能实现。

已对照当前 WorkItem/WorkItemView 类型、work-items 服务及 HTTP 动作、列表/详情、Agent 工具、Run 里程碑与展开处理、现有测试及项目 workflow 确认入口。工作项汇总、活动节点摘要、独立进展报告是待实现内容。

规划文件检查通过：metadata JSON 可解析，4 份 Markdown 的 10 个本地链接均存在，25 个实施任务全部未开始，注册表入口唯一且项目索引已链接 tracks 基础目录；文件无行尾空格，`git diff --check` 通过。文档规划未运行应用测试。

## 功能证据

| 验证层次 | 当前状态 |
| --- | --- |
| 模块业务规则与旧数据兼容 | 通过；`pnpm test` 175 项通过、0 失败/跳过，约 9.8 秒 |
| 相邻模块真实文件/HTTP/运行联测 | 通过；涵盖报告保存、HTTP 汇总、重开、跨工作项/方法隔离、展开与并行执行及真实子进程恢复 |
| Pi 工具边界替身 | 通过；报告工具身份、试验/规划隔离、重复与迟到、报告后输出成功/失败分别覆盖 |
| 真实模型报告行为 | 通过本次 `glm-5.3-flash` 单样例；原始报告结果脱敏保存，见下文 |
| 浏览器完整操作 | 工作项/状态边界两尺寸 4 项通过；补非空侧栏后 6 项通过（56.9 秒）；字重微调后侧栏定向回归另记下文 |
| 两尺寸截图检查 | 已实际查看 1440×900 与 1024×768 的总览、报告、等待、重开、读取失败及非空侧栏截图 |
| 用户视觉判断 | 已收到侧栏突出边框及偏薄字重的反馈并修正；最终审美接受由用户判断，不以自动测试代替 |

历史生命周期 track 的已通过记录仅为背景，不代表本 track 已通过。

## 实施检查点

- 2026-10-21：前端总览/详情/历史已实现，提交 `4651370`；修正结项/重开摘要来源与下一步优先级，提交 `54797be`。正式源码类型检查通过。
- 真实模型：使用根目录已配置的 `glm-5.3-flash`，在临时 dataRoot 运行不含里程碑的单 Agent 流程。模型真实调用一次 `report_progress`，报告引用 M01、保存下一步与业务阻碍；Run completed，WorkItem 仍 open/attention，确认条件数为 0。重新创建应用后报告仍可读取。耗时约 59 秒，临时数据已清理；脱敏结果见 [real-model.json](artifacts/real-model.json)。这是一次具体模型/材料验证，不代表所有模型一定会报告或报告准确。
- 浏览器首轮发现实际问题：Agent 抛错保存在 NodeResult，但工作项 execution.error 只读取 Run.error，页面缺少错误原因。保留断言，由后端修复错误投影；本记录不把首轮计为通过。

## 实现与回归结果

- 后端 `cce0323`：汇总在过滤前计算，pending 包含所有未结项项；活动步骤来自固定定义/展开事实。新增进展报告按当前正式普通 Agent 实例与冻结材料校验，复用历史去重和串行原子保存；旧 revision、停止/结束/旧 Run、规划和 preview 写入被拒绝。节点错误投影已修复。10 项新进展测试以及既有 assistant 测试覆盖真实运行链路和明确的 Pi 替身。
- 前端 `4651370`、`54797be`、`4188b84`：紧凑汇总、全局数量/匹配数区分、实际执行/业务阶段/报告来源、等待/错误/阻碍/下一步、报告历史与条件确认。重开/换方法不把历史成功运行当新推进；轮询和外部条件更新保留本地未保存输入，失败过滤明确标示保留旧内容。
- `pnpm exec tsx --test tests/workitem-progress.test.ts tests/work-items.test.ts tests/assistant.test.ts tests/lifecycle-integration.test.ts tests/lifecycle-runtime.test.ts tests/lifecycle-process.test.ts tests/semantic-workflow.test.ts`：68 项通过，含真实 SIGKILL 子进程恢复；模型边界是替身。
- `pnpm test`：175 项通过、0 失败/跳过。此后仅调整前端样式/入口和浏览器用例，未改变后端业务行为。
- `pnpm typecheck:app`、`pnpm build`、`git diff --check` 通过。构建保留既有大 chunk 提示，不因此扩展成拆包任务。
- 最终修改的 15 个 TS/TSX/CSS 源码与测试文件定向 Prettier 检查通过；全局 `pnpm format:check:app` 仍报告 12 个既有文件问题。逐文件与实施前 `a59408c` 比较完全相同，未为了格式检查改动无关业务：`src/client/core/api.ts`、`features/assistant/Assistant.tsx`、`features/canvas/WorkflowCanvas.tsx`、`features/inspector/expression-model.ts`、`features/results/Results.tsx`、`features/workspace/InvokeDialog.tsx`、`src/server/assistant/pi.ts`、`profile-flow.ts`、`flow/contracts.ts`、`tests/browser/canvas-layout.spec.ts`、`tests/invoke.test.ts`、`tests/profile-import.test.ts`。

## 浏览器与侧栏用户反馈

`pnpm test:browser tests/browser/workitem-progress.spec.ts` 使用当前构建、每用例临时数据目录和私有 HTTP 端口；不向 4320/4321 的用户服务写夹具。真实 HTTP/文件/runtime 与明确的模型替身分别计证据。

主流程覆盖：十项精确分布、所有汇总筛选、搜索零匹配不改变全局数、稳定轮询与分页；单项无运行/并行活动/报告/业务阻碍/真实等待/实际错误；本地条件编辑保留、显式结项、重开、来源标签及新一轮提示。边界覆盖加载不冒充 0、空列表、读取失败保留旧内容并恢复、筛选失败不把旧行标作新筛选结果。

用户在本次实施中指出已打开流水线呈白色边框/过亮文字。复现发现本次业务 CSS 在全局声明前注册 components 层，base 层随后覆盖组件；前述工作项空侧栏截图没有覆盖这个情境。`05e8cb3` 将 main.tsx 的全局样式导入提前，修复层次根因；不增加高优先级补丁。`cc2c3d3` 按后续字体偏薄反馈将流水线名称设为中等字重 500。

实际开发页面以已有流水线只读检查两尺寸：侧栏宽度 216/192px，普通条目 12px/中等字重/灰色/无边框，选中项柔和背景，长标题省略、无横向溢出。关闭符号恢复为低调小图标，关闭仍只移除浏览器入口，不删除流水线。非空侧栏私有浏览器用例另实际验证切换、关闭、相邻选择、刷新保留及方法内容不变。

最终验证：全局层次修复后的构建 `index-DzCjNhXq.js` 下 6 项浏览器用例通过（56.9 秒）；仅字重调整后构建 `index-BNYHFY3H.js` / `index-BsICHAhb.css` 下定向 2 项侧栏复验通过（10.5 秒），断言字重 500、字号 12px、无边框及打开/切换/关闭/刷新语义。浏览器测试提交 `591164c`；最终两尺寸非空侧栏截图为 [1440](artifacts/sidebar-opened-1440.png) / [1024](artifacts/sidebar-opened-1024.png)，已实际打开检查。

代表截图（均已实际打开检查，不将截图存在等同于用户接受）：

- [总览 1024](artifacts/overview-1024.png)、[总览 1440](artifacts/overview-1440.png)
- [报告与实际执行 1024](artifacts/live-report-1024.png)、[报告与实际执行 1440](artifacts/live-report-1440.png)
- [真实等待 1024](artifacts/waiting-1024.png)、[重开 1024](artifacts/reopened-1024.png)
- [筛选读取失败 1024](artifacts/filter-read-error-1024.png)
- [侧栏修复前](artifacts/sidebar-dev-1024.png)、[侧栏中等字重 1024](artifacts/sidebar-weight500-selected-1024.png)、[侧栏中等字重 1440](artifacts/sidebar-weight500-items-1440.png)

## 适用边界

- 一次真实模型成功报告不保证所有模型/任务必然报告，报告准确性也不能只由工具成功证明；页面明确标注报告来源，业务完成仍靠条件与依据确认。
- 运行与报告沿用单进程、本地文件及既有中断边界；不宣称跨远端外部动作恰好一次。
- 全局格式检查的 12 个未改文件问题保留如上；最终用户视觉判断未代为确认。
