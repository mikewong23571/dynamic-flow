# Dynamic Workflow Workbench

登记持续推进的业务工作项，选择可编辑的工作流方法；通过执行取得证据、记录里程碑、等待事件或到期，再按完成条件结项。用画布和 Pi 对话修改方法，用小样本比较做法，旧证据和运行历史持续保留。

正式源码在 `src/`，当前正进行 [工作项生命周期实施与验收](conductor/tracks/workitem-lifecycle_20260920/index.md)。模块测试、真实模型、浏览器体验分别记录在 [验收证据](conductor/tracks/workitem-lifecycle_20260920/evidence.md)。`spike/` 是历史伪代码，`examples/component-spike/` 是历史组件实验。

## 启动

需要 Node 22.19+ 和 pnpm 10。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开 http://127.0.0.1:4320 。前端为 Vite，后端为 http://127.0.0.1:4321 。方法工作区保存到 `data/<workId>/work.json`，不可变定义在同目录 `definitions/`；业务工作项独立保存在 `data/work-items/<id>.json`。运行中的等待与截止持久化，后端重启后恢复等待/已到期任务；外部调用中断需显式继续，已成功实例不重复执行。不恢复任意函数栈，也不承诺不确定外部调用恰好一次。

模型可在侧栏“模型设置”中填写。尚未保存工作台配置时，后端以根目录 `.env.local` 和进程环境变量作为初始配置（同名进程变量优先）：

```dotenv
LLM_PROTOCOL=anthropic-messages
LLM_BASE_URL=https://open.bigmodel.cn/api/anthropic
LLM_MODEL=你的模型名
LLM_API_KEY=你的密钥
```

也支持 `openai-chat-completions` 和 `openai-responses`；同步填写兼容该协议的 Base URL。界面可设置协议、服务地址、模型、API Key、推理强度、Temperature、Top P 与上下文窗口；可用档位和参数限制按后端反馈显示。保存只验证配置格式，不代表模型端点已连通。

界面保存到 `data/model-settings.json`，后续请求优先使用这份配置；不改写 `.env.local`。API Key 留空沿用现有密钥，读取配置不会回显密钥；密钥不写入工作文件。缺配置或模型调用失败会明确报错，不会自动切换假模型。

“所有工作”提供搜索、分页、标题修改、归档与恢复；标题与完整目标分开保存。Assistant 可以生成简短标题，但不会覆盖用户手动改过的标题。归档保留工作定义、材料与历史结果。

## 工作项与外部观察

侧栏“工作项”登记业务编号、目标、完成条件和自身证据，再选择处理方法。详情可以推进、补证据、发送匹配事件、停止/恢复、切换方法、按依据结项与重开。一个工作项可有多次运行，也可用新方法继续；Run 成功结束不自动完成业务目标。

现有“所有工作”是方法工作库入口，保持旧名称兼容已有工作。方法样例材料与工作项证据互不混用。IR 支持显式 Wait/Milestone、Map/FlatMap/Aggregate、有限并发和单次输入/输出 Ajv 校验；严格 Reduce/Filter 和完整端口类型推导尚未实现。

外部程序使用同一 HTTP 状态，不需要解析聊天或抓取画布：

| 接口                            | 用途                                                  |
| ------------------------------- | ----------------------------------------------------- |
| `GET /api/items?query=&status=` | 按业务编号/标题等搜索、状态筛选；查询无执行副作用     |
| `GET /api/items/:id`            | 读取阶段、摘要、条件、历史和关联运行/等待             |
| `POST /api/items`               | 创建独立工作项                                        |
| `POST /api/items/:id/actions`   | 显式运行、提交事件、补证据、保存条件、结项/重开等动作 |

事件包含唯一 `id`、`name` 和可选 `payload`；只有匹配待定等待才继续原 Run，相同消息重复提交不会重复推进。参数和返回类型详见 [模块/HTTP 交接](conductor/tracks/workitem-lifecycle_20260920/handoff.md)。这是单进程原型接口，不扩展认证、权限或分布式投递平台。

生命周期验收依据 [H1–H11 / L1–L5](docs/workitem-stories.md)，真实进程、模型与浏览器结果见 track；存在实现不等于全部验收通过。

## 检查

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm test:browser
pnpm format:check
```

`pnpm build` 输出 `dist/`；`pnpm dev:api` 同时可提供已构建文件（打开 4321）。历史实验使用 `pnpm spike:dev`、`pnpm spike:test` 等前缀命令，不能代表新应用验收。

## 开发入口

| 位置                     | 职责                                                                     |
| ------------------------ | ------------------------------------------------------------------------ |
| `src/client/`            | 工作项管理、方法库与工作区；画布、配置、结果、比较、Assistant 和模型设置 |
| `src/server/index.ts`    | HTTP 操作、SSE 完整快照与实际模块接线                                    |
| `src/server/work/`       | 工作列表、标题与归档；材料、保留与续做输入预览                           |
| `src/server/work-items/` | 独立业务身份、证据、条件依据、里程碑和跨方法历史                         |
| `src/server/flow/`       | 草稿、候选起点、校验、布局、采用                                         |
| `src/server/runs/`       | 固定版本与输入、有限并发、等待/事件、检查点恢复、停止和重试              |
| `src/server/assistant/`  | Pi 会话、模型设置与协议映射、工具和输出检查                              |
| `src/server/trials/`     | 同样本顺序比较与整体停止                                                 |
| `src/server/files/`      | 真实文件保存、不可变定义和重启恢复                                       |
| `src/shared/records.ts`  | 上述调用双方共享的少量记录                                               |

改代码先读根与就近 `AGENTS.md`，再按 [生命周期故事](docs/workitem-stories.md)、[原有用户故事](docs/user-stories.md)、[模块与验收地图](docs/implementation-map.md) 找到子问题。术语见 [术语与编号](docs/glossary.md)，产品规则见 [当前设计](docs/design.md)。原始 v2 保持在 `docs/archive/`。
