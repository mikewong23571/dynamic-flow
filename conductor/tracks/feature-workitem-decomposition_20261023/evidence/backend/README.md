# 后端实施与验证

## 实际落地

WorkItem单实体增加父子/有效范围/固定候选来源/结构化received修订。children、prepare、queries与run-inputs按职责拆分；HTTP和runtime hook直接组装，无新数据库、队列或调度器。完整接口见[contracts](contracts.md)。

- 子项首次保存即带父关系和origin。同源重试用父回执及子项origin共同定位；同父trackingKey关联不覆盖内容，目标冲突拒绝。部分失败保留成功前缀和实际ID；节点输入与成果输出来源明确区分。
- 写入短时串行协调层级完成/新增/范围/重开；不持锁等待模型。父项首次结构完成保存childCompletions、确认范围和问题快照。排除截断祖先影响，恢复/重开由一次明确确认承担。
- 纯JSON received输入可以正式启动；修订新ID替换本次选择，原输入和旧Run不变。跨项原文命名空间化，冻结上下文不携带全部received/history。完整选择和合同校验仍走同一run入口。
- 完成依据精确到port/index。固定完成事件递归解析实际成果值及子项结论，不向模型只传ID，也不以最新结果替代历史。默认汇总不使用重开项旧结论；显式历史引用保留标识。
- summary列表只返回分页摘要；共享method读一次，ids关联不截断，有序runs保留业务轮次。rootId+children直属，rootId+todo/all为有效后代。candidates显式page/pageSize支持候选分页，批量建立仍在服务器定位完整来源。
- 精简只读快照通过runIds过滤传输范围；编辑快照原语义不变。

## 验证证据

最初失败用例：调用未实现createChildren得到TypeError，随后关系/结构完成/祖先重开/JSON修订通过。

[tests.log](tests.log)包含35项通过：7项本track模块/真实HTTP/临时真实文件测试，及work-items、lifecycle-integration、workitem-progress、create-items-integration的相关回归。保存故障测试仅在ItemStorage保存边界注入失败，实际记录仍写临时文件，验证回执失败和第二子项写失败后无key同源补建不重复身份。

[typecheck.log](typecheck.log)为正式应用类型检查通过。前端浏览器及真实模型由相应分工证据记录，本文件不将fixture当作真实模型。

[scale.json](scale.json)：1季度+100target+1000叶子，每叶4轮执行和20条实际长度历史，共享方法含长成果。三次摘要请求约1.04–1.08秒，每次25行27,786字节，方法文件读取1次。ids两项查询即使pageSize=1仍返回两项完整关联摘要。该结果是后端HTTP测量，不代替浏览器首屏/返回测量；没有宣称全应用硬并发上限。

## 审查后修正

- 子项第二次保存失败可能留下无父孤项：改成首次写完整关系。
- 父回执失败后同源查重可能失效：读子项origin兜底，已建身份不能重指定给另一子项。
- 输入修订从成果新建时丢原文：从真实输出及冻结Run材料解析，保持原文来源。
- 纯父项Run完成但仍等待子项：没有独立待确认条件时不重复成为待办。
- 多层完成只返回引用ID：递归读取固定事件及真实精确输出，同次汇总按方法复用读缓存。

未操作正式data、模型设置或用户运行；没有提交或push。

## 后续定向复验与千候选优化

35项回归之后追加第8项“1000候选实际建立”测试，并根据实测瓶颈优化父历史保存：每个子项仍首次完整独立落盘，整个建立动作将实际完成前缀作为一条历史保存；停止/逐项失败仍记录已完成项，丢失父回执仍通过child.origin恢复。没有全批回滚或持久队列。

[candidate-scale-before.json](candidate-scale-before.json)记录逐项重写父历史时建立12,659ms；[candidate-scale.json](candidate-scale.json)记录优化后974ms，方法来源读取保持1次。重进第20页25条候选298ms、340,338字节（含1000个轻量ID及回执）。[candidate-scale.log](candidate-scale.log)是优化后保存故障及千候选实际建立两项定向复验通过；不把之前35项记录说成优化后全量重跑。

另外补验了明确历史完成输入：已重开或已排除子项只有historical:true才可使用旧完成事件，实际冻结JSON带historical:true，默认准备仍列为未覆盖。该精确跨层输入定向测试与正式类型检查通过。

## 实际浏览器规模反馈后的缓存修正

runtime独立浏览器在62MB共享方法上发现：多路summary/计数请求重复读取1102项并解析整份方法，首屏约6秒、筛选约4秒、热返回约3.5秒（此前模块单请求预算通过不足以代表页面）。按此证据新增最小只读缓存：

- FileStore.read使用磁盘stat版本缓存解析并合并同版并发读，返回structuredClone独立对象；成功写入清缓存，外部文件版本改变重新读。
- 工作项all按自身save/目录版本缓存并复制返回；摘要投影按工作项版本与files.onChange失效，多路读共享计算，返回页行独立副本。
- 不迁移数据库、不延迟业务写入、不共享可变对象给调用方。外部fixture新增文件后的首次查询可见。

[cache-tests.log](cache-tests.log)包含千项历史摘要与缓存隔离/失效2项实际用例（命令中state文件被name过滤没有执行其16用例）；[files-cache-tests.log](files-cache-tests.log)另跑state全16项通过。最新[scale.json](scale.json)冷请求1288ms，热请求5/3ms，方法读取1/0/0次。真实页面复测由runtime-browser证据记录，不能用此模块结果代替。

[receive-search-tests.log](receive-search-tests.log)2项通过：全局精确标题/key排在仅parentTitle间接匹配之前；新扫描关联后必须显式appendInputs才追加结构化材料，同源输入序号去重，已结项新增材料要求先重开。已补充记录保留inputsAppended回执。

最终冷入场取舍：62MB共享方法的真实浏览器“首次业务行可操作”约2.52/2.66秒，热首屏0.38–0.43秒，筛选/返回低于0.16秒。按验收原文允许说明调整预算，将这一首次冷入场建议预算明确为3秒；后端没有把解析成本转移到每次业务保存，也未因fixture写后缓存变暖宣称冷启动达标。曾局部试验成功写后预填缓存，但因增加每次保存clone且不能证明真正冷启动改善，已经撤回；当前仍为写成功失效、首次读取按磁盘版本解析并缓存。cache-tests/files-cache-tests已在撤回后的实现重新运行。
