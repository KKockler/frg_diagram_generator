// The editor's Flow… form: the document's line types as a checklist of fields, and the external
// legs picked from them. formToFlow() turns it into a flow spec, flowToForm() loads an example.
import type { FieldType } from '../model/types';
import type { FlowSpec } from './flow';

/** How a checked line type enters the theory. */
export interface FieldChoice {
  /** Charged: has an antifield (its legs and lines carry arrows). */
  complex: boolean;
  /** Fermion (needs complex). */
  grassmann: boolean;
}

export interface FlowForm {
  /** Checked line types, by id. */
  fields: Record<string, FieldChoice>;
  /** External legs: a line type and whether the leg is its antifield. */
  legs: { line: string; anti: boolean }[];
  /** Optional vertex list, one per line, in the names of fieldNames(). Empty: maximal truncation. */
  vertices: string;
  perRow: number;
  /** ⊗ on each line (default), or the diagrams without regulator behind \tilde\partial_t. */
  regulator?: 'insertion' | 'tilde';
}

/** Statistics of the built-in fields; every other line type starts as a real boson. */
const KNOWN: Record<string, FieldChoice> = {
  quark: { complex: true, grassmann: true },
  ghost: { complex: true, grassmann: true },
  nucleon: { complex: true, grassmann: true },
  diquark: { complex: true, grassmann: false },
};

export const defaultChoice = (line: string): FieldChoice => ({ ...(KNOWN[line] ?? { complex: false, grassmann: false }) });

/** FunKit names of the line types (letters and digits, unique); antifields get "bar" appended. */
export function fieldNames(lines: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const id of lines) {
    let base = id.replace(/[^A-Za-z0-9]/g, '');
    if (!/^[A-Za-z]/.test(base)) base = 'f' + base;
    let name = base;
    for (let k = 2; taken.has(name) || taken.has(name + 'bar') || name === 'AnyField'; k++) name = base + k;
    taken.add(name).add(name + 'bar');
    out.set(id, name);
  }
  return out;
}

const words = (s: string) => s.split(/[\s,]+/).filter(Boolean);

/** The flow of a form (to be checked with validateFlow). lineTypes: the document's line types. */
export function formToFlow(form: FlowForm, lineTypes: FieldType[]): unknown {
  const checked = lineTypes.filter((t) => form.fields[t.id]);
  const names = fieldNames(checked.map((t) => t.id));
  const name = (line: string, anti: boolean) => (names.get(line) ?? line) + (anti ? 'bar' : '');
  const vertices = form.vertices
    .split('\n')
    .map(words)
    .filter((v) => v.length);
  return {
    format: 'frg-flow',
    version: 1,
    fields: checked.map((t) => {
      const c = form.fields[t.id];
      return { id: name(t.id, false), line: t.id, ...(c.complex ? { anti: name(t.id, true) } : {}), ...(c.complex && c.grassmann ? { grassmann: true } : {}) };
    }),
    legs: form.legs.map((l) => name(l.line, l.anti)),
    ...(vertices.length ? { vertices } : {}),
    perRow: form.perRow,
    ...(form.regulator === 'tilde' ? { regulator: 'tilde' } : {}),
    // The document's own line types, so custom ones are known.
    lineTypes,
  };
}

/** A form for a flow spec (the examples), with its vertex list in the form's names. */
export function flowToForm(flow: FlowSpec): FlowForm {
  const byName = new Map<string, { line: string; anti: boolean }>();
  const fields: Record<string, FieldChoice> = {};
  for (const f of flow.fields) {
    const line = f.line ?? f.id;
    fields[line] = { complex: !!f.anti, grassmann: !!f.grassmann };
    byName.set(f.id, { line, anti: false });
    if (f.anti) byName.set(f.anti, { line, anti: true });
  }
  const names = fieldNames(Object.keys(fields));
  const rename = (n: string) => {
    const l = byName.get(n)!;
    return names.get(l.line)! + (l.anti ? 'bar' : '');
  };
  return {
    fields,
    legs: flow.legs.map((n) => byName.get(n)!),
    vertices: (flow.vertices ?? []).map((v) => v.map(rename).join(' ')).join('\n'),
    perRow: flow.perRow ?? 4,
    regulator: flow.regulator ?? 'insertion',
  };
}
