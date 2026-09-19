import type {
  Expression,
  Pattern,
  PureFunction,
} from '../../shared/expressions.js';
import type { Json } from '../../shared/records.js';

export interface ExpressionIssue {
  field: string;
  message: string;
}
const functions: Record<PureFunction, number> = {
  add: 2,
  subtract: 2,
  multiply: 2,
  divide: 2,
  equal: 2,
  greaterThan: 2,
  lessThan: 2,
  and: 2,
  or: 2,
  not: 1,
  concat: 2,
  length: 1,
};
const own = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key);
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(value);
const jsonType = (value: Json) =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const fail = (path: string, message: string): never => {
  throw new Error(`${path}: ${message}`);
};

/** Checks untrusted serialized syntax and lexical scope, without evaluating data. */
export function checkExpression(expression: unknown): ExpressionIssue[] {
  const issues: ExpressionIssue[] = [];
  const add = (field: string, message: string) =>
    issues.push({ field, message });
  let count = 0;
  function budget(path: string, depth: number) {
    if (++count > 2000 || depth > 64) {
      if (issues.length < 100)
        add(path, '表达式最多 2000 项、嵌套最多 64 层。');
      return false;
    }
    return true;
  }
  function json(value: unknown, path: string, depth: number): void {
    if (!budget(path, depth)) return;
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    )
      return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => json(item, `${path}[${i}]`, depth + 1));
      return;
    }
    if (object(value)) {
      for (const [key, item] of Object.entries(value))
        json(item, `${path}[${JSON.stringify(key)}]`, depth + 1);
      return;
    }
    add(path, '需要有效 JSON 值，数字必须有限。');
  }
  function pattern(
    value: unknown,
    path: string,
    depth: number,
    names = new Set<string>(),
  ): Set<string> {
    if (!budget(path, depth)) return names;
    if (!object(value)) {
      add(path, '需要模式对象。');
      return names;
    }
    function bind(name: unknown, at: string) {
      if (!identifier(name))
        add(at, '需要非空变量名（字母、数字、下划线，不能以数字开头）。');
      else if (names.has(name)) add(at, `模式重复绑定变量 ${name}。`);
      else names.add(name);
    }
    switch (value.kind) {
      case 'wildcard':
        break;
      case 'bind':
        bind(value.name, `${path}.name`);
        break;
      case 'literal':
        json(value.value, `${path}.value`, depth + 1);
        break;
      case 'type':
        if (
          !['null', 'boolean', 'number', 'string', 'array', 'object'].includes(
            value.valueType as string,
          )
        )
          add(`${path}.valueType`, '请选择 JSON 类型。');
        if (value.name !== undefined) bind(value.name, `${path}.name`);
        break;
      case 'object':
        if (!object(value.fields))
          add(`${path}.fields`, '需要字段与模式的映射。');
        else
          for (const [key, child] of Object.entries(value.fields))
            pattern(
              child,
              `${path}.fields[${JSON.stringify(key)}]`,
              depth + 1,
              names,
            );
        if (value.rest !== undefined) bind(value.rest, `${path}.rest`);
        break;
      case 'array':
        if (!Array.isArray(value.items)) add(`${path}.items`, '需要模式数组。');
        else
          value.items.forEach((child, i) =>
            pattern(child, `${path}.items[${i}]`, depth + 1, names),
          );
        if (value.rest !== undefined) bind(value.rest, `${path}.rest`);
        break;
      default:
        add(`${path}.kind`, '不支持的模式类型。');
    }
    return names;
  }
  function visit(
    value: unknown,
    path: string,
    scope: Set<string>,
    depth: number,
  ): void {
    if (!budget(path, depth)) return;
    if (!object(value)) {
      add(path, '需要表达式对象。');
      return;
    }
    const child = (key: string, local = scope) =>
      visit(value[key], `${path}.${key}`, local, depth + 1);
    const bound = (key: string) =>
      new Set([...scope, ...pattern(value[key], `${path}.${key}`, depth + 1)]);
    switch (value.kind) {
      case 'literal':
        json(value.value, `${path}.value`, depth + 1);
        break;
      case 'variable':
        if (!identifier(value.name) || !scope.has(value.name))
          add(`${path}.name`, `变量 ${String(value.name)} 不在当前作用域。`);
        if (
          value.path !== undefined &&
          (!Array.isArray(value.path) ||
            !value.path.every(
              (p) =>
                typeof p === 'string' ||
                (typeof p === 'number' && Number.isSafeInteger(p) && p >= 0),
            ))
        )
          add(`${path}.path`, '路径必须是字段名称或非负整数索引组成的数组。');
        break;
      case 'object':
        if (!object(value.fields))
          add(`${path}.fields`, '需要字段与表达式的映射。');
        else
          for (const [key, expr] of Object.entries(value.fields))
            visit(
              expr,
              `${path}.fields[${JSON.stringify(key)}]`,
              scope,
              depth + 1,
            );
        break;
      case 'array':
        if (!Array.isArray(value.items))
          add(`${path}.items`, '需要表达式数组。');
        else
          value.items.forEach((expr, i) =>
            visit(expr, `${path}.items[${i}]`, scope, depth + 1),
          );
        break;
      case 'call':
        if (
          typeof value.function !== 'string' ||
          !own(functions, value.function)
        )
          add(`${path}.function`, '不支持的纯函数。');
        if (!Array.isArray(value.args))
          add(`${path}.args`, '需要参数表达式数组。');
        else {
          if (
            typeof value.function === 'string' &&
            own(functions, value.function) &&
            value.args.length !== functions[value.function as PureFunction]
          )
            add(
              `${path}.args`,
              `函数 ${value.function} 需要 ${functions[value.function as PureFunction]} 个参数。`,
            );
          value.args.forEach((arg, i) =>
            visit(arg, `${path}.args[${i}]`, scope, depth + 1),
          );
        }
        break;
      case 'pipe':
        child('input');
        if (!Array.isArray(value.steps))
          add(`${path}.steps`, '需要步骤表达式数组。');
        else
          value.steps.forEach((step, i) =>
            visit(
              step,
              `${path}.steps[${i}]`,
              new Set([...scope, 'value']),
              depth + 1,
            ),
          );
        break;
      case 'map':
      case 'flatMap':
      case 'filter':
        child('input');
        child(value.kind === 'filter' ? 'predicate' : 'body', bound('binding'));
        break;
      case 'reduce': {
        child('input');
        child('initial');
        const names = pattern(value.binding, `${path}.binding`, depth + 1);
        if (!identifier(value.accumulator))
          add(`${path}.accumulator`, '需要有效累加器变量名。');
        else {
          if (names.has(value.accumulator))
            add(`${path}.accumulator`, '累加器与逐项解构不能绑定同名变量。');
          names.add(value.accumulator);
        }
        child('body', new Set([...scope, ...names]));
        break;
      }
      case 'let':
        child('value');
        child('body', bound('pattern'));
        break;
      case 'match':
        child('value');
        if (!Array.isArray(value.cases))
          add(`${path}.cases`, '需要有序分支数组。');
        else
          value.cases.forEach((branch, i) => {
            const at = `${path}.cases[${i}]`;
            if (!object(branch)) {
              add(at, '需要匹配分支对象。');
              return;
            }
            const local = new Set([
              ...scope,
              ...pattern(branch.pattern, `${at}.pattern`, depth + 1),
            ]);
            if (branch.when !== undefined)
              visit(branch.when, `${at}.when`, local, depth + 1);
            visit(branch.then, `${at}.then`, local, depth + 1);
          });
        if (value.otherwise !== undefined) child('otherwise');
        break;
      default:
        add(`${path}.kind`, '不支持的表达式类型。');
    }
  }
  visit(expression, 'expression', new Set(['input']), 0);
  return issues;
}

