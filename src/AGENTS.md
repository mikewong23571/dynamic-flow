# 应用源码约定

继承根 AGENTS.md。这里是正式实现；`spike/` 和 `examples/component-spike/` 均不属于当前产品入口。

## 源码边界

| 目录 | 职责 | 指南 |
| --- | --- | --- |
| `client/` | 页面组装、编辑状态、业务组件和控件；HTTP/SSE 消费方 | [前端模块地图](client/AGENTS.md) |
| `server/` | 单进程 HTTP/SSE、业务模块组装、执行与保存 | [服务调用地图](server/AGENTS.md) |
| `shared/` | 共用记录、表达式联合类型与端口纯函数 | [共享合同](shared/AGENTS.md) |

客户端入口 `client/main.tsx` → `client/app/App.tsx`，状态组合根 `client/app/controller.ts`。后端入口 `server/index.ts` 的 `createApplication` 组装 work、work-items、flow、runs、assistant、trials、files。共享记录从 `shared/records.ts` 开始查。

前端不 import 后端执行代码；shared 不 import client/server。后端各模块直接调用，模型执行和里程碑回调由入口传给 runs。方法保存集中在 files，工作项文件在 work-items，模型配置文件在 assistant/settings；不要误把 files 当作全部 IO 的统一仓库。

## 修改约定

- 先明确本次故事、输入、输出、错误和具体例子，读就近 AGENTS、调用双方及对应测试，再修改。
- 类型/端口/状态含义变化时，同步生产者、消费者和保存/重开路径；TypeScript 相容不证明业务含义一致。
- 保持 Work、WorkItem、Run、Definition 与 ViewState 的边界；详细规则见根指南和对应模块，不另造同义业务状态。
- 合理使用函数参数、纯函数与职责拆分；不预建通用基类、依赖注入框架、命令总线、插件平台或多包架构。
- 先接通真实纵向路径，再扩展能力。模块边界可根据具体反例调整，不为保留原骨架削弱用户故事或硬编码模型结果。
- 页面渲染、类型检查、fixture、真实模型与用户验收分别提供证据；UI 修改需要实际操作和截图。

验证命令、测试映射与数据边界见 [tests/AGENTS.md](../tests/AGENTS.md)。实现/验收状态见 [track 注册表](../conductor/tracks.md) 中对应任务，历史通过记录不能代替当前验证。移动入口或改变交接时更新就近 AGENTS，避免下一位 agent 按旧路径工作。
