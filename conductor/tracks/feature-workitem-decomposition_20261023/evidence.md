# 工作项分治实施证据

状态：已完成；本文件区分当前实现、历史检查和未测边界。未提交、未push，保留实施前的未提交工作区。

## 用户故事与操作结果

| 故事 | 当前实现及已观察结果 | 证据 |
| --- | --- | --- |
| 1 先独立处理，再拆开 | 无类型选择；手工子项收到所选材料，父子条件草稿和返回位置保留；有效未完成子项阻止父项结项 | [模块/HTTP](evidence/backend/README.md)、[小规模浏览器](evidence/frontend/browser.log) |
| 2 报告成为问题清单 | 候选清单编辑/取消/批量建立；同源关联复用身份，新来源补充材料需要明确动作，不覆盖目标或旧结论 | [后端合同](evidence/backend/contracts.md)、frontend候选截图与浏览器用例 |
| 3 已有成果接续，缺项继续 | 准备页只修缺少的声明字段；新received修订替换本次选择，实际Run收到JSON而非文本提示；精确port/index和原材料来源保留 | backend模块、frontend两尺寸prepare-revision截图及精确输出用例 |
| 4 方法自动建立 | 画布/作者支持create-items；preview零写入，正式保存子项与回执，固定首次节点输入，失败补建不重复；真实Pi high生成两条非CVE候选并成功建项 | [runtime模块/真实模型](evidence/runtime/README.md)、[真实输入输出](evidence/runtime/real-result.json)、frontend自动节点截图 |
| 5 整体待办与批量 | 100target/1000叶子有长历史，摘要分页、跨层筛选和原位置返回；10项直接准备，仅2项补字段；等待/中断释放启动名额，恢复原Run并暂停超阈值的新提交 | runtime-browser规模JSON/两尺寸截图、batch-inputs与batch-window |
| 6 整体确认与重开 | 固定完成事件解析真实结论；父项可直接整体确认或按需汇总，重开/排除/恢复确认相关祖先，旧Run及旧子项完成引用不变 | backend完成/交错用例、runtime-browser生命周期两尺寸截图 |

## 分层验证

- 后端与runtime最终联合验证：[final-modules.log](evidence/root/final-modules.log)，92项通过。包含新增分治、工作项、业务进度、生命周期接线、create-items作者/运行/真实HTTP、基础运行器、语义作者/工作流、文件模块。
- 浏览器分批完成21条相关路线：前端新7条+相邻6条，另草稿保留/放弃1条；独立runtime生命周期/批次/规模7条。前端[final-browser.log](evidence/frontend/final-browser.log)先11过2失败，修正新节点快照竞态及候选冲突测试前提后[recheck.log](evidence/frontend/recheck.log)3项全过；[draft-regression.log](evidence/frontend/draft-regression.log)1项通过。独立runtime见[README](evidence/runtime-browser/README.md)及[最终规模/窗口](evidence/runtime-browser/scale-window-final.log)。不是同一命令21项一次通过，早期失败保留。
- 正式类型检查与构建通过，日志位于frontend/typecheck.log、build.log；构建保留已有大chunk提示。本轮50个增量源码/测试文件格式检查通过：[format-final.log](evidence/root/format-final.log)。
- 真实模型只调用少量非CVE客户反馈案例，模型强度high；千项与生命周期守卫使用明确的测试执行器和真实私有文件/HTTP，不代表1000项真实模型质量或吞吐。
- root独立实际操作私有真实模型结果，1440/1024进入父项、打开子项材料、返回所属项；无pageerror。截图及结果见[evidence/root](evidence/root/)。此为工程视觉审查，不代替用户审美认可。

## 性能口径

私有规模数据为1根项+100target+1000叶子，每叶4次运行、20条历史，共享方法文件约62MB；默认仅传当前页摘要。首次浏览器实测暴露重复扫描和解析：首段约6秒、筛选约4秒、返回约3.5秒。修正为只读版本缓存/并发读合并，业务保存仍立即写文件并使缓存失效，调用方得到独立副本。

缓存后目前筛选114–139ms、热返回104–169ms、进入单项733–887ms。冷完整路线（加载应用→打开列表→搜索父项→进入父项）3.08–3.38秒；不能写成该整条路线2秒内。首列表HTTP约1.71–1.90秒，最终首屏UI实测2.52–2.66秒，热首屏382–433ms。原2秒建议未达到；按acceptance允许的显式取舍，将此62MB样本冷首屏预算调整为3秒，其余预算不变。剩余单次冷解析成本暂予保留，不用每次保存增加clone预热缓存来伪装冷启动改进；确有更大历史规模再定位调整。后端千候选实际建立从12.66秒降至0.97秒，候选第20页读取25项约298ms，含1000个轻量ID/回执340KB；见[候选规模](evidence/backend/candidate-scale.json)。

## 审查与修正

独立审查关注用户为了推进任务必须知道什么：创建无需分类；引用在界面选择；缺字段就地修订；已有结论不用重新运行；整体确认无需逐层生成报告。父项默认显示子项列表，材料、状态和操作沿用当前控件体系。发现并修正默认页面不聚焦子项、候选追加材料缺入口、材料数忽略接续输入、准备页不接收新证据等普通用户路径问题。

后端修正首次子项保存父关系、父回执失败时按子项来源恢复、同源不能改挂另一身份、完整确认值递归解析、同方法重复读取和千候选逐项写父历史。runtime保留通用retry的preview边界，自动来源固定于首次持久输入，停止/迟到/部分成功如实保存。

## 边界与数据

- 当前为单进程本地原型；没有新增工作项类型体系、持久批次调度器、分布式事务或数据库迁移。
- 批量窗口只限制本批新启动（2），不限制全部模型活动。恢复可短时超过阈值；实测Run峰值4、Agent峰值8（两个Agent节点、每节点并发2、每项2输入）。尚未提交部分在关闭页面后不会自动继续。
- 本次浏览器恢复通过重建createApplication验证；不冒充OS进程重启新验收。旧进程级等待恢复证据属于原生命周期track。
- 所有写入测试使用临时dataRoot和私有端口；真实模型也使用私有目录。正式data核查保留原文件，不自动恢复覆盖用户现场；详情见[root数据核查](evidence/root/data-check.json)及[重启后的只读检查](evidence/root/final-service-smoke.json)。
- 历史设计检查：[v1审查](evidence/design-v1-review.md)、[v2审查](evidence/design-v2-review.md)、[track接线审查](evidence/track-review.md)、[逻辑修订](evidence/logic-review-fixes.md)。这些是设计证据，不代替本次功能结果。

最终独立认知/逻辑/视觉复核：[root review](evidence/root/review.md)。当前API已加载实现；临时模型数据和测试服务已清理。
