# 多路画布布局与连接阅读

用户授权应用上一轮方案。范围：ELK自动布局/真实路径、关系聚焦、端口按需展示、手动布局保存；无需新业务抽象。

## 用户故事

- V1 看懂多路关系：首次生成时按依赖从左到右排布，同层独立节点纵向排列，merge/collect/join保持原端口顺序。节点不重叠；边路径使用ELK折点，绕开节点。已有布局不自动覆盖，可点“整理布局”。
- V2 追踪一条连接：选中节点突出直接上下游和对应边，其余淡化；悬停/键盘聚焦端口突出该端口连接并标注来源→目的；可退出聚焦。概览少文字，选择/悬停/显式显示端口时查看完整名称，handles始终可连。
- V3 修改后继续工作：新增节点/改端口不覆盖手动位置；整理仅更新ViewState。异步布局期间继续编辑或拖动不得被迟到结果覆盖。运行状态变化不重排。重开保存的坐标、视口、路由与显示端口选项；过期路由不用。
- V4 真实产品验收：六节点三路示例和动态端口在1440/1024操作检查截图，布局前后IR、版本和执行结果相同；手动拖动、端口变化、重开、异步旧结果均有验证。

## 交接

client/canvas-layout.ts 复用elkjs的layered RIGHT + ORTHOGONAL。输入Definition及ReactFlow实测LayoutNode（id,width,height,inputs/outputs的id,x,y,width,height），输出positions和edge-${index}对应折点数组。FIXED_POS保持真实端口几何，不为少交叉改IR。无效草稿悬空边跳过，执行校验仍由flow负责。

useCanvasLayout负责测量、异步请求/错误、采用坐标及路由；WorkflowCanvas负责图编辑与关系聚焦；WorkflowNode负责卡片/端口显示，WorkflowEdge负责真实折点绘制。ViewState新增可选routing(signature/routes)、showPorts；flow.saveLayout校验有限坐标及路由，不改变定义。

不包含自动建立业务分组、虚构汇合节点、公共线编辑系统、任意规模图性能承诺。用户手动拖动后过期路由暂回退普通边，再点整理可全局规划。ELK按需加载，避免增加首屏包。

参考：React Flow ELK多端口实例 https://reactflow.dev/examples/layout/elkjs-multiple-handles；ELK Layered https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html。沿用Geist暗色和现有shadcn primitives。
