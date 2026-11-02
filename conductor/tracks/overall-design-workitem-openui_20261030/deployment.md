# 托管部署事实

2026-10-30T09:26:46Z起执行经用户授权的最终维护切换，上一版已部署。**用户随后否定工作界面组织，整体track保持进行中，重做未发布。**

- 交付产品提交：e69d2e9及其祖先；实施分支feature/workitem-openui-20261030，独立worktree dynamic-flow-openui。
- 原仓基线2eeab11包含用户原有未提交原型。将产品差异git apply --check后应用，不reset/覆盖原分支及原有索引。222个产品路径逐文件比对一致。
- 维护窗口停止用户级flowcraft服务，安装锁定依赖并构建；默认开发命令改用独立端口，托管通过systemd drop-in明确ExecStart为pnpm dev:managed。
- 服务重新启动后4320/4321监听0.0.0.0；启动API读取WorkItem和Work均为0。
- 实际删除15个旧Work目录（包含其运行、定义、上传和会话）、1118份旧WorkItem、2份旧批次。未清空整个data目录；models.toml、.env.local及data/model-settings.json私密摘要前后完全相同。
- 实际删除计数见evidence/managed-maintenance.json。无远程push/MR，无另建生产治理流程。

发布后真实Assistant创建新工作项28033599-a023-430f-ac2b-800acc5b0d34，自主保存两条待办输入、方法、完成条件和原生程序。首版错误地把read_inputs业务值当label/value包装，页面出现缺标识错误；已反馈给模型，但不能据此声称发布后整条业务烟测通过。随后用户否定整页方案，停止零碎验收，转入work-surface-redesign.md。

此前独立实例的机制/真实模型/双尺寸证据保留，不能代替本次工作界面重做。后续调试继续使用独立源码、临时数据及非4320/4321端口；不为调试停止/重启托管服务。

## 2026-11-02 页面能力增量发布

产品提交a062635。先核对原仓7个产品路径仍与上一版e69d2e9逐字一致、没有在途运行/Assistant；git apply --check通过后进入维护切换，应用增量并构建，恢复原flowcraft.service。实际监听0.0.0.0:4320/4321，服务active。没有再次删除业务数据，现有1个工作项JSON及模型/凭据配置摘要前后一致。仅更新产品代码，现有保存的界面不自动改写。

发布后Chrome重新加载既有工作项，主区已为“工作”，固定三项操作不再平铺；更多菜单保留执行/保留/界面编辑。独立4335的真实模型场景、补交后新运行及两尺寸实看见evidence/page-capabilities，逐项源代码/数据/配置检查见同目录managed-delivery.json。本次未在托管数据上运行自动化测试或新增模型测试工作项；原整体交付中的完整托管业务路线仍按plan区分。

## 预览持久性修正

用户清理/tmp后，先前交给用户查看的4335报缺少工作项。根因是启动时将业务dataRoot设为/tmp/flowcraft-page-capabilities-ql9mt2wq；4333也使用了临时业务目录。应用渲染并不依赖/tmp，托管4320/4321的data仍在。将长期交互预览误当成可丢弃自动验收实例，是本次交付配置错误。

修正：pnpm preview现在由同一后端在0.0.0.0:4335提供页面/API，默认使用独立工作目录中的.flowcraft-preview-data，数据及恢复快照均忽略提交。旧4333临时实例停用，三个已有示例统一在4335读取；不增加空数据fallback、不改业务引用、不编造旧运行。

从浏览器仍保留的实际React工作区快照抢救三份WorkItem、对应Work、六份不可变Definition及八次Run，恢复原ID和uiProgram，另有实际保存的交付。所有示例没有上传文件或外部call依赖。Pi原始会话JSONL与快照之外的独立工具内容文件无法恢复，未声称完整恢复所有历史制品。

原链接0daa2a26刷新后HTTP200，真实阶段读取仍为两条齐备记录；重启预览后全部业务JSON/JS逐文件摘要不变。预览不再从/tmp读取业务数据。实际路径和范围见evidence/page-capabilities/persistence-recovery.json。托管服务保持active，未操作其业务数据。此次修改仅涉及启动命令、忽略规则和运行约定，没有修改产品业务逻辑。

## 导航与正文排版责任修正

用户指出“已给资料”Tab紧贴正文，随后追问前端最佳实践为何未落实。根因为适配时只定义组件参数和功能，没有落实已有布局规范：导航gap为0，View裸div、表单带页面上边距，并用:has(Metric)猜父布局。

现由ViewNavigation提供16px导航间距，View/Workspace提供24px主要区块间距，Section提供12px标题到正文及显式纵向正文组合，Stack提供16px局部间距。表格/报告/详情/表单统一自身标题-内容结构，移除表单页面上边距及标题重复margin；OpenUI样式迁入同模块OpenUIWorkspace.css，删除按Metric类型猜测的规则。能力描述同步说明默认排布和显式组合，原生程序、业务输入与运行不改写。

在原工作项1359a79f的已给资料页实看1440/1024，实际测得Tab到标题16px、标题到正文12px、区块24px、表单margin0，无页面横向溢出。相关原生组合/表单/界面保存及业务观察浏览器12条通过，类型/构建/格式分别核对；不是全仓重验。

布局职责修正提交48f8afd，已发布托管4320/4321；源码与实施区一致，业务工作项及配置摘要不变。测量及验证见evidence/page-capabilities/layout-spacing.json。
