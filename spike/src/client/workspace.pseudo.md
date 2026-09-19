# 完整工作区（伪代码，不是 React 实现）

对应 A–F 全部故事的交互，重点是同一个工作区保留上下文。

```text
Workspace:
  本地：workId、selectedNodeId、selectedRunId、每节点样本选择、表单未保存输入
  业务：后端的完整工作状态；SSE 建连/重连首先给最新状态
  主区画布，按任务展开节点配置、样本结果、对话或比较
  连接断开显示重连状态；POST 回执不覆盖 SSE 最新状态

创建工作:
  输入目标、粘贴材料、预览拆分 -> createWork
  从目标生成流程 -> requestEdit（未选节点，范围为整个草稿）

编辑:
  移动/缩放 -> saveLayout
  节点/连线/配置修改 -> saveDraft(expectedDraftId, newDefinition)
  表单写入顺序提交，等待回执；失败保留本地输入并提示未保存
  选中节点发消息 -> 固定该节点、样本与草稿版本的 requestEdit
  草稿冲突提示重新查看/发起；不吞掉用户刚做的修改
  删除节点清理关联边；声明输出仍需重选时给就地提示

运行:
  明示所选版本（采用版或草稿）、材料和全流程/单节点范围
  runs.start -> 展示真实状态与节点/样本进度
  活跃运行/比较期间不再启动第二条运行链；编辑仍可用
  停止先显示 stopping，收到实际结束后才显示 cancelled
  点击实例查输入输出；失败输入可在选定版本下单独重试

试验与采用:
  从问题结果进入对应节点的候选草稿；保留 adoptedId
  samples 按节点保存；换节点不把前一个节点的输入静默带过来
  固定两边版本及样本 -> compare；可停止整个比较
  改候选/所选输入后 -> readComparison 重新计算是否过期
  节点位置/缩放/列表排序不参与比较有效性
  adopt 与 keepResults 是不同按钮；discard 回到采用版
  从已保留结果明确多选 -> 输入预览 -> 解决同材料多版本 -> 确认续做

查看与重新打开:
  报告显示正文、来源、完整性；复制失败提供可选择文本
  保存成功后刷新/重新打开；恢复草稿、视图、比较和结果
  正常运行时刷新不停止后端；服务重启后的 interrupted 提供显式重试
```

未来可拆成 `Workspace / WorkflowCanvas / NodeInspector / Results / Assistant / Comparison` 六个直接组合的 React 组件；先共享同一工作状态，不建立页面 DSL、全局命令总线或动态插件面板。React Flow 处理画布，assistant-ui 处理对话，shadcn/ui 统一控件；旧 Spike 的外观不作为视觉模板。
