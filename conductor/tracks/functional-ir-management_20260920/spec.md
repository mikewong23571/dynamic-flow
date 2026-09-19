# 管理页与函数式 IR

用户已批准管理页审计整改，并要求把函数式语言的核心组合子、模式匹配和解构引入 IR。本轮保持单进程原型，不建设语言平台。

## 可验收故事

- M1 找到工作项：至少 12 条混合状态/长短标题记录，工作项标题为主，业务编号为辅，阶段和状态不重复；等待、异常与最近业务进展可辨；分页和轮询不打断阅读。
- M2 维护流水线：统一命名“流水线”，按名称搜索、分页、未归档/已归档、打开、重命名、归档恢复，修改时间与次要操作对齐；不把作者长指令铺满条目。
- M3 一套控件：正式 src 使用 shadcn/Radix Tabs、菜单、表格、输入等，键盘箭头/Enter/Escape 可用，1440/1024 实际截图验证；旧工作区基本操作继续可用。
- FP1 组合纯数据变换：无需任意 JS，用 pipe / map / filter / flatMap / reduce 表达筛选、投影与有初值的顺序归约；空集合行为明确，保留输入顺序与来源。
- FP2 分类与解构：有序 match，支持 literal/type/object/array/wildcard/bind 模式、对象/数组 rest、守卫、显式兜底；let 用同一模式解构并绑定局部变量。未匹配/缺字段/类型错误明确失败，下游阻断。
- FP3 人与 Agent 共用定义：画布节点展示紧凑语义摘要，配置面板可通过结构化控件修改常用组合与表达式，不要求编辑源码/JSON；Assistant 工具可保存相同表达式。版本、schema、运行结果和重新打开闭环。

## 非目标

任意 JS、完整函数式语言、闭包/递归/高阶函数值、隐式副作用、自动并行 reduce、完整类型推导、通用 CRUD 页面框架、生产权限隔离。Agent、wait、milestone 仍显式表达模型调用、时间与业务影响。

## 交接与失败

类型以 src/shared/expressions.ts 为准。functionName=expression 使用 node.expression，且显式 operation=map/flatMap/aggregate。map 输入单值，aggregate 输入整批值数组，根变量 input 对应该实际参数；expectedOutput 校验表达式最终返回值。表达式集合组合子只处理值数组，不自动展开节点端口；仅节点 flatMap 展开一层。旧函数与定义保持兼容。

pipe.input 先求值，steps 依次求值，每步局部变量 value 表示前一步结果；空 steps 为 identity。map/flatMap/filter 的 binding 在每项新作用域解构，失败不静默跳过；filter predicate 和 match when 必须返回布尔。reduce 从 initial 开始，按输入顺序把 accumulator 和 binding 放入新作用域；空数组返回初值，不能声称结合律或并行归约。局部变量遮蔽外层，但同一模式重复绑定、与 accumulator 同名均为配置错误。

对象模式按子集匹配，所列字段必须存在；rest 为其余字段。数组模式无 rest 时长度精确，有 rest 时为前缀匹配并绑定剩余数组。match 采用第一个匹配且守卫为真的 case，未命中有 otherwise 用 otherwise，无 otherwise 明确失败；不推断穷尽性。let 解构失败明确报错。路径只读取自身属性，缺失报错，不把缺失混成 null。纯运算严格类型，无隐式字符串/数字转换，非有限数/除零报错。equal 对 JSON 结构比较，对象字段顺序无关。

保存不完整草稿允许，运行与 Assistant update_flow 必须先通过 checkDefinition。校验报告 nodeId + expression 字段路径；运行错误保留在节点实例中，schema 错误不得绕过。表达式依赖只有 shared 类型与普通 TypeScript，不增加求值框架。函数可解释语义由现有 JSON/Ajv 合同包围，不改变业务证据与权限边界。

示例：aggregate 输入 [{severity:'high',score:3},{severity:'low',score:1}]，pipe(input → filter severity=high → map 解构 score → reduce add 初值0) 得到 3。match {status:'affected',product:'A'} 通过对象模式绑定 product，生成 {action:'investigate',product:'A'}；其它值显式 otherwise={action:'review'}。
