# 实施逻辑审查修订

日期：2026-10-23。用户授权“修复 track”。本次仅修规划文档，不修改应用。track仍new，所有功能实现与浏览器验收保持待办。

## 1. 结构化输入缺字段，追加文字不能修好

反例：方法要求对象包含repository/ref，已有输入`{repository:"B"}`。再追加“分支为develop”会同时产生缺ref和输入不是对象两类校验错误。

修正：追加证据与补齐/修正输入是两个动作。后者保存新received输入ID、replacesId及原来源；准备页替换对应选择，其余输入不变。新Run收到完整对象；原成果、旧输入与旧Run.inputs不变。就地编辑仅针对方法声明字段，不增加任意表单DSL。

落点：implementation第4节；design补材料故事及输入合同；acceptance故事3；plan Phase1。校验失败保留填写内容，不用假文本或跳过schema绕过。

现有校验器的小探针见[schema-probe.jsonl](schema-probe.jsonl)：追加说明失败，完整对象通过。它仅验证当前合同边界，不代表新输入修订功能已实现。

## 2. 自动建项不能假设拿到精确上游OutputReference

现状：节点InputItem只有sourceResultIds，不包含完整上游port/index；直接输入没有上游成果。不能通过值相等或猜位置生成来源。

修正：明确区分output引用与node-input引用，后者定位已持久化的NodeResult.input。建项hook在首次业务写入前拿到固定输入引用。相同Run/节点实例恢复时沿用首次保存的来源resultId，不用新尝试resultId替换；原回执人工补建也使用同一引用及candidateId。不同容器同candidateId保持区分。手工表单不伪造运行来源。

落点：implementation第1/2/5节；design来源模型；acceptance故事4；plan Phase3。只增加建项能力所需引用，不扩展全系统来源图。回执负责检查/补建，上游普通成果不再自动推断一套重复建项动作。

## 3. 等待/中断不能堵住其他就绪项

反例：阈值2，A/B都等待外部消息，原方案把所有未终结Run计入窗口，使C永远不能启动。

修正：窗口改为新启动阈值。queued/running/stopping及在途启动计数；waiting/interrupted留在待办而释放新启动名额。signal/到期/resume按已有语义恢复原Run，恢复后重新计数，每次新增提交前检查阈值；达到阈值暂停新增，不取消已有Run。

多个旧Run同时恢复允许短时高于启动阈值，文档明确不承诺运行或模型硬上限，记录实际峰值。这一选择避免给信号/定时器加一套持久调度队列。暂停批次仅停止未提交项，关闭页面/重启后仍不承诺自动提交剩余项。

落点：implementation第7节；design自动化边界；acceptance故事5；plan Phase5。新增阈值2下A/B等待或中断→C启动→A/B恢复→暂缓新提交的验收，必须检查没有重复Run。

## 检查与当前状态

对三个修订点已同步产品设计、实施合同、spec、acceptance、plan、research及状态记录。旧独立审查报告保留为历史，末尾注明占窗规则已被本次修订取代。

本轮只做文档一致性/链接/源码未改检查与当前schema小探针。自动建项恢复、输入修订保存、等待释放名额等实际测试均尚未运行。
