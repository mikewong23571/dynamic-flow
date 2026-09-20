# 来源节点（source nodes）

背景：产品原有三个输入性质概念并存（$input 运行时绑定、材料文本、uploads 文件），导致创建必须带材料、剖析流程只能把文件名伪装成 input 值。用户确认方向：钉死的数据走来源节点，按批换的数据走批次输入；创建工作只需目标。

范围：

1. IR 增加 file 来源节点（kind:'file'，参数 file.name 指向工作 uploads 文件）：records、flow 校验、nodeInputPorts（无入边、输出 output）、runs 短路产出（不调模型）、画布渲染与 NodeInspector 文件选择、作者工具 schema。
2. 剖析流程迁移：profile flow 改为 [文件节点] → probe → branch → …；import 按文件名 seed 定义（同一文件+同一规范复用），runs.start 不再传 input 值。
3. 创建去材料化：createWork 正式允许空材料（删除 expectImport 特殊路径）；创建对话框材料改为可选。

非目标：材料节点（kind:'material'）、试验样本节点化、资源面板整合（后续 track）。旧 $input 与材料语义保持不变。
