/* Tiny JSON Schema builder + validator for agent tool inputs (the subset the
   tools use: object / string / number / integer / boolean / array / enum). */

export type JSONSchema = {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'null' | ('object' | 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'null')[];
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: (string | number | boolean | null)[];
  additionalProperties?: boolean | JSONSchema;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  default?: unknown;
  anyOf?: JSONSchema[];
};

type Props = Record<string, JSONSchema & { optional?: boolean }>;

/** Object schema. Every property is required unless marked with `opt(...)`. */
export function obj(props: Props, description?: string): JSONSchema {
  const properties: Record<string, JSONSchema> = {};
  const required: string[] = [];
  for (const [k, v] of Object.entries(props)) {
    const { optional, ...rest } = v;
    properties[k] = rest;
    if (!optional) required.push(k);
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false, ...(description ? { description } : {}) };
}

export const opt = <T extends JSONSchema>(s: T): T & { optional: true } => ({ ...s, optional: true });
export const str = (description?: string): JSONSchema => ({ type: 'string', ...(description ? { description } : {}) });
export const num = (description?: string): JSONSchema => ({ type: 'number', ...(description ? { description } : {}) });
export const int = (description?: string, minimum?: number): JSONSchema => ({ type: 'integer', ...(description ? { description } : {}), ...(minimum != null ? { minimum } : {}) });
export const bool = (description?: string): JSONSchema => ({ type: 'boolean', ...(description ? { description } : {}) });
export const arr = (items: JSONSchema, description?: string): JSONSchema => ({ type: 'array', items, ...(description ? { description } : {}) });
export const enm = <T extends string>(values: readonly T[], description?: string): JSONSchema => ({ type: 'string', enum: [...values], ...(description ? { description } : {}) });
/** Free-form object (any keys). */
export const anyObj = (description?: string): JSONSchema => ({ type: 'object', additionalProperties: true, ...(description ? { description } : {}) });
/** Any JSON value. */
export const any = (description?: string): JSONSchema => ({ ...(description ? { description } : {}) });

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function matches(t: string, v: unknown): boolean {
  const actual = typeOf(v);
  if (t === 'number') return actual === 'number' || actual === 'integer';
  return actual === t;
}

/** Validate (and lightly coerce) a value. Returns the list of problems ('' path = root). */
export function validate(schema: JSONSchema, value: unknown, path = ''): string[] {
  const errs: string[] = [];
  const at = path || 'arguments';
  if (schema.anyOf) {
    const ok = schema.anyOf.some((s) => validate(s, value, path).length === 0);
    if (!ok) errs.push(`${at}: does not match any allowed shape`);
    return errs;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matches(t, value))) {
      errs.push(`${at}: expected ${types.join(' or ')}, got ${typeOf(value)}`);
      return errs;
    }
  }
  if (schema.enum && !schema.enum.includes(value as never)) errs.push(`${at}: must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`);
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) errs.push(`${at}: must be ≥ ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errs.push(`${at}: must be ≤ ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errs.push(`${at}: needs at least ${schema.minItems} item(s)`);
    if (schema.items) value.forEach((v, i) => errs.push(...validate(schema.items!, v, `${path}[${i}]`)));
  }
  if (typeOf(value) === 'object' && schema.properties) {
    const o = value as Record<string, unknown>;
    for (const r of schema.required ?? []) if (o[r] === undefined) errs.push(`${path ? path + '.' : ''}${r}: required`);
    for (const [k, v] of Object.entries(o)) {
      const ps = schema.properties[k];
      if (!ps) {
        if (schema.additionalProperties === false) errs.push(`${path ? path + '.' : ''}${k}: unknown property (allowed: ${Object.keys(schema.properties).join(', ')})`);
        continue;
      }
      if (v === undefined) continue;
      errs.push(...validate(ps, v, `${path ? path + '.' : ''}${k}`));
    }
  }
  return errs;
}