function equal(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a))
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => equal(v, b[i]))
    );
  if (object(a) && object(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((k) => own(b, k) && equal(a[k] as Json, b[k] as Json))
    );
  }
  return false;
}
type Scope = Map<string, Json>;
function match(pattern: Pattern, value: Json): Scope | undefined {
  const bindings: Scope = new Map();
  function apply(p: Pattern, v: Json): boolean {
    switch (p.kind) {
      case 'wildcard':
        return true;
      case 'bind':
        bindings.set(p.name, v);
        return true;
      case 'literal':
        return equal(p.value, v);
      case 'type':
        if (jsonType(v) !== p.valueType) return false;
        if (p.name) bindings.set(p.name, v);
        return true;
      case 'object':
        if (!object(v)) return false;
        for (const [key, child] of Object.entries(p.fields))
          if (!own(v, key) || !apply(child, v[key] as Json)) return false;
        if (p.rest)
          bindings.set(
            p.rest,
            Object.fromEntries(
              Object.entries(v).filter(([k]) => !own(p.fields, k)),
            ) as Json,
          );
        return true;
      case 'array':
        if (
          !Array.isArray(v) ||
          (p.rest ? v.length < p.items.length : v.length !== p.items.length)
        )
          return false;
        if (!p.items.every((child, i) => apply(child, v[i]))) return false;
        if (p.rest) bindings.set(p.rest, v.slice(p.items.length));
        return true;
    }
  }
  return apply(pattern, value) ? bindings : undefined;
}
const boolean = (value: Json, path: string): boolean =>
  typeof value === 'boolean' ? value : fail(path, '必须返回布尔值。');
