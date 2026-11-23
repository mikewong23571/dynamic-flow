import { createRequire } from 'node:module';
import { Type } from '@earendil-works/pi-ai';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const evidenceDir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(evidenceDir, '../../../package.json'));
const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true, coerceTypes: false, removeAdditional: false, useDefaults: false });
const schema = Type.Object({
  kind: Type.Literal('groupBy'),
  keys: Type.Array(Type.String(), { minItems: 1 }),
}, { additionalProperties: false });
const check = ajv.compile(schema);
const good = check({ kind: 'groupBy', keys: ['repositoryId', 'baselineId'] });
const bad = check({ kind: 'groupBy', keys: [] });
const errors = structuredClone(check.errors);
const refCheck = ajv.compile({ type: 'object', properties: { sourcePath: { type: 'string' }, amount: { type: 'number' } }, required: ['sourcePath', 'amount'], additionalProperties: false });
const missingPathAccepted = refCheck({ sourcePath: '/orders/no-such-id', amount: 3 });
const badValue = { sourcePath: '/orders/id', amount: '3' };
const stringRejected = !refCheck(badValue);
const mutate = new Ajv({ coerceTypes: true, removeAdditional: true }).compile({ type: 'object', properties: { amount: { type: 'number' } }, additionalProperties: false });
const value = { amount: '3', surplus: 'silently dropped' };
const mutationValid = mutate(value);
const report = { node: process.version, ajv: require('ajv/package.json').version, schema, good, bad, errors, missingPathAccepted, stringRejected, pureValidationKeptOriginal: badValue.amount === '3', mutationValid, mutatedValue: value };
await writeFile(resolve(evidenceDir, 'schema-output.json'), JSON.stringify(report, null, 2) + '\n');
if (!good || bad || !missingPathAccepted || !stringRejected || !report.pureValidationKeptOriginal) throw Error('Unexpected schema probe result');
console.log(JSON.stringify(report));
