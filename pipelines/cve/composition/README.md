# CVE 批次组合配方：已有判断到可核对交付

本例回答三个实际问题：哪些仓库/ref 受影响、究竟改哪些仓库、每条原告警能否交代。业务字段、归并与验收口径全部在本目录的普通 Definition 中；不向 `src/` 增加 CVE 分类或界面逻辑，不修改旧 v2。

这是**明确假设的业务联测**。`fixture.ts` 中的 `DEMO-A/B/C/D`、影响判断、变更、后继产物及证据标识均为虚构输入；测试没有调用模型、扫描仓库或验证漏洞。`recipe.ts` 只核对这些输入的范围与必要字段，不能证明漏洞结论、修复有效性或证据真实性。真实业务需要调查方法取得实际证据，再由用户核对并明确验收。

## 如何接到工作项 Assistant

1. 先用 `inspect_work_item`、`read_artifact` 读取本项原材料。调用 `find_methods` 搜索“漏洞事实研究”“仓库漏洞核查”；对候选调用 `inspect_method({workId, definitionId})`，核对真实输入输出及保存版本。不要猜测方法 ID，也不要从旧运行默取材料。
2. 现有 [v2 方法](../v2/README.md)分别接受 `question`，以及 `facts`＋逐条 `targets`。按 CVE 共用事实、按仓库/ref 分开核查；使用固定版本 `call`。v2 的 `checks` 带 `repository/requestedRef/commit/conclusion/reason/unknown`，**并不提供已修复、验证或人工例外确认**。保留其固定来源，补充实际变更与验证后才能形成下表的 `assessments`。不能把“不受影响”之外的核查结论直接标为闭环。
3. 本目录提供一个“核对已有判断与交付依据”的普通方法 `assessmentMethod`，及绑定该方法保存版本的 `compositionDefinition({workId, definitionId})`。安装/保存方式就是现有 Work 的 `saveDraft`；完整临时安装和 HTTP 工作项接线见 [集成测试](../../../tests/composition-business.test.ts)。测试会新建自己的临时数据，不安装到用户实例。实际目录尚未安装本例时，应先保存这个方法，或由 Assistant 在当前私有流程中生成等价的普通步骤；不要声称目录已存在它。
4. 用 `check_flow` 检查组合，用 `save_flow` 保存完整 Definition（每次写入使用最新 `baseRevision`，保存同时给当前 `expectedDraftId`）。原文件用 `select_inputs` 绑定；已有材料整理成结构化记录时，用 `add_input` 提供实际 `materialIds`。输入修订保留旧值。示例直接提供显式假设对象，只验证组合接线。
5. 用户明确要求执行后调用 `execute`，用 `inspect_run` 核查实际完成或失败。执行成功后先保存 `cveUiProgram` 原生OpenUI source，再对明确输出逐一 `publish_delivery`；程序只安排实际输出、字段与交互，不携带判断数据。

保存后的组合是九个普通步骤：

```text
alerts → groupBy 调查范围 → 保留原告警 ID
                                  ↓ left join assessments（缺判断不丢范围）
                        固定 call 逐范围核对
                          ├→ 影响记录
                          ├→ flatMap 实施改动 → groupBy 仓库/ref/方案 → 改动安排
                          └→ flatMap 原告警 → 逐条交付 → reduce/筛选验收缺口
```

## 最小输入、输出和错误

| 入口                | 每条最小内容                                                                                       | 具体例子                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `alerts`            | 唯一原告警 `id`，调查关系 `relationId`，`repository/requestedRef/baseline/cve`                     | `scan-01` 与 `scan-02-duplicate` 都指向 `api-main-A`；两条原记录保留，只调查一次        |
| `assessments`       | 对应关系 `id` 与相同仓库/ref/基线；判断、处置、原因、证据、确认、改动和验证字段；详见导出的 schema | `api-main-A` 与 `api-main-B` 都明确采用 `api@main:dependency-upgrade`                   |
| 改动 `changes[]`    | 方案 `id`、实施仓库/ref、说明、依赖方案 ID                                                         | worker 的 C 需要 `platform-images@stable:base-image` 及其后续 `worker@main:adopt-image` |
| 验证 `verification` | 原 `baseline`、实际 `successor`、逐关系验证 `evidence[]`                                           | api 的一次升级分别保留 A、B 的验证引用                                                  |

`relationId` 必须在本批唯一表示同一漏洞、仓库、ref 和基线；重复原告警共用它。方案 ID 在同一实施仓库/ref 内表示已经确定的一份相同方案（包括说明及依赖）；存在方案冲突应先调查，不能机械归并。本收敛示例每条原告警对应一个调查范围；一条原告警涉及多个范围时，需先扩展审计归并，全部关系都满足条件才可接受，不能直接套用本例的行计数。

