# Component integration spike

历史范围（2026-09-20）：当前产品已调整为 [画布 + JS 子集 IR + runtime](../../docs/design.md)。本例的树／代码编辑器及比较演示保留为接入证据，尚未实现新的 IR 编辑执行闭环；本例视觉已被用户否定，不作为正式界面模板。

一个可运行的选型实验，不是正式 Workbench。详细结论见 [track 结果](../../conductor/tracks/component-integration-spike_20260919/results.md)。

## 运行

在仓库根目录执行。实测环境：Node 24.14.0、pnpm 10.32.1、macOS；Pi 包要求 Node >=22.19。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开 http://127.0.0.1:4317 。API 在 4318。无需模型 Key；使用 Pi SDK 自带 faux provider，工具实际由 AgentSession 执行。

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm format:check
pnpm exec playwright install chromium
pnpm test:browser
```

浏览器测试会启动开发服务，或复用已经运行的 4317 服务；需确保对应 API 同时运行。`pnpm preview` 在 4319 查看构建产物，Chat 仍需 4318 API。

## 试用路径

1. 工作区：多选 s1/s3，按置信度排序、筛选 feature，恢复筛选，检查选择仍在。点击反馈标题打开 Inspector，与勾选样本分开。
2. 切换树/图、点击节点、拖动分栏。树控件默认方向键移动焦点、空格选择；Enter 默认是重命名语义，本例关闭了重命名。
3. Method：编辑 TypeScript，切换代码 Diff，运行 fixture 比较；“采用候选 Method”和“保留示例产物”独立。编辑后旧比较变为过期。
4. Assistant：发送消息，展开工具详情；生成期间切回工作区改选样本，再返回，当前请求仍使用发送时的样本；停止按钮会调用 Pi abort。

## 代码入口

| 文件 | 职责 |
| --- | --- |
| src/main.tsx | 页面与共享选择状态 |
| src/work-map.tsx | Arborist / React Flow 两个小样例 |
| src/sample-table.tsx | TanStack v9 排序、多选；React 筛选 |
| src/code-lab.tsx | Monaco 本地 worker、编辑、Diff、比较状态 |
| src/chat.tsx、src/bridge.ts | assistant-ui ExternalStoreRuntime 与事件映射 |
| pi-session.ts | 真实 Pi AgentSession + 确定性 faux provider + 样本工具 |
| server.ts | Hono SSE、取消及运行清理 |
| src/components/ui | shadcn CLI 生成的基础控件 |
| browser.spec.ts | 真实 Chromium 操作与截图 |
| evidence/ | 检查输出、截图、安装版本 |

## 边界

- 6 条内存样本，工作图和比较结果固定；编辑后的 Method 不执行。样本未选时，Pi 工具示例默认读取 s3。
- 对话记录仅保存在当前页面；每次发送创建新的 Pi 会话，未验证跨轮上下文、刷新恢复或线程分支。
- Method 采用与产物保留仅改变本页状态，没有版本存储和真正的产物写入。
- 本轮验证桌面 Chromium，未做移动端、其他浏览器、真实模型与大规模数据测试。
- 本例为并排比较安装了树和图等候选；不意味着正式产品应该全部保留。
