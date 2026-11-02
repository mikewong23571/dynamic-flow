# 工作项流程的原生标识

2026-10-29。用户澄清仅指工作项流程，不要求修改普通流水线的展示。

根因有两层：nodePrimitive将技术原语翻译成中文，工作项outputLabels又用交付业务标题替换了真实输出端口。现由CompositionFlow显式启用nativeLabels，WorkflowNode的原语、输入/输出及连线辅助文本使用原始标识；编辑与阅读保持一致，CompositionStep同样显示原生原语。示例为call · map/call · aggregate、branch、collect、input/output、matched/unmatched；分路条件显示真实equals等运算符。业务步骤标题不改写，计划交付沿用业务名称，交付别名只作为辅助提示。没有修改定义、Handle、边或执行，普通流水线及固定方法预览保留原有展示。

类型与构建通过；client/布局/聚焦/视图状态19项通过，固定调用和原语浏览器两尺寸4项通过，完整需求到成果路线两尺寸2项通过。首轮窄屏用例进入编辑自动展开Assistant后，结束按钮被侧栏覆盖；通过实际收起入口再退出，未force穿透或删除英文标识断言。失败日志保留。真实独立4330两尺寸只读检查仍为1根Run/3调用，无pageerror，已看live-primitive截图；英文原语和端口均可见。原目录src未改，托管不变，未运行模型。

当前日志及实际截图见evidence/native-labels；O的中文原语截图是历史，不作为当前标签依据。新真实模型设计属于R独立记录。
