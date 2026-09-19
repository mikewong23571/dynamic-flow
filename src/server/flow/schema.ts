import Ajv from 'ajv';
import type { Json } from '../../shared/records.ts';

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  strictSchema: true,
  allowUnionTypes: true,
  coerceTypes: false,
});
export function schemaIssue(schema: Json): string | undefined {
  try {
    ajv.compile(schema as object | boolean);
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
  const validate = ajv.compile(schema as object | boolean);
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
