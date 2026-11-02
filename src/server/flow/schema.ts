import Ajv, { type ValidateFunction } from 'ajv';
import type { Json } from '../../shared/records.ts';

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  strictSchema: true,
  allowUnionTypes: true,
  coerceTypes: false,
});
// Persisted definitions are parsed as new objects. Cache by content, not object identity.
// Drafts share this bounded cache; Ajv must not retain each temporary schema object too.
const validators = new Map<string, ValidateFunction>();
const maxValidators = 128;
function compiled(schema: Json): ValidateFunction {
  const key = JSON.stringify(schema);
  const saved = validators.get(key);
  if (saved) return saved;
  let validate: ValidateFunction;
  try {
    validate = ajv.compile(schema as object | boolean);
  } finally {
    if (schema && typeof schema === 'object')
      ajv.removeSchema(schema as object);
  }
  if (validators.size >= maxValidators)
    validators.delete(validators.keys().next().value!);
  validators.set(key, validate!);
  return validate!;
}
export function schemaIssue(schema: Json): string | undefined {
  try {
    compiled(schema);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
export function validateValue(
  schema: Json | undefined,
  value: Json,
  label: string,
) {
  if (schema === undefined) return;
  const validate = compiled(schema);
  if (!validate(value))
    throw Error(
      `${label}不符合 schema：${ajv.errorsText(validate.errors, { separator: '；' })}`,
    );
}
/** Only reject provably disjoint primitive types, not an attempted schema subtype proof. */
export function incompatibleTypes(
  source: Json | undefined,
  target: Json | undefined,
): boolean {
  if (
    !source ||
    !target ||
    typeof source !== 'object' ||
    typeof target !== 'object' ||
    Array.isArray(source) ||
    Array.isArray(target)
  )
    return false;
  const types = (v: Json | undefined): string[] =>
    typeof v === 'string'
      ? [v]
      : Array.isArray(v)
        ? v.filter((x): x is string => typeof x === 'string')
        : [];
  const a = types(source.type),
    b = types(target.type);
  return (
    !!a.length &&
    !!b.length &&
    !a.some((x) =>
      b.some(
        (y) =>
          x === y ||
          (['integer', 'number'].includes(x) &&
            ['integer', 'number'].includes(y)),
      ),
    )
  );
}
