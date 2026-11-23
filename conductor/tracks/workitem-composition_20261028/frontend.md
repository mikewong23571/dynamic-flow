# 前端实施记录

2026-10-28。实施工作区 `/home/mike/projs/fork/dynamic-flow-workitem-composition`；原目录仅更新本日志。未提交、未 push；不触碰托管 4320/4321、服务或真实数据。

## 当前增量

- 四主 Tab（成果／流程／输入／记录）和可收起页内 Assistant，连接真实 workspace API。
- 流程页复用 React Flow、NodeInspector；新增固定版本 call 配置、已有方法选择、groupBy 字段配置；画布与 Assistant 仍保存同一 Definition。
- 成果使用精确依赖 `@json-render/core` / `@json-render/react` 0.21.3 的 Renderer、普通 registry 与受控 store；正式业务数据只读，选择与草稿独立；table/report 声明确定性编译，不存另一套任意 spec。
- 表格搜索、排序、分页、稳定记录 ID 选择、来源与详情、选择记录后准备后续方法；发布多份具名交付使用同一成果 Tab 内切换。
- 原始文件上传、文字补充、按真实输入合同生成结构化补输入／修订表单；完成条件与显式结项可达。
- `vite.composition.config.ts` 独立前端 4330→后端 4331；`playwright.composition.config.ts` 无 webServer，不连接默认托管端口。新浏览器测试自己创建临时 dataRoot 与随机端口 HTTP/runtime。

## 已执行

- 官方 npm registry 核实并安装精确 0.21.3；本机默认镜像滞后曾报找不到版本，未静默降级。
- 正式类型检查已通过一次；隔离工作区构建通过，保留现有大 bundle 提示。
- 正在运行两尺寸私有浏览器路线。当前尚不宣称浏览器或模型验收通过。

## 边界

本轮只开放 table/report 两种持久展示声明；详情、选择、补材料和后续动作是通用固定控件，表单来自明确 inputContract，不宣称任意页面 DSL。浏览器模型输出将使用明确 fixture，真实模型验收另由 root 记录。
