import type { Expression, Pattern, PureFunction } from '../shared/expressions';
export const expressionNames: Record<Expression['kind'], string> = {
  variable: '取值',
  literal: '常量',
  object: '构造对象',
  array: '构造数组',
  call: '纯运算',
  pipe: '依次组合',
  map: '逐项映射',
  filter: '筛选',
  flatMap: '映射并展开',
  reduce: '顺序归约',
  let: '解构绑定',
  match: '模式匹配',
};
export const patternNames: Record<Pattern['kind'], string> = {
  wildcard: '任意值',
  bind: '绑定变量',
  literal: '匹配常量',
  type: '匹配类型',
  object: '对象解构',
  array: '数组解构',
};
export const functionNames: Record<PureFunction, string> = {
  add: '加',
  subtract: '减',
  multiply: '乘',
  divide: '除',
  equal: '结构相等',
  greaterThan: '大于',
  lessThan: '小于',
  and: '并且',
  or: '或者',
  not: '取反',
  concat: '连接',
  length: '长度',
};
export const variable = (name = 'input'): Expression => ({
  kind: 'variable',
  name,
});
export const literal = (
  value: number | string | boolean | null = 0,
): Expression => ({ kind: 'literal', value });
export function newExpression(kind: Expression['kind']): Expression {
  switch (kind) {
    case 'variable':
      return variable();
    case 'literal':
      return literal('');
    case 'object':
      return { kind, fields: { result: variable() } };
    case 'array':
      return { kind, items: [variable()] };
    case 'call':
      return { kind, function: 'equal', args: [variable(), literal('')] };
    case 'pipe':
      return { kind, input: variable(), steps: [variable('value')] };
    case 'map':
    case 'flatMap':
      return {
        kind,
        input: variable(),
        binding: { kind: 'bind', name: 'item' },
        body:
          kind === 'map'
            ? variable('item')
            : { kind: 'array', items: [variable('item')] },
      };
    case 'filter':
      return {
        kind,
        input: variable(),
        binding: { kind: 'bind', name: 'item' },
        predicate: literal(true),
      };
    case 'reduce':
      return {
        kind,
        input: variable(),
        binding: { kind: 'bind', name: 'item' },
        accumulator: 'total',
        initial: literal(0),
        body: {
          kind: 'call',
          function: 'add',
          args: [variable('total'), literal(1)],
        },
      };
    case 'let':
      return {
        kind,
        value: variable(),
        pattern: { kind: 'bind', name: 'item' },
        body: variable('item'),
      };
    case 'match':
      return {
        kind,
        value: variable(),
        cases: [
          {
            pattern: { kind: 'literal', value: 'affected' },
            then: literal('investigate'),
          },
        ],
        otherwise: literal('review'),
      };
  }
}
export function newPattern(kind: Pattern['kind']): Pattern {
  switch (kind) {
    case 'wildcard':
      return { kind };
    case 'bind':
      return { kind, name: 'item' };
    case 'literal':
      return { kind, value: '' };
    case 'type':
      return { kind, valueType: 'string' };
    case 'object':
      return { kind, fields: { value: { kind: 'bind', name: 'item' } } };
    case 'array':
      return { kind, items: [{ kind: 'bind', name: 'item' }], rest: 'rest' };
  }
}
export function expressionSummary(expression?: Expression): string {
  if (!expression) return '配置数据变换';
  if (expression.kind === 'pipe')
    return expression.steps.length
      ? expression.steps.map((step) => expressionNames[step.kind]).join(' → ')
      : '原样传递';
  if (expression.kind === 'call') return functionNames[expression.function];
  if (expression.kind === 'match')
    return `模式匹配 · ${expression.cases.length} 个分支`;
  return expressionNames[expression.kind];
}
export function renameField<T>(
  fields: Record<string, T>,
  old: string,
  name: string,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key === old ? name : key,
      value,
    ]),
  );
}
export function nextField(fields: Record<string, unknown>): string {
  let index = 1;
  while (`field${index}` in fields) index++;
  return `field${index}`;
}
