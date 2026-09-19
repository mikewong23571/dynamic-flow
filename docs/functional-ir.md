# 纯函数 IR：组合、模式匹配与解构

本轮规格与验收见 [管理页与函数式 IR](../conductor/tracks/functional-ir-management_20260920/index.md)。下文是实现合同；通过状态以该 track 的证据为准。具体类型位于 [expressions.ts](../src/shared/expressions.ts)，运行记录仍使用现有 Definition / NodeResult。

## 两个层次

流程图描述步骤依赖与外部行为，纯表达式描述一个 Function 节点内部的值变换。Agent 执行模型任务，Wait 等待外部事件，Milestone 记录业务进展；它们不会被藏进函数调用。纯表达式不读取文件、不调用模型、不修改工作项、不改变输入。

`functionName: 'expression'` 节点增加 `expression` 字段。`operation` 必须显式选择；`map` / `flatMap` 配 `mode: each`，`aggregate` 配 `mode: all`。根变量 `input` 是该次调用的实际输入。保留旧 identity / select-fields / merge；不迁移或重写旧定义。

| 层次 | 输入与输出 | 例子 |
| --- | --- | --- |
| 节点 map | 每个输入项调用一次，返回一个值 | 单条记录解构，输出新记录 |
| 节点 aggregate | 整批输入项的值数组调用一次，返回一个值 | 批量筛选后归约为总分 |
| 节点 flatMap | 每项调用一次，返回数组展开为多项 | 将上一步的数组值展开到端口 |
| 表达式 map/filter/reduce | 操作 JSON 数组值，没有运行实例身份 | `filter → map → reduce` 在一个纯节点中组成变换 |

表达式返回数组不会自动在端口展开。`aggregate + filter` 返回一项数组值；要向后续节点逐条分发，显式接一个 `flatMap + identity` 节点。这与既有节点 operation 语义一致。来源记录保守继承整次调用的材料与结果，不声称对数组每个字段做细粒度来源推导。

## 表达式与作用域

所有表达式使用 `kind` 区分，不存 JS 源码。结构化编辑器与 Assistant 均修改相同树。

| 表达式 | 形状与语义 |
| --- | --- |
| literal | `{kind:'literal', value: JSON}`，常量 |
| variable | `{kind:'variable', name, path?: ['字段',0]}`，读取绑定及自身字段；缺失明确失败 |
| object / array | `fields: {字段: 表达式}` / `items: 表达式[]`，构造结果 |
| call | `{kind:'call', function, args}`，调用下表有限纯函数 |
| pipe | `{kind:'pipe', input, steps}`，从左到右组合，每步局部 `value` 是前一步结果；空步骤返回输入 |
| map / flatMap | `{kind, input, binding: 模式, body}`，逐项解构并变换；flatMap 的 body 必须返回数组，展开一层 |
| filter | `{kind:'filter', input, binding: 模式, predicate}`，谓词必须为布尔，保留原项和顺序 |
| reduce | `{kind:'reduce', input, initial, accumulator: 名称, binding: 模式, body}`，有初值的顺序左折叠，空数组返回初值 |
| let | `{kind:'let', value, pattern: 模式, body}`，解构并在 body 引用绑定，失败明确报错 |
| match | `{kind:'match', value, cases:[{pattern, when?, then}], otherwise?}`，选第一个匹配且守卫成立的分支 |

局部绑定可以遮蔽外层；同一模式内不能重复绑定，归约累积变量不能与单项解构变量同名。`input` 并非全局可变状态，`value` 只在 pipe 步骤内有效。分支绑定仅在该分支守卫与结果内可用，不能泄漏到下一分支或 otherwise。未定义变量可在保存检查时定位，真实数据缺字段在执行时定位。

| 纯函数 | 参数 |
| --- | --- |
| add / subtract / multiply / divide | 两个数字；除零及非有限结果失败 |
| equal | 两个 JSON 值，结构比较，对象字段顺序无关 |
| greaterThan / lessThan | 两个数字 |
| and / or / not | 两个 / 两个 / 一个布尔值 |
| concat | 两个字符串，或两个数组 |
| length | 一个字符串或数组 |

函数不做隐式类型转换。`and/or` 是布尔值组合；条件性求值使用 match 的分支，不依赖 JavaScript 的隐式真值。

## 模式与解构

| 模式 | 行为 |
| --- | --- |
| wildcard | 匹配任意值，不绑定变量 |
| bind + name | 匹配任意值并绑定名称 |
| literal + value | JSON 结构相等时匹配 |
| type + valueType + 可选 name | 按 null/boolean/number/string/array/object 匹配，可同时绑定 |
| object + fields + 可选 rest | 递归匹配所列字段，必须存在，允许额外字段；rest 绑定剩余对象 |
| array + items + 可选 rest | 无 rest 要求长度精确；有 rest 为前缀匹配，绑定剩余数组 |

对象与数组模式可以嵌套，适用于 let、集合逐项绑定以及 match。map/filter 的解构失败会失败整次节点调用，不会静默删除数据。match 的不匹配只尝试下一分支；when 必须返回布尔。未命中时采用 otherwise，没有兜底就失败，不擅自推断 null、空数组或“业务正常”。静态检查不证明模式穷尽。

## 具体例子

输入 `[{severity:'high', score:3},{severity:'low', score:1}]`，下面是节点内部表达式的可保存对象表示；用户通过控件或对话编辑，无需手写本段。

```js
{
  kind: 'pipe',
  input: { kind: 'variable', name: 'input' },
  steps: [
    {
      kind: 'filter', input: { kind: 'variable', name: 'value' },
      binding: { kind: 'bind', name: 'finding' },
      predicate: { kind: 'call', function: 'equal', args: [
        { kind: 'variable', name: 'finding', path: ['severity'] },
        { kind: 'literal', value: 'high' }
      ] }
    },
    {
      kind: 'map', input: { kind: 'variable', name: 'value' },
      binding: { kind: 'object', fields: { score: { kind: 'bind', name: 'score' } } },
      body: { kind: 'variable', name: 'score' }
    },
    {
      kind: 'reduce', input: { kind: 'variable', name: 'value' },
      initial: { kind: 'literal', value: 0 }, accumulator: 'total',
      binding: { kind: 'bind', name: 'score' },
      body: { kind: 'call', function: 'add', args: [
        { kind: 'variable', name: 'total' }, { kind: 'variable', name: 'score' }
      ] }
    }
  ]
}
```

节点取 `operation:aggregate`，输入 schema 约束数组元素的 severity/score，输出 schema 为 number。结果为 3；全为 low 则为 0；缺 severity、score 非数字、最终 schema 不匹配均失败并阻断下游。

## 明确边界与参考

这是有限、急切求值的纯表达式集合：没有任意函数值、闭包、递归、惰性流、源码编译、自动并行归约或完整类型推导。图上并发继续由就绪依赖和节点 concurrency 控制。顺序 reduce 可以执行减法等不满足结合律的运算，不能擅自并行化；模型整批汇总仍叫 aggregate。

[JavaScript reduce](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce) 提供顺序累积的语义参考；本项目强制显式初值以统一空集合行为。[类型化数据流](./typed-dataflow.md) 说明节点边界、Schema 与来源。

当前实现限制为表达式/字面量累计 2000 项、嵌套 64 层、一次求值 100000 步；超限给出局部错误，不会产生部分成功输出。这些是本地解释器的可读失败边界，不代表生产资源隔离保证。
