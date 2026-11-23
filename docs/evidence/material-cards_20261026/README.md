# 材料卡片与历史归组（2026-10-26）

原界面以M01～MN作为材料名称，结构化材料又直接截取JSON首行；历史轮次直接铺开全部编号。用户无法判断材料是什么，也难以区分输入选择与历史变更。

本轮复用现有材料正文，前端提取已有标题、label/name、repository/ref或正文首行，不增加持久模型、名称编辑API或材料迁移。统一MaterialCard展示名称、实际摘要、次要引用编号与查看入口；摘要不推断重要性或证据是否成立。宽区域多列、窄对话框单列；正文继续延迟渲染，JSON复用ArtifactValue。材料库、两类输入选择、子项带入、报告引用和运行来源共用展示；历史先显示数量，展开后再创建卡片。运行来源沿用冻结材料，正文及业务引用不变。

## 已验证

隔离副本 `/tmp/flowcraft-material-cards-OFGQEm`，构建正式前端，临时数据与私有随机端口HTTP。方法工作台测试另起4331独立后端；未连接托管实例作测试，未改用户数据或重启托管服务。Agent/作者边界均为明确fixture，无真实模型质量验收。

- `pnpm typecheck:app`、`pnpm build`通过；保留现存bundle大小提示。
- `tests/material-presentation.test.ts`：1 passed，文本、仓库/ref、结果label、数组、空文本与无效JSON回退，原文不变。
- `material-cards`、`cve-fanout`、`workitem-report --grep 阻碍`、`workitem-workspace --grep 跨方法成果`：8 passed，两尺寸验证卡片标题/摘要、24份旧材料、正文延迟创建、历史23项归组、真实选择与引用、精确实例来源和键盘返回。
- 响应式多列布局及最终源码构建后：`material-cards` 2 passed；`work-journey` 的1A/1B/2共4 passed；`workitem-decomposition`中6项通过。拆分意图生成用例在清除测试进程继承的半份Sourcegraph配置后另验1 passed，分治共7项通过。
- 独立4331：`same-work-reopen.spec.ts` 1 passed；方法材料选择、草稿与重开保留。
- 1440×900和1024×768截图已实际查看。浏览器为Chromium，Firefox/Safari未测。

## 扩大回归的未通过项

- `workspace.spec.ts`两尺寸通过材料选择、运行及真实API完成断言后，在旧`.results-toolbar`定位失败；当前界面已经是运行总览。曾尝试适配当前查看过程路径，后续布局断言仍要求已隐藏的ContextPanel。最终交付仅更新该用例的材料卡片选择器，不扩展重写整条旧结果页测试。
- `work-journey.spec.ts`完整路线两尺寸在选择比较候选成果`candidateF1`时等待超时。页面只加载了正式运行的历史成果；本次未修改相关快照加载或过滤逻辑。此前首次失败为测试副本没有.env.local而进程继承半份Sourcegraph配置；清除该测试进程的SOURCEGRAPH_MCP_URL/SOURCEGRAPH_AUTH_HEADER后，生成阶段通过，随后遇到上述候选成果问题。没有清空或修改实际连接配置。
- 新卡片替换旧DOM后，1A最初仍查找`.prepare-material-text`，已改为实际卡片展开正文并保留正文/延迟渲染断言，复验通过。

扩大回归不是全绿；上述失败不作为本次材料交互验收通过。失败页面证据保存在本目录`regression-failures/`。

[材料页1440](materials-1440.png) / [材料页1024](materials-1024.png)。

[历史1440](history-1440.png) / [历史1024](history-1024.png)。

[输入选择1440](prepare-1440.png) / [输入选择1024](prepare-1024.png)。