缺 `assessment` 会通过 left join 成为“证据不足 / pending”，仍进入原告警交付。判断适用的仓库、ref 或基线不一致也保持未决，且不带入改动；错误基线的验证不能令修复成立。重复关系判断、坏输入字段和调用版本/端口不符由正式校验或运行明确失败，不能拿成功分支冒充整批成功。

| 声明输出              | 用户问题                        | 固定内容                                   |
| --------------------- | ------------------------------- | ------------------------------------------ |
| `impact` 表格         | 哪些仓库/ref 受影响，哪里待查？ | 调查范围、全部原告警 ID、判断、依据与验证  |
| `changes` 表格        | 需要改哪些仓库，先做什么？      | 实施仓库/ref、方案、依赖、逐关系覆盖及验证 |
| `audit` 表格          | 每条原告警有什么处置？          | 原告警唯一 ID、范围、处置、证据与例外确认  |
| `completion` 普通报告 | 本批还有哪些未决？              | 原告警数、机械依据齐备数、未决原告警 ID    |

最后一份只是从逐条交付计算的短缺口报告，便于核对；没有引入第四种业务界面或新的展示能力。三张业务表与报告都由导出的原生 `cveUiProgram` 安排，官方OpenUI Renderer读取真实固定输出。

## 接续、验收和沉淀

选择记录时调用 `continue_records({baseRevision, deliveryId, recordIds, workflowId, definitionId})`，目标方法必须是已保存的单输入方法；多输入的真实复查需要在流程中显式组合 facts 和 targets。服务重读固定交付中的原值和每条精确来源，不接受模型/页面另传一份业务值。本测试选择第二条重复告警及缺判断告警，实际子 Run 只收到这两条，连同输出索引为 1 的精确来源；演示接续方法仅透传记录，**不冒充完成补查**。选择只准备输入，实际运行是后续明确动作，旧交付持续可读。

假设批次的预期结果为：8 条原告警、7 个调查范围；api/main 的两个问题共用一次升级，api/release 独立；共享镜像维护仓库只出现在实施安排；portal/A 有排除依据。`scan-07-missing` 缺判断，`scan-08-exception` 没有例外确认，两者均未决。方法字段 `accepted` 只表示已提供判断满足该配方的机械要求，不是用户已验收。

`completionCriteria` 明确要求逐告警闭环、改动与实际后继验证，以及用户明确核对。例外仅适用于该关系的具体确认，非空确认引用必须来自实际确认记录，不能由模型代填。运行或接续成功不会勾选条件；测试的结项请求仍被拒绝。通用服务不会替用户判断 CVE 证据真实性，也不会凭 `acceptedCount` 自动验收。

沉淀整段方法应在替换为局部接续流程之前，用 `save_method` 提取当前组合，并检查新的 Work 保留 alerts/assessments 参数、固定调用版本和声明视图，不带原工作项 ID 或某轮运行引用。下一批重新提供自己的原材料和判断；不能把这批 fixture 的值写进 Definition。

## 验证与边界

```sh
pnpm exec tsx --test tests/composition-business.test.ts
```

测试使用临时文件、正式应用 HTTP、真实 runtime/call/交付/输入解析，不监听端口，不使用用户数据、模型或 4320/4321。覆盖重复原告警、共用改动、ref 隔离、共享镜像、未匹配、未确认例外、验证基线不符、声明交付、两行精确来源及实际调用输入。它不验证真实模型发现/判断、浏览器操作或视觉。

非 CVE 复用已由 [工作项组合测试](../../../tests/workitem-composition-backend.test.ts) 的报价路线验证：私有流程、采购报价声明交付、固定方法版本、所选记录与来源。无需为本例新增通用业务枚举或重复搭建报价系统。

### 可操作界面演示

interactive.ts把已有配方封装为单batch输入的方法，补依据/例外确认是两个普通固定流水线，并提供interactiveUiPlan的四种业务视图和已注册动作。工作项只需一个call；后续表单通过真实选中记录及明确批次上下文重新核对全批，不把整批运算放入工作项。

假设输入8条原告警、7个范围。原有6条有依据，补worker-D的适用版本证据并明确确认portal-B例外后8条都有交付依据；错误版本与未确认例外仍不能关闭。改动安排保留platform-images的上游仓库及worker采用关系。该样例只有一条原告警对应一个范围，未实现一告警多范围总验收；上下文随记录显式交接，未作大批量优化。所有判断、修复和验证材料完全虚构；不扫描仓库、不证明漏洞真实排除、不代表真实例外批准，最终结项仍须用户确认。
