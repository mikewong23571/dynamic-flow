# 多路输出组合验收

2026-09-20，正式 src/，结论：本轮 C1–C4 通过。没有将 spike、模型文字回复或单元测试代替产品联测。

## 交付与证据

| 故事 | 已验证行为 | 证据 |
| --- | --- | --- |
| 多路汇合 C1 | 三路以上按声明顺序拼接，空路、异步乱序、失败阻断、旧 merge 保持原行为 | tests/multi-input.test.ts；真实模型六节点运行 |
| 具名收集 C2 | 每路始终数组，空路为空数组；输出一项对象可由下游表达式解构 | 同上；browser 三源连接 collect 真运行 |
| 按键关联 C3 | inner/left/right/full，重复全配对/报错，严格键类型、坏路径与缺键错误、Schema、贡献来源 | 后端 11 项新增测试；真实 full join 返回4行 |
| 修改与复用 C4 | 动态端口增删改名同步连接及顶层Schema、两尺寸配置运行重开、节点试验/重试/同输入比较、作者工具 | tests/multi-input-client.test.ts、multi-input-author.test.ts、browser/multi-input.spec.ts；真实 Pi 作者 |

最终命令：`pnpm test` **101/101**；`pnpm test:browser` **12/12**（27.9s）；`pnpm typecheck`、`pnpm build`、`pnpm format:check` 均通过。构建仍有既有主包大于500KB提示，主JS约1.085MB / gzip333KB；本轮未做打包拆分。

前后端子任务分别通过域内测试，再由主任务运行完整回归。浏览器包含原有工作项等待/事件/结项重开、管理分页、函数式编辑、原有工作区路线，不仅新控件。

## 真实模型与界面

模型使用用户已保存配置：glm-5.3-flash，anthropic-messages，reasoningEffort=max；未修改密钥或用户模型设置。记录 [live-author.json](artifacts/live-author.json)，复现脚本 [live-author.mjs](artifacts/live-author.mjs)。

模型首个 update_flow 把 edges 写成平铺数组，被工具形状校验拒绝；同一 Pi 会话收到错误后改为 from/to 对象并保存，最终 issues=[]。保留失败和修正记录，不声称一次无错。

工作区“多路结果组合示例”，workId=`7f46e68e-5263-4509-8951-b1505fbe1b13`，定义`57565e49-dc0e-4ee2-a251-c293f79406a8`。上游3个表达式输出固定合成调查/修复/验证记录，下游3个组合节点使用真实连接。运行实际输出：merge 6项；collect 1对象（3/2/1项数组）；full join 4行（A/A、B/null、A/A、null/C）。这是合成演示，不是真实漏洞结论。

主任务还在实际浏览器点“运行流程”，完整6实例完成，检查具名对象和左右缺配值；截图：[关联1440](artifacts/live-join-1440.png)、[收集1024](artifacts/live-collect-1024.png)。两尺寸自动操作截图在 [browser-editor](browser-editor/)；已实际查看。画布支持缩放及收起侧栏，窄屏下表单可滚动，没有把整张六节点图的缩略视图当成放大编辑体验。

## 验收发现并修正

- 端口改名只改连线会留下Schema旧字段：现同步具名Schema顶层 properties/required，collect输出同样；不自动重写下游表达式或任意嵌套Schema。
- 首轮浏览器反复超时并非组合逻辑失败。Vite日志确认 trace产生的HTML触发全页刷新，刷新又产生trace：watch忽略conductor/test-results/playwright-report/data后，完整12项稳定通过。早期字体网络归因不成立。
- 独立保留字体加载改善：Geist通过Fontsource随应用打包，移除Google Fonts在线CSS。无新增计算框架。
- 多路输入使结果标题反复显示同一材料号：标题及来源摘要去重，实际输入逐项来源保留。

## 范围与清理

Schema仍只做有限静态类型冲突判断，运行时Ajv是实际合同检查。重复键全配对可能扩展行数；UI明确提示。无时间窗口、模糊/流式无限关联，也未做大规模性能验收。

测试方法按唯一前缀归档；本轮工作项回归产生的两项及其方法移到 data/.acceptance-backup/multi-input_20260920/，保留manifest可恢复。真实合成组合示例保留可直接运行。未改动原有用户工作项及方法。
