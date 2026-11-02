# 前端样式与组件层次治理

状态：深入审查与建档完成，实施待开始。2026-11-02 用户认可系统治理方向，并要求先深入审查、再新建 track；本轮不修改产品源码或部署。问题与证据见 [audit.md](audit.md)，目标方案见 [design.md](design.md)。

## 目标

沿用当前 Geist 暗色、shadcn/Radix、React Flow、assistant-ui 和 OpenUI，使同类组件在不同页面和组合层次下具有可解释且一致的外观；主要动作在两个桌面尺寸和窗口变化后可达。

| 验收项 | 可验证结果 | 对应问题 |
| --- | --- | --- |
| SG01 样式所有权 | token、基础控件、共享组合、业务适配、页面骨架各有明确入口；业务组件不通过全局后代选择器重写基础控件内部外观 | F02、F04 |
| SG02 可预测层叠 | 正式入口受控的共享和业务 CSS 全部处于声明层；第三方覆盖有明确作用域；局部声明及工具类按合同生效 | F02 |
| SG03 一套控件语义 | 正式应用 Button 使用一套公开 API；同尺寸单行输入、选择器、按钮按统一尺度呈现，差异由明确参数表达 | F03、F04 |
| SG04 组合间距 | 父容器管理直接子项的外部间距；Field 管理标签/控件/帮助/错误，动作区管理按钮排列；OpenUI 嵌套和弹窗不继承额外页面 margin | F02、F03 |
| SG05 两尺寸可达 | 1440×900、1024×768 冷打开、1440→1024→1440、已保存宽度、手动展开/收起后，主要动作可命中且内容可滚动 | F01 |
| SG06 弹窗交接 | Escape、关闭或成功提交后，焦点返回仍存在的触发动作；触发动作失效时返回所属任务的合理锚点；后台页面不泄漏 Portal | F06 |
| SG07 语义 token | 重复的颜色、文字、控件高度、间距、圆角、阴影使用有限语义尺度；保留画布几何和运行时尺寸；成功状态不依赖未定义变量回退 | F05 |
| SG08 全模块收敛 | 所有正式可达样式与控件入口均有迁移或保留说明；原生 checkbox/file、业务导航、第三方控件不机械套 Button/Input | F03、F08 |
| SG09 防回归 | 复用 Playwright 验证关键状态和代表页面；包含命中/焦点/间距和稳定区域视觉比较；最小静态检查防止退役入口和无归属覆盖重新出现 | F07 |
| SG10 行为保持 | 导航、草稿、会话、选择、固定 Run、材料/来源、保存失败和版本冲突保持；报告实际验证层次及未测边界 | 全部 |

## 非目标

- 不引入新 UI 库、通用页面 DSL、主题编辑器、设计系统框架、Storybook 平台或新业务导航。
- 不更改 Work / WorkItem / Run / Definition、OpenUI 程序和 Query/Mutation 业务合同，不替模型编排业务页面。
- 不进行品牌重设计、浅色主题或移动端适配；保留暗色方向和 14px 根字号，避免隐式改变整个 rem 尺度。
- 不按 CSS 行数、组件数量或硬编码出现次数验收；不禁止所有 px、原生标签、内联动态样式。
- 不清理用户数据，不操作托管 4320/4321 或重启 flowcraft.service；发布需另有用户明确指示。
- 不把审查脚本通过、历史 track 勾选或 fixture 界面等同于修复成功、真实模型或用户视觉接受。

## 改动点

本仓 dynamic-flow 为唯一代码范围；沿用单仓工作流，无外部仓库或多仓母仓。本轮实际仅写本 track 与两个 Conductor 索引，以下为后续实施预期范围。

| 仓库 id | 模块 / 路径 | 改动说明 |
| --- | --- | --- |
| dynamic-flow（宿主仓） | src/client/styles.css、main.tsx、index.html | token、reset、层顺序、暗色策略；按拥有者迁移规则，维持入口顺序 |
| dynamic-flow | src/client/components/ui/、components/ui.tsx | 控件尺寸/状态与单一 Button API；包装层布局接口；保留业务 Badge 和 Modal 的合理职责 |
| dynamic-flow | components/WorkspaceFrame.*、Management.*、MaterialCard.*、MaterialDialog.* | 共享结构、响应式、字段/动作区组合、浮层焦点与材料阅读 |
| dynamic-flow | app/、features/workspace/、features/settings/ | 方法工作区、列表入口、创建/调用/试运行与设置表单 |
| dynamic-flow | features/openui/、features/work-items/ | 原生组合、InputFields、RecordTable、任务表单、Assistant 停靠和条件/子项弹窗 |
| dynamic-flow | features/inspector/、canvas/、assistant/、results/ | 保留专用呈现，收敛公共控件和重复外观；限定第三方适配 |
| dynamic-flow | tests/browser/、package.json（必要时最小检查脚本） | 关键失败路径、控件矩阵、视觉基线和规则检查，不新增镜像实现测试 |
| dynamic-flow | client AGENTS、ui README、DESIGN-NOTES、tests AGENTS、product-guidelines | 更新当前规则及实际命令，历史证据保留在原 track |

## 影响域

最小输入、输出、错误与具体例子：

| 对象 | 输入 | 输出 / 行为 | 错误与具体例子 |
| --- | --- | --- | --- |
| 基础控件 | 值/事件、明确尺寸/variant、disabled、aria-invalid、布局选项 | 按 token 呈现，透传原生属性、ref、事件与键盘语义 | 错误仍属于任务；迁移不能改坏 number、IME、输入草稿或文件上传 |
| 字段/动作区 | label/control/help/error、children、密度与对齐 | 内部 spacing 稳定，外部 spacing 由父容器决定 | InputFields 的文本/enum/boolean 遵守同列宽度合同；错误后保留输入 |
| 工作区骨架 | 可用窗口、展开偏好、已保存宽度、内容 | 宽屏并排，窄桌面停靠或明确临时检查；动作可达 | 1440 缩至 1024，“保存输入”命中自身，不能命中 Assistant 发送按钮 |
| 任务弹窗 | open、关闭原因、触发元素/后备锚点 | 内容可滚动、操作可达、关闭后交还焦点 | 第二项“补充说明”打开后 Escape 回到同一项动作；失败时保留草稿 |

回归覆盖共享控件调用者及相邻真实路线：列表/菜单、材料/来源、两种工作区、OpenUI 表格/表单/嵌套组合、固定运行检查、Assistant 和模型选择器。业务状态、版本、选择、来源及执行合同保持原边界。回归文件与次序见 [plan.md](plan.md)。

无用户登记的阻塞依赖。overall-design-workitem-openui_20261030 为当前工作面上下文；ui-design-consistency_20261022 提供历史取舍。实施前重读并协调同时修改的 OpenUI 文件，不改旧 track 状态或绑定。
