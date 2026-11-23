# 退役代码和业务数据清理

用户2026-10-30明确允许删除被淘汰方式的关联代码及数据，不要求兼容。默认清空受旧模型影响的原型业务数据，以新模型重新开始；不自动建设迁移/双写/旧版本执行分支。本轮只登记范围，尚未执行删除。

## 1. 代码与接口

| 删除对象 | 当前定位 | 保留的实际能力及承接 |
| --- | --- | --- |
| workflowId/lastRunSelection当前权威 | shared/records、work-items/index/prepare/children、客户端准备/批量 | 单一workId/inputBindings；方法选择固定为本项Definition的call，历史留在Run。 |
| compositionWorkId/compositionInputs旧命名及delivery单数别名 | shared/records、work-items/composition及客户端消费 | 一次改成workId/inputBindings/deliveries；不保留别名或fallback。 |
| 公共Work的authorContext/authorInputs/authorInputSelections业务副本 | server/index的prepareAuthor/createMethod、assistant作者上下文、work-items准备 | 本项工作区读取实际输入；公共方法只作为复用定义与独立样例。 |
| 内部app.request启动和各入口复制的输入处理 | server/index的批次/workspace/普通actions | 具体prepareItemRun/runItem及输入修订函数，适配层保留JSON边界。 |
| ItemUiPlan/ItemPresentation可写安排、自定义界面AST evaluator/formatter | shared/item-ui/workitem-composition/ui-authoring、composition-ui、UiArrangement | 原生OpenUI程序为唯一安排；官方parser/merge/Renderer，应用仅检查业务引用。 |
| json-render编译/registry/store/props重复schema | delivery-spec、DeliveryView、UiComponents、RecordTable、PlannedInputs | 现有控件经OpenUI正式库封装，选择/表单使用原生状态机制。 |
| resultOutput和WorkResultSet专用成果引擎 | shared/work-result-set、flow/runs特判、run-inputs.recordIds、WorkResultSet阅读器及作者prompt | 普通输出schema、固定Delivery和稳定记录ID；领域数据处理留在具体pipelines。 |
| mode与legacy函数解释 | shared/FlowNode、flow、runs、作者schema/prompt、前端节点编辑 | 明确operation及各集合/控制节点既定语义；call保留eachPort/广播。 |
| 泛字段名证据推断 | assistant/validation的递归扫描、prompt及旧断言 | expectedOutput；实际材料/来源/进展/条件命令的明确校验。 |
| 含混的retry=preview正式推进接线 | runs.retry及客户端失败项操作 | 诊断预览与正式失败输入补跑明确区分；正式补跑新Run，精确汇合旧/新成功，不新增attempt平台。 |
| 无引用旧组件/依赖/夹具 | GenerateItemMethod等实际无引用组件、@json-render/core/react及旧测试 | 先查实际引用后删；OpenUI以外第三方依赖按实用性判断，不因列表长批量删除。 |

不机械删除PrepareItemRun/BatchItemRun等仍有用户能力的入口：其普通单步骤、子项汇总和批量行为先重接统一流程，再删除旧实现。删除旧测试前把其真实业务断言迁入唯一模型；仅验证旧格式/旧编译器的测试可以一起删除。

扫描完成标准是生产源码不再有退役机制的可达分支，不只让类型通过。历史track、归档和本清单中的旧名是历史引用，不计为运行兼容代码。

## 2. 实际持久化

当前并非SQL数据库：业务工作区在每Work目录的work.json、definitions/*.js、uploads和assistant/*.jsonl；工作项、批次另存JSON。实际dataRoot由运行配置决定，不能假定只有仓库data/。

| 数据 | 处置 |
| --- | --- |
| 数据根中包含work.json的所有旧Work业务目录及其定义/Run/产物/上传/Pi会话 | 允许整组删除；默认不逐条转换旧Definition或保留旧解释器。 |
| work-items/*.json、work-item-batches/*.json及其它已识别的旧业务队列记录 | 与上述Work一起清理，不能只删工作项而保留可自动恢复的批次或运行。 |
| 应用浏览器localStorage/sessionStorage中的旧选择/草稿/会话关联及内存缓存 | 一次性以应用数据版本失效，或明确删除本应用对应键；不清理整个浏览器。 |
| models.toml、模型凭据、dataRoot/model-settings.json | 保留，不记录内容或密钥；清理后验证模型目录和默认选择可用。 |
| 源码、pipelines可复用定义源、原始文档归档与必要测试证据 | 保留有效内容；旧字段样例需要更新/删除，不作为运行兼容理由。 |

清理授权覆盖退役业务数据，不能扩展到其它应用目录、模型凭据或无关用户文件。无需为旧业务数据保留强制备份或迁移链；如实施时制作临时回退副本，它不进入产品读取路径。

## 3. 执行顺序

1. 在独立源码/临时dataRoot完成新模型和AC14清理演练，列出实际数据目录/应用键清单；不要输出业务正文。
2. 进入明确的托管交付任务时，确认将清理的数据根及其全部写入/恢复进程。调试阶段不能停止或重启flowcraft.service。
3. 在无旧写入进程持有这些业务文件的维护窗口，一次清理关联业务数据闭包；保留配置/凭据，删除旧客户端草稿关联。
4. 用新代码及干净业务数据启动，检查没有旧批次/定时器/会话复活；新建工作项，验证Assistant、过程查看、交付接续和依据结项。
5. 最终只保留一份新代码和新数据合同，清除开发中的过渡分支、旧启动参数、兼容读写及旧类型别名。

数据删除许可已由用户给出，后续不因“旧数据需保留”重新增加兼容工作。托管停机/发布是另一个明确执行步骤，本轮track文档创建不执行它。
