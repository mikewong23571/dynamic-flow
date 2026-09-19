# 模型与对话（伪代码，不是 Pi SDK 调用示例）

对应 A2、B3、C2 与自定义端点要求。此处只写一层直接 SDK 调用，不定义 ProviderFactory 或自己的 Agent loop。

```text
loadModelConfig():
  从项目根 .env.local 读取协议、Base URL、模型名、API Key
  缺项返回具体配置提示；不偷偷退回假模型
  用简单分支把三种协议值映射到 SDK 支持的调用路径
  保留用户自定义 Base URL，不固定供应商

requestEdit(workId, selectedNodeId?, message, selectedSamples):
  保存本轮请求消息与 ID；固定 expectedDraftId、目标、材料、节点与样本值
  Pi 接收对话历史与本次固定上下文，复用 SDK 工具循环
  提供 proposeFlow 工具：
    检查返回结构、支持节点和请求修改范围
    单节点请求不得擅自修改无关节点；越界则反馈原因，请明确更大范围
    newDraft = flow.saveDraft(workId, expectedDraftId, proposedDefinition)
    保存成功后将本轮 expectedDraftId 更新到 newDraft.id
    返回真实保存结果与节点/参数/连线差异
  如果用户手改造成起点不匹配：保留提案文字，说明过期；不覆盖、不自动合并
  工具失败/未调用时，不呈现“已修改”的成功状态
  流式消息按本轮 ID 追加；最终消息与变更结果保存到 Work
  页面随后改选节点，不影响该请求的固定目标

executeNode(task, expectedOutput, inputs, stopSignal):
  使用同一组模型配置创建节点执行会话
  把任务、真实输入和预期输出交给 Pi
  stopSignal 触发时调用 SDK 的中止能力
  返回实际输出与工具记录，检查必需字段
  无效输出作为节点失败；不生成默认成功值，不把业务分类写成硬编码路由
```

配置来自仓库根现有 `.env.local`；不复制、不读取到本设计文档。三种协议分别验证流式文本、工具结果、取消和错误。具体 SDK 参数及服务兼容程度待真实接入验证，本伪代码不声明端点已经接通。密钥不写入工作文件或浏览器状态。
