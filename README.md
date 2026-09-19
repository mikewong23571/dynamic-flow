# Dynamic Workflow Workbench

用目标和材料创建工作，由 Pi 生成流程；在画布和对话中修改，用小样本比较做法，独立采用定义、保留结果，再生成可追溯报告。

正式源码在 `src/`，当前正进行 [整个应用实施与验收](conductor/tracks/full-application_20260920/index.md)。模块测试、真实模型、浏览器体验分别记录在 [验收证据](conductor/tracks/full-application_20260920/evidence.md)。`spike/` 是历史伪代码，`examples/component-spike/` 是历史组件实验。

## 启动

需要 Node 22.19+ 和 pnpm 10。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开 http://127.0.0.1:4320 。前端为 Vite，后端为 http://127.0.0.1:4321 。工作自动保存到 `data/<workId>/work.json`，不可变定义在同目录 `definitions/`。停止后端后重新启动，未完成运行如实标记“已中断”；不会自动重跑。

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

| 位置                    | 职责                                                         |
| ----------------------- | ------------------------------------------------------------ |
| `src/client/`           | 工作库与工作区；画布、配置、结果、比较、Assistant 和模型设置 |
| `src/server/index.ts`   | HTTP 操作、SSE 完整快照与实际模块接线                        |
| `src/server/work/`      | 工作列表、标题与归档；材料、保留与续做输入预览               |
| `src/server/flow/`      | 草稿、候选起点、校验、布局、采用                             |
| `src/server/runs/`      | 固定版本与输入、有限节点执行、停止和重试                     |
| `src/server/assistant/` | Pi 会话、模型设置与协议映射、工具和输出检查                  |
| `src/server/trials/`    | 同样本顺序比较与整体停止                                     |
| `src/server/files/`     | 真实文件保存、不可变定义和重启恢复                           |
| `src/shared/records.ts` | 上述调用双方共享的少量记录                                   |

改代码先读根与就近 `AGENTS.md`，再按 [用户故事](docs/user-stories.md)、[模块与验收地图](docs/implementation-map.md) 找到子问题。术语见 [术语与编号](docs/glossary.md)，产品规则见 [当前设计](docs/design.md)。原始 v2 保持在 `docs/archive/`。