const array = (value: Json, path: string): Json[] =>
  Array.isArray(value) ? value : fail(path, '需要数组。');
function invoke(fn: PureFunction, args: Json[], path: string): Json {
  const number = (index: number): number =>
    typeof args[index] === 'number' && Number.isFinite(args[index])
      ? (args[index] as number)
      : fail(`${path}.args[${index}]`, '需要有限数字。');
  const finite = (value: number) =>
    Number.isFinite(value) ? value : fail(path, '运算结果必须是有限数字。');
  switch (fn) {
    case 'add':
      return finite(number(0) + number(1));
    case 'subtract':
      return finite(number(0) - number(1));
    case 'multiply':
      return finite(number(0) * number(1));
    case 'divide': {
      const a = number(0),
        b = number(1);
      if (b === 0) fail(path, '不能除以零。');
      return finite(a / b);
    }
    case 'equal':
      return equal(args[0], args[1]);
    case 'greaterThan':
      return number(0) > number(1);
    case 'lessThan':
      return number(0) < number(1);
    case 'and': {
      const a = boolean(args[0], `${path}.args[0]`),
        b = boolean(args[1], `${path}.args[1]`);
      return a && b;
    }
    case 'or': {
      const a = boolean(args[0], `${path}.args[0]`),
        b = boolean(args[1], `${path}.args[1]`);
      return a || b;
    }
    case 'not':
      return !boolean(args[0], `${path}.args[0]`);
    case 'concat':
      if (typeof args[0] === 'string' && typeof args[1] === 'string')
        return args[0] + args[1];
      if (Array.isArray(args[0]) && Array.isArray(args[1]))
        return [...args[0], ...args[1]];
      return fail(path, 'concat 需要两个字符串或两个数组。');
    case 'length':
      if (typeof args[0] === 'string' || Array.isArray(args[0]))
        return args[0].length;
      return fail(path, 'length 需要字符串或数组。');
  }
}

