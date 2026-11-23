# 清洗产物目录导致 EISDIR

当前业务影响 Run `c89f33ca-dd37-4258-af08-82efb112f364` 的 chatops-api verify 实例在模型返回后的 collect 阶段失败。实际成功的 bash 活动创建了 `cleaned-artifacts/cleaned-cve-2025-27516-chatops-api-evidence.md`；原收集器仅按根层文件名的 cleaned- 前缀筛选，对 cleaned-artifacts 目录调用 readFile，报 EISDIR。

不是 Sourcegraph 无法读取源码；同实例的 sourcegraph_read_file 已返回仓库源码。较早一次 list_files(path="") 参数失败属于独立工具活动，Agent 后续已继续调用；它不是导致实例终止的 EISDIR。

修复：使用带文件类型的目录枚举，根层仅选择 cleaned-* 文件或目录；产物目录内递归收集普通文件，使用 __ 连接目录名保存到现有平铺 uploads。不把目录或符号链接当普通文件读取。真实文件读取和保存错误仍如实失败。

验证：tests/assistant.test.ts 新增 cleaned-artifacts/sources/evidence.md 与 cleaned-empty 场景，修改前实际复现相同 EISDIR，修改后25项相关检查全过；typecheck:app 与 diff --check 通过。未用模型替身结果宣称本轮调查成功。

失败实例的临时目录已被会话清理；已从成功 bash heredoc 的保留工具日志恢复其原始取证文件，见 artifact-recovery.json。恢复仅保存已执行的文件内容，未补造最终 JSON，原实例继续标 failed。

为避免中断仍在执行的 adr-api 节点，临时暂停开发监听器（未暂停后端进程），当前 Run 结束后恢复监听并加载修复。

用户随后要求停止并清理该轮记录，修复后重跑。旧轮已取消并移至应用外备份；开发监听器已恢复，后端进程更新为842023。新版提示词、完整原文去重与目录收集修复均已加载后，才通过工作项页面启动新Run。31项assistant/MCP检查和类型检查通过。详情见cve-fixed-restart.json。
