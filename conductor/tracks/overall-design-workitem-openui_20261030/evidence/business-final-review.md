# 最终业务机制审查与临时清理演练

2026-10-30，独立工作区 `/home/mike/projs/fork/dynamic-flow-openui`。

## 当前机制核对

- 普通HTTP动作、workspace、Assistant与批次共用execution.runItem；只取本项私有workId、明确版本、已保存inputBindings。单步骤先保存普通片段；preview不提交业务事实。
- 记录续做先读固定Delivery和recordIds，验证端口/新方法/组装输入后才保存定义和绑定。界面保存从官方SDK程序派生合同，标签修改保持来源，rowKey变化换交付身份并保留历史。
- 失败补跑创建新commit Run，retrySource/inputSource固定原Work/Run/result/port/index，保留原样本与材料；原失败Run不改写。原成功和补跑成功需要显式来源汇合后才能全量发布。
- 发布要求本项正式完成Run、固定版本、原生程序输出和真实记录合同；完成条件与结项仍为独立动作。运行成功不自动签署业务完成。
- 批次冻结每项版本、绑定和revision；暂停继续观察已启动Run，重启恢复对账，等待/中断不自动重跑；连续三失败暂停。暂停重启后两项完成、pending仍不启动已由回归覆盖。
- 所有WorkItem写入的serial当前统一归入$mutations。门闩并发验证输入替换与同revision追加互斥，后者冲突，不覆盖已保存值；保留当前机制，没有新增锁抽象。

发现并修复两处当前缺陷：

1. 过程区大值采用投影正文时，创建子项的source存在但value可能为null。后端现在对未显式修订的输入从固定Run重读完整值及Run.materials。新增真实HTTP、大记录、完整来源及旧Run不变测试；显式revised输入继续保持已有修订语义。
2. 普通reviseInput原先缺expectedRevision可绕过冲突。替换已有输入或修改端口绑定现在要求整数revision，缺省/过期均在写入前拒绝；纯追加不强制增加此要求。新增两种拒绝及无部分写入回归，迁移内部测试调用。

## AC14临时数据清理

实际临时目录：`/tmp/flowcraft-ac14-clean-AM4C4u`；执行脚本：`/tmp/flowcraft-ac14-cleanup.mts`；结构化结果见[ac14-cleanup.json](ac14-cleanup.json)。未访问原仓业务目录或4320/4321。

清理前创建实际私有Work/WorkItem、等待Run、已暂停持久批次、上传文件和会话文件；关闭该临时Application的runs/batches后，逐项删除临时root中除models.toml/model-settings.json以外的目录。

重新createApplication后，旧items/works/batches均为0，旧Work HTTP返回404；模型目录和默认设置逐字节哈希保持，默认alias仍解析为catalog。模型目录为合成fixture，仅验证配置保留和解析，没有用此演练声称真实模型调用成功。

随后建立甲/乙两项，分别创建不同私有Work，同为M01的材料仅属于各自工作项；分别绑定、正式执行identity、保存原生Report并发布，交付只含本项材料。继续观察后仍无旧批次或旧工作恢复。浏览器状态清理和托管数据清理由主代理验收执行。

## 验证

summaryOutput隐藏运行合同移除后，独立完整pnpm test为301/301通过，typecheck:app通过。上述两项修复的定向unification/decomposition共18项通过；新增并发回归本来即通过，用于确认当前统一写锁机制，未将其误报为产品缺陷修复。最终改动后完整pnpm test为304/304通过（约37秒，/tmp/business-final-close-suite.log），typecheck:app通过（/tmp/business-final-close-types.log）。
