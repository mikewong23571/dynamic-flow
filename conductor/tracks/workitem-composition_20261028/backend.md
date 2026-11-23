# Backend 进展

代码仅在 `/home/mike/projs/fork/dynamic-flow-workitem-composition`。原目录仅更新本交接日志。

## 当前实现

- `work-items/composition.ts` 复用 Work 存私有流程，以 ownerItemId/compositionWorkId 明确归属；方法目录过滤私有 Work。手工页和工作项 Assistant 共用保存、检查、运行、交付和接续入口。
- `GET /api/items/:id/workspace` 只读；`POST .../workspace/actions` 支持 init、checkFlow、saveFlow、run、stop/resume、assistant/stopAssistant、publish、continue、addInput/reviseInput、saveMethod。上传使用 `POST /api/items/:id/uploads?name=...` 二进制 body。
- 首条 HTTP 纵向链已通过：无方法建项→私有流程→保存与旧修订拒绝→正式运行实际原文→运行成功仍未结项。
- table/report 视图绑定明确正式完整成功运行；表格仅顶层字段、非空唯一字符串ID；交付按output替换，多output保留固定来源。记录接续重读真实产物并保存received输入，选择公用单输入方法时生成固定call组合；不自动启动。
- 页内工作项Assistant使用既有Pi和模型选择，持久会话目录独立于方法作者；消息真实保存。工具失败throw结构化错误，让Pi活动标failed。上下文为预览/当前图/运行摘要，read_artifact分段读真实材料或精确产物，inspect_run分页。
- 文本/CSV/JSON保留原文，PDF/DOCX/XLSX复用已装解析库机械提取；未知格式/解析失败明确存缺口，原文件保留。尚需格式真实样本专项验证。
- call子Run不被reconcile当独立业务推进；reportProgress沿parentCall验证根运行关联。

## 已运行验证

- 新测试 `tests/workitem-composition-backend.test.ts` 首轮3项通过：私有隔离/修订/真实输入、两交付/来源选择/重开、Pi工具fixture目录发现/真实保存/消息重开。fixture不代表真实模型。
- `pnpm typecheck:app` 已通过一次（2026-10-28，三模块仍在持续更新）。
- 扩展 lifecycle/progress 回归初次受宿主残缺Sourcegraph配置影响，正在以仅测试进程unset两项相关env重跑，不改真实配置。

真实模型、完整浏览器、CVE业务质量尚未由本日志宣称完成；根任务另验。

## 当前检查追加

- 新增附件与结构化输入修订、选中记录调用公用固定版本方法两条测试；新测试5项通过，后者检查仅q-a这一实际记录进入callee，旧交付可读，子Run不增加业务推进关联。
- 限定测试进程排除残缺Sourcegraph环境后，composition+lifecycle-integration+workitem-progress共29项通过（当时新测试3项）；后增2项已独立通过。
- 保存前接入runtime的validateCallReferences，模型/页面check取得同一跨方法端口与递归诊断。工具写回执收敛为真实revision/版本/运行摘要，避免把所有Run正文重复灌进上下文。

## 最新边界修复与验证

- 原始输入支持 `selectInputs` / `select_inputs` 直接绑定材料；Assistant的add_input必须带materialIds，服务端重读材料后保留到received及冻结Run。人工表单仍可独立补充新值。修订输入保留source/materials，多输入流程接续只替换选中端口。
- Assistant增加stop_execution/resume_execution/signal_execution，同现有根运行入口并检查runId/revision；inspect_run可指定workId读取nested call，沿parentCall验证关联根运行，分页投影，不灌入原始input大对象。
- criteria/complete/reopen/addEvidence新增可选expectedRevision（业务串行入口检查）；workspace路由接受baseRevision。旧items/actions保持兼容并接受同一guard。
- 真实模型第二轮暴露持久会话symlink EEXIST。已以linkSessionFile修复：同源链接幂等复用，普通文件/异源链接冲突明确报错且不覆盖。新实际临时文件用例验证此边界。
- 方法目录outputContracts按实际逐条端口值推导：flatMap/expanded集合取items，call按命名端口items，wait.event未知；不把整批schema误报成条目schema。
- 最后定向验证：`env -u SOURCEGRAPH_MCP_URL -u SOURCEGRAPH_AUTH_HEADER pnpm exec tsx --test tests/assistant-session-files.test.ts tests/workitem-composition-backend.test.ts tests/assistant.test.ts tests/lifecycle-integration.test.ts tests/workitem-progress.test.ts`，61项全部通过。
- 随后`pnpm typecheck:app`通过。测试命令前一次typecheck曾指出inspect_run误拼r.inputs，已修为真实字段r.input；不把失败旧输出算作通过。
- 真实模型首轮由root验得目录发现/原文读取/固定call+groupBy与两份交付；CVE判断质量及完整页面仍看root/browser证据。本模块不将fixture或无模型文件测试当成真实模型验收。

- 独立审查要求的inspect_run子运行读取及逐条outputContracts已完成。新增HTTP目录反例覆盖flatMap/groupBy/wait.output与独立wait.event未知合同；当前backend6项+symlink1项合计7项通过（新测试不含模型）。后端基线冻结，不为临时UI形状新增数据合同；后续仅修真实联测明确暴露的闭环问题。
