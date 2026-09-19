# 验收证据

2026-09-20，本轮管理页整改与有限纯表达式实现完成。代码、替身测试、真实模型、浏览器与视觉观察分别如下；不把这些等同于用户对审美的最终认可。

## 已交付

| 故事 | 结果与证据 |
| --- | --- |
| M1 工作项阅读与维护 | 标题/编号、业务状态/阶段、执行/等待、最近业务进展分层；去除同义重复。分页、筛选、稳定轮询与搜索焦点通过。12项混合状态为明确的呈现 fixture，不是12项业务真实推进记录 |
| M2 流水线维护 | 统一“流水线”命名，未归档/已归档，定义状态与节点数真实派生；菜单承载重命名/归档恢复；真实 API 搜索、分页、维护、重开回归通过 |
| M3 统一控件 | 正式 src 接 shadcn/Radix，配置/alias/theme归位，旧Button/Modal薄适配。Tabs箭头、菜单Enter/Escape、焦点恢复通过；两尺寸截图检查；真实长列表分页遮挡问题已修复 |
| FP1 纯函数组合 | pipe/map/filter/flatMap/有初值顺序reduce；类型、空集合、输出顺序、来源、schema、失败阻断与旧定义兼容通过 |
| FP2 匹配与解构 | literal/type/object/array/bind/wildcard，嵌套、rest、guard、otherwise、let作用域；无匹配、缺路径、重复绑定、作用域泄漏、除零和错误类型反例通过 |
| FP3 人与Agent共同编辑 | 所有约定表达式/模式有结构化控件，节点显示组合摘要；两尺寸真实UI编辑→保存→运行→重开通过。真实模型保存match+pipe/filter/map/reduce并运行得到14 |

## 自动检查

最终根任务统一执行：

- `pnpm test`：83/83通过（包含新纯表达式11项、作者边界1项、客户端1项、流水线真实状态1项；保留原有生命周期等测试）。
- `pnpm typecheck`：正式源码和历史Spike通过。
- `pnpm test:browser`：10/10通过；函数式编辑2、管理呈现/键盘2、同工作重开1、流水线管理1、工作项生命周期2、原工作区编辑运行2。
- `pnpm build`、`pnpm format:check`、`git diff --check`：通过。

构建仍提示单个 JS chunk 超过500KB（本轮约1.08MB minified，331KB gzip）。未将消除该警告扩展为本轮架构任务。

## 真实模型与执行

[可复跑脚本](./artifacts/live-author.mjs) 通过当前 HTTP 服务和用户已配置模型运行；配置读取不回显密钥。模型为 glm-5.3-flash / Anthropic Messages / max，工具一次保存有效定义，无校验问题。

- 方法：`883825d9-54fb-4c58-adee-7fdb46779a0e`，标题“风险评分 · 组合示例”。
- 运行：`e2fd0327-36a4-43df-a50b-44e3e3da1b79`。
- 明确由HTTP提交结构化输入 high=3 / low=1 / high=4，经对象模式取分、filter>0、map×2、reduce+0，总分14，status=completed。该用例不冒称粘贴文本自动变结构化记录；输入 schema 不匹配仍会失败。
- [完整定义、作者工具活动和实际运行](./artifacts/live-author.json)。[实际画布与配置](./artifacts/live-expression-1440.png)。

浏览器人工配置用例从普通处理切换“数据变换”，设整批reduce、初值10、逐项加1；3条真实材料得到13，刷新保留表达式与运行结果。没有编辑JS/JSON。

## 视觉与交互

[管理页具体交付与反例](./management-evidence.md) 记录shadcn接入和12项呈现fixture边界。根任务另外在内置浏览器操作真实流水线页、键盘归档切换、真实模型画布及Inspector，并复核截图。

- [工作项 1440](./artifacts/management-items-1440.png) / [1024](./artifacts/management-items-1024.png)：12项呈现fixture。
- [流水线 1440](./artifacts/management-flows-1440.png) / [1024](./artifacts/management-flows-1024.png)：真实API库。
- [真实长列表 1024](./artifacts/long-list-1024.png)：表格独立滚动，分页不再覆盖条目；键盘ArrowRight/Left实际切换。

检查中发现并修复：定义状态empty类撞旧空状态样式、原生控件specificity覆盖、Dialog双重平移、长列表footer重叠，以及表达式CSS引用未定义token。最后一项改为现有line/ink/muted后在1440/1024再次实际检查，面板无横向溢出。

## 数据与边界

本轮早期管理fixture与函数式编辑fixture经正常归档动作清理。根验收的4个一次性生命周期工作项及关联方法移入 `data/.acceptance-backup/functional-ir-management_20260920/`，附manifest可恢复；没有删除用户材料。真实模型示例保留其定义与运行用于检查。

纯表达式没有任意JS、递归、闭包/函数值、自动并行reduce或完整类型推导；and/or为急切求值，条件性计算用match。限制64层、2000语法/字面值项、100000求值步，超限明确失败。aggregate保守保留全次输入来源，不声称内部filter后逐字段来源推导。图级operation与值数组组合的区别见 [语义文档](../../../docs/functional-ir.md)。

工作项当前客户端分页，服务端仍返回筛选后的列表；不是大规模服务端分页。管理页和新表达式控件已统一，但尚未将整个工作区每一个原生表单迁移到shadcn。跨端点表达式作者能力本轮仅实测当前配置；其它协议仍有既有回归，未将它们冒称本轮全部真实调用通过。
