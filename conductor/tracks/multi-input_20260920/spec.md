# 多路汇合、具名收集和按键关联

用户要求三类全部支持，本轮实现到画布、作者与执行，不扩展生产平台。继承 docs/design.md、user-stories.md、implementation-map.md 与 Conductor workflow；先交接、模块实现，再联测。

## 用户故事与验收

- C1 多路汇合：三个或更多节点输出接入同一 merge，明确端口顺序，合并所有项。上游完成前等待，空路不阻塞，失败路阻断；旧两路 merge 不改变含义。
- C2 具名收集：调查/修复/验证结果接入 collect，返回一项 {investigation:[...],remediation:[...],verification:[...]}，名称保留、空路为[]、单项也不隐式拆包装；下游通过纯表达式解构使用。
- C3 按键关联：join 用左右各自字段路径匹配，支持 inner/left/right/full；输出每项 {left:左值|null,right:右值|null}。保留精确参与行的来源，输出schema失败阻断下游。
- C4 修改与复用：在画布配置具名端口、增删/改名并同步已有连接，配置join类型/键/重复策略，真实保存/运行/重开；Assistant生成相同定义，返回局部错误。

## 固定交接

FlowNode.functionName 新增 collect/join，merge增加可选inputNames。共享字段已在records.ts；shared/node-ports.ts为前端/校验/运行器共用的纯端口语义，不依赖外部库。配置的新集合函数 collectionFunction=true，要求mode=all，operation可省略或aggregate（拒绝map/flatMap），按集合调用一次。

- merge未指定inputNames时旧left/right与旧operation行为保持；设置inputNames即新多路汇合，至少2个非空无重复端口。按inputNames顺序，再按该路原顺序输出所有输入项，不按上游完成时序排序；每个输出项仅继承其对应输入来源。
- collect要求inputNames至少2个有效端口。同上等待规则，输出一项对象，每个字段为该路值数组；继承整次输入来源。即使每路只有一项仍保留数组，避免不稳定输出类型。
- join固定left/right两个端口，不接受inputNames。join配置必须含type、leftKey/rightKey路径数组、duplicates=all/error。空路径表示整值，路径仅自身属性，缺失/null/对象/数组键报错；键限string/finite number/boolean，类型严格区分，数字1与字符串1不匹配。duplicates=all做全部配对（SQL式笛卡尔展开），error在任一路相同类型键重复时失败，即使对侧无匹配。默认UI all并明确文案。
- join顺序固定：按左路顺序展开每个键对应的右路原顺序；inner只匹配，left/full保留左缺配项，right/full最后追加右路未匹配项。右缺配left=null，左缺配right=null；right连接的匹配行仍沿左路顺序。这是有限数组顺序，不按输出完成时间。

## Schema 与基数

新集合函数 inputSchema 约束具名对象 {port:该路所有值数组}，与原多端口普通aggregate的扁平数组不同；这是明确的函数调用契约。输入Schema可为每路写 properties.<port>.items，静态连线只拒绝明确顶层不相容，不推断完整子类型。

expectedOutput：新merge为整批拼接值数组；join为整批{left,right}行数组，验证后分发为多项端口输出；collect为具名数组对象，作为一项端口输出。它们是明确的集合原语，与wait/branch类似有固定端口分发规则；不能套普通aggregate“返回数组总是单项”的描述。每路端口仍只接一条边，多上游用多端口表达。

输出merge/join的静态连接取expectedOutput.items，collect取整个schema；下游aggregate再包为数组。所有实际输入/输出经既有Ajv检查；错误保留实例、阻断依赖，不写假业务进展。节点试验、retry、preview、trials、来源和冻结版本必须继续可用。

## 模块与非目标

后端负责flow集合配置和schema连线、runs确定性计算及来源；前端负责Inspector字段/端口编辑、ReactFlow handles/连接同步、节点摘要；root负责共享合同、Assistant工具、故事文档和最终联测。复用现有schema、控件、DAG调度，无新框架。不支持模糊关联、跨工作项隐式读取、时间窗口join、流式无限集合、通用SQL、复合键（可用上游纯表达式显式构造字符串键）。
