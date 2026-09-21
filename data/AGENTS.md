# 本地工作数据

本目录保存正式运行生成的本地工作数据。职责是保存用户能重开的工作；方法读写归 src/server/files，工作项读写归 src/server/work-items。

当前布局为每工作一份 work.json 与 definitions/<id>.js；work 只引用定义，不保存第二份权威 IR。用户上传的原始文件与剖析流程产出的 cleaned- 清洗制品在 `<workId>/uploads/`，剖析流程的洞见登记为普通材料，内置剖析定义经结构签名识别、不占草稿/采用位。Assistant 对话的 Pi 持久会话（JSONL，SDK 自动 compaction）在 `<workId>/assistant/`，随工作目录保留与恢复；工作流 agent 节点执行不持久化会话。具体字段由真实保存/读取路径校准，参考 [数据推演](../spike/data/README.md)。

非目标：数据库平台、事件回放、二进制对象仓库。根 models.toml 是模型目录和密钥的唯一来源；model-settings.json 保存全局默认选择，不保存密钥。目录密钥不放入任一 work.json 或对外快照。旧 .env.local 不作运行时回退，只可在用户授权下显式导入目录。实际生成数据不提交 Git，目录规则只跟踪本 AGENTS。

验收归 P21/P22/P23/P31：真实文件重开、写失败保留旧状态、断线重取完整定义。单文件容量与写频率是未验证假设，遇到真实瓶颈再调整；目录布局不是冻结协议。

持续业务工作项保存在 `work-items/<id>.json`，运行及冻结工作项输入仍放所属方法 work.json。启动时先补齐跨文件运行关联，再恢复等待；不能仅恢复其中一侧。验收临时数据可整体移到隐藏备份目录，不覆盖用户材料。
