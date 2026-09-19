import type { Json } from './records.js';

/** Serializable pure expressions; variable bindings never contain executable JS. */
export type Pattern =
  | { kind: 'wildcard' }
  | { kind: 'bind'; name: string }
  | { kind: 'literal'; value: Json }
  | {
      kind: 'type';
      valueType: 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object';
      name?: string;
    }
  | { kind: 'object'; fields: Record<string, Pattern>; rest?: string }
  | { kind: 'array'; items: Pattern[]; rest?: string };

export type PureFunction =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'equal'
  | 'greaterThan'
  | 'lessThan'
  | 'and'
  | 'or'
  | 'not'
  | 'concat'
  | 'length';

export type Expression =
  | { kind: 'literal'; value: Json }
  | { kind: 'variable'; name: string; path?: (string | number)[] }
  | { kind: 'object'; fields: Record<string, Expression> }
  | { kind: 'array'; items: Expression[] }
  | { kind: 'call'; function: PureFunction; args: Expression[] }
  | { kind: 'pipe'; input: Expression; steps: Expression[] }
  | {
      kind: 'map' | 'flatMap';
      input: Expression;
      binding: Pattern;
      body: Expression;
    }
  | {
      kind: 'filter';
      input: Expression;
      binding: Pattern;
      predicate: Expression;
    }
  | {
      kind: 'reduce';
      input: Expression;
      initial: Expression;
      accumulator: string;
      binding: Pattern;
      body: Expression;
    }
  | { kind: 'let'; value: Expression; pattern: Pattern; body: Expression }
  | {
      kind: 'match';
      value: Expression;
      cases: { pattern: Pattern; when?: Expression; then: Expression }[];
      otherwise?: Expression;
    };
