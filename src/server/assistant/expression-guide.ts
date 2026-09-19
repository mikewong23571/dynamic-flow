/** Transport schema stays shallow for compatible model endpoints; flow validates the entire tree. */
export const expressionGuide = `functionName:expression 的 function 节点用 expression 表达纯数据转换，必须明确 operation 和 mode。根变量 input 为这次调用实际输入；不写 JS 源码，不把表达式放到 task/params 中。
表达式形状（kind 及以下字段均需逐字使用）：
- literal: {kind:'literal',value:任意JSON}；variable: {kind:'variable',name:'input',path?:['字段',0]}，缺路径报错，null 是真实值。
- object: {kind:'object',fields:{输出字段:表达式}}；array: {kind:'array',items:[表达式]}。
- call: {kind:'call',function:名称,args:[表达式]}。add/subtract/multiply/divide 为两个数字；equal 为两个JSON结构比较；greaterThan/lessThan 为两个数字；and/or 为两个布尔，not 为一个布尔；concat 为两个字符串或两个数组；length 为一个字符串/数组。无隐式转换，除零失败。
- pipe: {kind:'pipe',input:表达式,steps:[表达式]}，steps 从左到右，每步 variable name:'value' 为前一步结果；空steps原样返回。
- map/flatMap: {kind:'map'或'flatMap',input:数组表达式,binding:模式,body:表达式}。每项绑定后计算body；flatMap要求body返回数组并展开一层。
- filter: {kind:'filter',input:数组表达式,binding:模式,predicate:布尔表达式}。返回原项子集，不把predicate输出当结果。
- reduce: {kind:'reduce',input:数组表达式,initial:初值表达式,accumulator:'total',binding:模式,body:表达式}。严格从左到右，body可引用total与绑定变量，空数组返回初值，不是LLM汇总或并行归约。
- let: {kind:'let',value:表达式,pattern:模式,body:表达式}。解构绑定仅在body有效，解构失败报错。
- match: {kind:'match',value:表达式,cases:[{pattern:模式,when?:布尔表达式,then:表达式}],otherwise?:表达式}。第一个匹配且守卫成立的分支生效；otherwise不含分支绑定，未命中且无otherwise明确失败。
模式形状：{kind:'wildcard'}；{kind:'bind',name:'item'}；{kind:'literal',value:JSON}；{kind:'type',valueType:'null'|'boolean'|'number'|'string'|'array'|'object',name?:'x'}；{kind:'object',fields:{字段:模式},rest?:'剩余字段变量'}；{kind:'array',items:[模式],rest?:'剩余元素变量'}。对象为子集匹配且所列字段必须存在；数组无rest时长度精确，有rest时匹配前缀；同一模式禁止重复绑定，reduce accumulator不得与binding重名。局部可遮蔽外层。
表达式集合操作处理JSON值；节点operation才决定逐项/批量调用和输出端口展开。aggregate + expression map/filter 返回一个数组值；需要向下游逐项处理时另用节点flatMap明确展开该数组。schema始终约束实际调用参数/最终返回值，不声称静态推导整个表达式。
例：整批数值求和使用 kind:function,functionName:expression,mode:all,operation:aggregate,expression:{kind:'reduce',input:{kind:'variable',name:'input'},initial:{kind:'literal',value:0},accumulator:'sum',binding:{kind:'bind',name:'n'},body:{kind:'call',function:'add',args:[{kind:'variable',name:'sum'},{kind:'variable',name:'n'}]}}，expectedOutput:{type:'number'}。模型判断仍用Agent；等待/业务进展仍用wait/milestone，不放进纯表达式。`;