/** Evaluates the bounded pure subset. The result never aliases the caller's input. */
export function evaluateExpression(expression: Expression, input: Json): Json {
  const issues = checkExpression(expression);
  if (issues.length) fail(issues[0].field, issues[0].message);
  let evaluations = 0;
  function evaluate(expr: Expression, scope: Scope, path: string): Json {
    if (++evaluations > 100000)
      fail(path, '本次表达式求值超过 100000 步。请缩小输入集合。');
    const child = (value: Expression, key: string, local = scope) =>
      evaluate(value, local, `${path}.${key}`);
    const destructure = (pattern: Pattern, value: Json, at: string) => {
      const bindings = match(pattern, value);
      if (!bindings) fail(`${path}.${at}`, '输入与解构模式不匹配。');
      return new Map([...scope, ...bindings!]);
    };
    switch (expr.kind) {
      case 'literal':
        return expr.value;
      case 'variable': {
        let value: Json = scope.get(expr.name) as Json;
        for (const [i, key] of (expr.path ?? []).entries()) {
          if (
            value === null ||
            typeof value !== 'object' ||
            !own(value, key) ||
            (Array.isArray(value) &&
              !(typeof key === 'number' || /^(0|[1-9]\d*)$/.test(key)))
          )
            fail(`${path}.path[${i}]`, `路径 ${String(key)} 不存在。`);
          value = (value as Record<string | number, Json>)[key];
        }
        return value;
      }
      case 'object':
        return Object.fromEntries(
          Object.entries(expr.fields).map(([key, value]) => [
            key,
            child(value, `fields[${JSON.stringify(key)}]`),
          ]),
        );
      case 'array':
        return expr.items.map((item, i) => child(item, `items[${i}]`));
      case 'call':
        return invoke(
          expr.function,
          expr.args.map((arg, i) => child(arg, `args[${i}]`)),
          path,
        );
      case 'pipe': {
        let value = child(expr.input, 'input');
        expr.steps.forEach((step, i) => {
          value = child(
            step,
            `steps[${i}]`,
            new Map([...scope, ['value', value]]),
          );
        });
        return value;
      }
      case 'map':
      case 'flatMap':
      case 'filter': {
        const values = array(child(expr.input, 'input'), `${path}.input`),
          result: Json[] = [];
        values.forEach((value, i) => {
          const local = destructure(expr.binding, value, `binding (item ${i})`);
          if (expr.kind === 'filter') {
            if (
              boolean(
                child(expr.predicate, 'predicate', local),
                `${path}.predicate (item ${i})`,
              )
            )
              result.push(value);
          } else {
            const mapped = child(expr.body, 'body', local);
            if (expr.kind === 'flatMap')
              for (const child of array(mapped, `${path}.body (item ${i})`))
                result.push(child);
            else result.push(mapped);
          }
        });
        return result;
      }
      case 'reduce': {
        const values = array(child(expr.input, 'input'), `${path}.input`);
        let acc = child(expr.initial, 'initial');
        values.forEach((value, i) => {
          const local = destructure(expr.binding, value, `binding (item ${i})`);
          local.set(expr.accumulator, acc);
          acc = child(expr.body, 'body', local);
        });
        return acc;
      }
      case 'let':
        return child(
          expr.body,
          'body',
          destructure(expr.pattern, child(expr.value, 'value'), 'pattern'),
        );
      case 'match': {
        const value = child(expr.value, 'value');
        for (const [i, branch] of expr.cases.entries()) {
          const bindings = match(branch.pattern, value);
          if (!bindings) continue;
          const local = new Map([...scope, ...bindings]);
          if (
            branch.when !== undefined &&
            !boolean(
              child(branch.when, `cases[${i}].when`, local),
              `${path}.cases[${i}].when`,
            )
          )
            continue;
          return child(branch.then, `cases[${i}].then`, local);
        }
        return expr.otherwise !== undefined
          ? child(expr.otherwise, 'otherwise')
          : fail(path, '未匹配任何分支，且未设置 otherwise。');
      }
    }
  }
  return structuredClone(
    evaluate(expression, new Map([['input', input]]), 'expression'),
  );
}
