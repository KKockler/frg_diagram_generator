// Flow specs (.flow.json): the theory's fields and the external legs of an n-point function.
// FunKit's C++ engine (github.com/satfra/FunKit, cpplib: the `funkit` binary) derives the one-loop
// flow from the Wetterich equation; flowToSpec() turns its result into a figure spec, one diagram
// per term.
import type { FieldType, VertexType } from '../model/types';
import { DiagramItem, FigureSpec, LegSpec, RING, SpecError, SpecItem, typeTables } from '../spec/spec';

export interface FlowField {
  /** FunKit name of the field (of the field, not the antifield, for a complex pair). */
  id: string;
  /** FunKit name of the antifield: makes the field complex, e.g. "qb" for "q". */
  anti?: string;
  /** Grassmann field (needs "anti"). */
  grassmann?: boolean;
  /** Line type it is drawn with (see `frg list`). Default: the id. */
  line?: string;
  /** TeX in the Γ subscript. Default: the line type's TeX. */
  tex?: string;
  /** TeX of the antifield. Default: \bar{tex}. */
  antiTex?: string;
}

export interface FlowSpec {
  format: 'frg-flow';
  version: 1;
  fields: FlowField[];
  /** External legs of the n-point function, by FunKit name (field or antifield). */
  legs: string[];
  /** Allowed vertices (lists of FunKit names). Default: every vertex a one-loop flow can contain. */
  vertices?: string[][];
  /** Left-hand side, TeX. Default \partial_t\Gamma^{(n)}_{…} =. */
  lhs?: string;
  /** Diagrams per row. Default 4. */
  perRow?: number;
  /**
   * "insertion" (default): one term per regulator position, ⊗ on the line. "tilde": the diagrams
   * without regulator, combined, behind \tilde\partial_t (which acts on the regulator only).
   */
  regulator?: 'insertion' | 'tilde';
  /** Passed on to the figure spec. */
  style?: FigureSpec['style'];
  lineTypes?: FieldType[];
  vertexTypes?: VertexType[];
  regulatorKind?: string;
  vertex?: string;
  rowGap?: number;
  align?: 'left' | 'center';
}

/** One FunKit object: an indexed tensor, or a scalar coefficient. */
type FkObject = { type: string; legs: [string, number][] } | { prefactor: number } | { type: 'number'; value: number };
export interface FunkitInput {
  equation: FkObject[][];
  derivatives: [string, number][];
  setup: Record<string, unknown>;
}
export interface FunkitOutput {
  equation: FkObject[][];
}

const FLOW_KEYS = ['$schema', 'format', 'version', 'fields', 'legs', 'vertices', 'lhs', 'perRow', 'regulator', 'style', 'lineTypes', 'vertexTypes', 'regulatorKind', 'vertex', 'rowGap', 'align'];
const FIELD_KEYS = ['id', 'anti', 'grassmann', 'line', 'tex', 'antiTex'];
/** Label of the first external leg; FunKit's own labels stay below. */
const LEG0 = 1001;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const list = (xs: Iterable<string>) => [...xs].map((x) => `"${x}"`).join(', ');

/** Every FunKit name with the field it belongs to and whether it is the antifield. */
function names(flow: FlowSpec): Map<string, { field: FlowField; anti: boolean }> {
  const m = new Map<string, { field: FlowField; anti: boolean }>();
  for (const f of flow.fields) {
    m.set(f.id, { field: f, anti: false });
    if (f.anti) m.set(f.anti, { field: f, anti: true });
  }
  return m;
}

/** Check a parsed flow spec; throws SpecError listing every problem with its JSON path. */
export function validateFlow(raw: unknown): FlowSpec {
  const errs: string[] = [];
  if (!isObj(raw)) throw new SpecError(['flow: expected a JSON object']);
  if (raw.format !== 'frg-flow') errs.push(`format: expected "frg-flow", got ${JSON.stringify(raw.format)}`);
  if (raw.version !== 1) errs.push(`version: expected 1, got ${JSON.stringify(raw.version)}`);
  for (const k of Object.keys(raw)) if (!FLOW_KEYS.includes(k)) errs.push(`${k}: unknown key (allowed: ${list(FLOW_KEYS)})`);
  const flow = raw as unknown as FlowSpec;
  const lineTypes = typeTables({ fields: Array.isArray(flow.lineTypes) ? flow.lineTypes : [] }).fields;
  const seen = new Set<string>();
  const ident = /^[A-Za-z][A-Za-z0-9]*$/;
  if (!Array.isArray(flow.fields) || !flow.fields.length) errs.push('fields: expected a non-empty array of fields');
  else
    flow.fields.forEach((f: unknown, i) => {
      const p = `fields[${i}]`;
      if (!isObj(f)) return errs.push(`${p}: expected an object`);
      for (const k of Object.keys(f)) if (!FIELD_KEYS.includes(k)) errs.push(`${p}.${k}: unknown key (allowed: ${list(FIELD_KEYS)})`);
      for (const k of ['id', 'anti'] as const) {
        const v = f[k];
        if (v === undefined && k === 'anti') continue;
        if (typeof v !== 'string' || !ident.test(v)) errs.push(`${p}.${k}: expected a name of letters and digits`);
        else if (seen.has(v) || v === 'AnyField') errs.push(`${p}.${k}: "${v}" is already used`);
        else seen.add(v);
      }
      if (f.grassmann !== undefined && typeof f.grassmann !== 'boolean') errs.push(`${p}.grassmann: expected true or false`);
      if (f.grassmann && f.anti === undefined) errs.push(`${p}.anti: a Grassmann field needs its antifield`);
      const line = f.line ?? f.id;
      if (typeof line !== 'string' || !lineTypes.has(line))
        errs.push(`${p}.line: unknown line type ${JSON.stringify(line)}; set "line" to one of ${list(lineTypes.keys())} or define it under "lineTypes"`);
      for (const k of ['tex', 'antiTex'] as const) if (f[k] !== undefined && typeof f[k] !== 'string') errs.push(`${p}.${k}: expected a TeX string`);
    });
  const checkName = (p: string, n: unknown) => {
    if (typeof n !== 'string' || !seen.has(n)) errs.push(`${p}: unknown field ${JSON.stringify(n)} (known: ${list(seen)})`);
  };
  if (!Array.isArray(flow.legs) || !flow.legs.length) errs.push('legs: expected a non-empty array of external legs');
  else flow.legs.forEach((n, i) => checkName(`legs[${i}]`, n));
  if (flow.vertices !== undefined) {
    if (!Array.isArray(flow.vertices)) errs.push('vertices: expected an array of vertices (lists of fields)');
    else
      flow.vertices.forEach((v: unknown, i) => {
        if (!Array.isArray(v) || v.length < 3) return errs.push(`vertices[${i}]: expected a list of at least three fields`);
        v.forEach((n, j) => checkName(`vertices[${i}][${j}]`, n));
      });
  }
  if (flow.lhs !== undefined && typeof flow.lhs !== 'string') errs.push('lhs: expected a TeX string');
  if (flow.perRow !== undefined && !(Number.isInteger(flow.perRow) && flow.perRow > 0)) errs.push('perRow: expected a positive integer');
  if (flow.regulator !== undefined && flow.regulator !== 'insertion' && flow.regulator !== 'tilde') errs.push('regulator: expected "insertion" or "tilde"');
  if (errs.length) throw new SpecError(errs);
  return flow;
}

/** All multisets of `size` elements of xs, as sorted lists. */
function multisets<T>(xs: T[], size: number, from = 0): T[][] {
  if (size === 0) return [[]];
  const out: T[][] = [];
  for (let i = from; i < xs.length; i++) for (const rest of multisets(xs, size - 1, i)) out.push([xs[i], ...rest]);
  return out;
}

/**
 * The maximal truncation: every vertex with 3 to n + 2 legs (all a one-loop n-point flow can
 * contain) that conserves the charge of each complex field, i.e. has as many fields as antifields.
 */
export function maximalVertices(flow: FlowSpec): string[][] {
  const all = flow.fields.flatMap((f) => (f.anti ? [f.anti, f.id] : [f.id]));
  const out: string[][] = [];
  for (let size = 3; size <= flow.legs.length + 2; size++)
    for (const v of multisets(all, size))
      if (flow.fields.every((f) => !f.anti || v.filter((x) => x === f.id).length === v.filter((x) => x === f.anti).length)) out.push(v);
  return out;
}

/** FunKit input for the flow of the n-point function: n derivatives of ½ STr G ∂ₜR. */
export function funkitInput(flow: FlowSpec, outputFile: string): FunkitInput {
  const derivatives = flow.legs.map((n, i): [string, number] => [n, LEG0 + i]);
  const pairs = flow.fields.map((f) => (f.anti ? [f.anti, f.id] : [f.id, f.id]));
  const decl = (f: FlowField) => Object.fromEntries((f.anti ? [f.anti, f.id] : [f.id]).map((n) => [n, []]));
  return {
    equation: [
      [
        { prefactor: 0.5 },
        ...derivatives.map(([n, l]) => ({ type: 'FDOp', legs: [[n, l]] as [string, number][] })),
        { type: 'Propagator', legs: [['AnyField', 1], ['AnyField', 2]] },
        { type: 'Rdot', legs: [['AnyField', -1], ['AnyField', -2]] },
      ],
    ],
    derivatives,
    setup: {
      debug: 0,
      outputFile,
      output_format: 'json',
      ordered: ['Rdot'],
      // Pairs are declared as (antifield, field); FunKit keeps the key order.
      cFields: flow.fields.filter((f) => !f.grassmann).map(decl),
      gFields: flow.fields.filter((f) => f.grassmann).map(decl),
      truncation: { Rdot: pairs, Propagator: pairs, GammaN: flow.vertices ?? maximalVertices(flow) },
    },
  };
}

/** A coefficient as a fraction p/q (FunKit prints doubles). */
function fraction(x: number): [number, number] {
  for (let q = 1; q <= 10000; q++) {
    const p = Math.round(x * q);
    if (Math.abs(p / q - x) < 1e-9 * Math.max(1, Math.abs(x))) return [p, q];
  }
  throw new Error(`FunKit coefficient ${x} is not a simple fraction`);
}

/** TeX of a coefficient's sign and size: ["-", "\frac{1}{2}"], ["+", ""] for 1. */
function coefficientTex(c: number): [string, string] {
  const [p, q] = fraction(Math.abs(c));
  return [c < 0 ? '-' : '+', q === 1 ? (p === 1 ? '' : String(p)) : `\\frac{${p}}{${q}}`];
}

/** One end of an internal line: the vertex it attaches to and the field (FunKit name) there. */
interface End {
  v: number;
  name: string;
}
interface Line {
  ends: [End, End];
  regulated: boolean;
}

/** Built-in diagrams that are rings, by legs per vertex, with the line of their default regulator. */
const RING_STAMPS: { diagram: string; legs: number[]; regulator: number }[] = [
  { diagram: 'tadpole', legs: [2], regulator: 0 },
  { diagram: 'bubble', legs: [1, 1], regulator: 0 },
  { diagram: 'fish', legs: [2, 2], regulator: 0 },
  { diagram: 'triangle', legs: [1, 1, 1], regulator: 0 },
  { diagram: 'box', legs: [1, 1, 1, 1], regulator: 1 },
];

/**
 * A FunKit term as a diagram item, and its coefficient. withoutRegulator drops the ⊗ and draws the
 * ring by its visible features only, so the copies of one diagram come out identical.
 */
export function termToDiagram(flow: FlowSpec, term: FkObject[], withoutRegulator = false): { coefficient: number; size: number; item: DiagramItem } {
  const known = names(flow);
  const info = (n: string) => known.get(n) ?? fail(`FunKit returned an unknown field "${n}"`);
  const lineOf = (n: string) => info(n).field.line ?? info(n).field.id;
  let coefficient = 1;
  const vertices: [string, number][][] = [];
  const props: [string, number][][] = [];
  let rdot: [string, number][] | undefined;
  for (const o of term) {
    if ('prefactor' in o) coefficient *= o.prefactor;
    else if (o.type === 'number' && 'value' in o) coefficient *= o.value;
    else if (o.type === 'GammaN' && 'legs' in o) vertices.push(o.legs);
    else if (o.type === 'Propagator' && 'legs' in o) props.push(o.legs);
    else if (o.type === 'Rdot' && 'legs' in o && !rdot) rdot = o.legs;
    else fail(`unexpected object ${JSON.stringify(o)} in a FunKit term (expected GammaN, Propagator and one Rdot)`);
  }
  if (!rdot) fail('a FunKit term has no regulator');

  // Who carries each lower (negative) label: a vertex, or the regulator.
  const owner = new Map<number, number | 'R'>();
  vertices.forEach((legs, i) => legs.forEach(([, l]) => owner.set(-l, i)));
  for (const [, l] of rdot!) owner.set(-l, 'R');
  const externals = new Set(flow.legs.map((_, i) => LEG0 + i));

  // Propagators between vertices are lines; the two ending on the regulator form one regulated line.
  const lines: Line[] = [];
  const atR: { far: End; viaR: number }[] = [];
  for (const p of props) {
    const ends = p.map(([name, l]) => ({ name, l, o: owner.get(l) ?? fail(`FunKit propagator leg ${l} is not attached`) }));
    const r = ends.findIndex((e) => e.o === 'R');
    if (r < 0) lines.push({ ends: ends.map((e) => ({ v: e.o as number, name: e.name })) as [End, End], regulated: false });
    else {
      const far = ends[1 - r];
      if (far.o === 'R') fail('the 0-point flow (a loop without vertices) is drawn with the "wetterich" diagram; it needs no FunKit run');
      atR.push({ far: { v: far.o as number, name: far.name }, viaR: ends[r].l });
    }
  }
  if (atR.length !== 2) fail('a FunKit term is not a one-loop ring (the regulator must sit between two propagators)');
  // Keep the regulated line in the order of the regulator's legs.
  const rOrder = rdot!.map(([, l]) => -l);
  atR.sort((a, b) => rOrder.indexOf(a.viaR) - rOrder.indexOf(b.viaR));
  const regLine = lines.length;
  lines.push({ ends: [atR[0].far, atR[1].far], regulated: true });

  // Walk around the ring from the regulated line, leaving it through end `start`.
  const incident = vertices.map(() => [] as [number, number][]);
  lines.forEach((l, i) => l.ends.forEach((e, j) => incident[e.v].push([i, j])));
  if (incident.some((x) => x.length !== 2)) fail('a FunKit term is not a one-loop ring (every vertex needs two internal lines)');
  const walk = (start: 0 | 1) => {
    const order: { from: End; to: End }[] = [];
    let [li, out] = [regLine, start];
    do {
      const l = lines[li];
      order.push({ from: l.ends[1 - out], to: l.ends[out] });
      const next = incident[l.ends[out].v].find(([i, j]) => !(i === li && j === out))!;
      [li, out] = [next[0], (1 - next[1]) as 0 | 1];
    } while (li !== regLine);
    return order;
  };
  const legsAt = (v: number) =>
    vertices[v]
      .filter(([, l]) => externals.has(-l))
      .sort((x, y) => y[1] - x[1])
      .map(([n]) => n);
  const counts = walk(1).map((x) => legsAt(x.from.v).length);
  const stamp = RING_STAMPS.find((s) => s.legs.join() === counts.join());

  // Of all rotations and both directions, draw the ring with the external legs in a fixed place
  // (bigger vertices first, then the legs in the order of "legs"), then with the regulator where
  // the diagram has it by default, then with the lines' fields in the order of "fields", then with
  // the fewest arrows against the ring's direction.
  // A complex line points into its field end (δ/δq takes an incoming quark).
  const rank = new Map<string, number>();
  flow.legs.forEach((n) => rank.has(n) || rank.set(n, rank.size));
  const n = counts.length;
  type Ring = { from: End; to: End }[];
  const key = (r: Ring, reg: number) => [
    ...r.map((x) => -legsAt(x.from.v).length),
    ...r.flatMap((x) => legsAt(x.from.v).map((l) => rank.get(l)!).sort((p, q) => p - q)),
    withoutRegulator || reg === (stamp?.regulator ?? 0) ? 0 : 1,
    ...r.map((x) => flow.fields.indexOf(info(x.from.name).field)),
    r.filter((x) => info(x.from.name).field.anti && !info(x.from.name).anti).length,
  ];
  const better = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  };
  let ring: Ring = [];
  let reg = 0;
  let best: number[] | undefined;
  for (const w of [walk(1), walk(0)])
    for (let r = 0; r < n; r++) {
      const rot = w.map((_, k) => w[(k + r) % n]);
      const at = (n - r) % n; // the regulated line, w[0]
      const k = key(rot, at);
      if (!best || better(k, best)) [ring, reg, best] = [rot, at, k];
    }

  const lineFields = ring.map(({ from, to }) => {
    const [f, g] = [info(from.name), info(to.name)];
    const ok = f.field === g.field && (f.field.anti ? f.anti !== g.anti : true);
    if (!ok) fail(`mixed propagator ${from.name}–${to.name} is not supported`);
    return lineOf(from.name);
  });
  const reverse = ring.flatMap(({ from }, k) => (info(from.name).field.anti && !info(from.name).anti ? [String(k)] : []));
  const legs: LegSpec[][] = ring.map(({ from }) =>
    legsAt(from.v).map((n) => {
      const { field, anti } = info(n);
      return field.anti ? { field: lineOf(n), dir: anti ? 'out' : 'in' } : lineOf(n);
    }),
  );

  const item: DiagramItem = { diagram: stamp?.diagram ?? RING.id };
  const allLegs = legs.flat();
  const sameLegs = allLegs.every((l) => typeof l === 'string' && l === allLegs[0]);
  if (sameLegs && allLegs.length) item.legs = allLegs[0] as string;
  if (!stamp) item.vertices = sameLegs ? legs.map((l) => l.length) : legs;
  else if (!sameLegs) item.vertices = legs;
  if (lineFields.every((f) => f === lineFields[0])) item.internal = lineFields[0];
  else item.lines = Object.fromEntries(lineFields.map((f, k) => [String(k), f]));
  item.regulator = withoutRegulator ? 'none' : String(reg);
  if (reverse.length) item.reverse = reverse;
  if (flow.vertex) item.vertex = flow.vertex;
  return { coefficient, size: ring.length, item };
}

function fail(msg: string): never {
  throw new SpecError([msg]);
}

/** TeX of an external leg in the Γ subscript. */
function legTex(flow: FlowSpec, n: string): string {
  const { field, anti } = names(flow).get(n)!;
  const tex = field.tex ?? typeTables({ fields: flow.lineTypes ?? [] }).fields.get(field.line ?? field.id)?.tex ?? field.id;
  return anti ? (field.antiTex ?? `\\bar{${tex}}`) : tex;
}

/** The figure spec of a flow from FunKit's result: lhs = Σ coefficient × diagram. */
export function flowToSpec(flow: FlowSpec, out: FunkitOutput): FigureSpec {
  // Smallest rings first, otherwise in FunKit's order, but the copies of one diagram with the
  // regulator moved stay together.
  const shape = ({ item: { regulator, ...rest } }: { item: DiagramItem }) => JSON.stringify(rest);
  const tilde = flow.regulator === 'tilde';
  let all = out.equation.map((t) => termToDiagram(flow, t, tilde));
  if (tilde) {
    // The copies of a diagram D with ⊗ on each of its n lines sum to −\tilde∂ₜD (\tilde∂ₜG = −G ∂ₜR G),
    // and the flow gives every line the same share: FunKit's coefficients c_j become −Σc_j/n.
    const sums = new Map<string, (typeof all)[number]>();
    for (const t of all) {
      const k = shape(t);
      const s = sums.get(k);
      if (s) s.coefficient += t.coefficient;
      else sums.set(k, { ...t });
    }
    all = [...sums.values()].map((t) => ({ ...t, coefficient: -t.coefficient / t.size })).filter((t) => Math.abs(t.coefficient) > 1e-12);
  }
  const first = new Map<string, number>();
  all.forEach((t, i) => first.has(shape(t)) || first.set(shape(t), i));
  const terms = all.sort(
    (x, y) => x.size - y.size || first.get(shape(x))! - first.get(shape(y))! || Number(x.item.regulator) - Number(y.item.regulator),
  );
  const n = flow.legs.length;
  const lhs = flow.lhs ?? `\\partial_t\\Gamma^{(${n})}_{${flow.legs.map((l) => legTex(flow, l)).join('')}} =`;
  const perRow = flow.perRow ?? 4;
  const rows: SpecItem[][] = [[lhs]];
  if (!terms.length) rows[0].push('0');
  else if (tilde) rows[0].push('\\tilde{\\partial}_t \\Bigg[');
  terms.forEach(({ coefficient, item }, i) => {
    if (i && i % perRow === 0) rows.push([]);
    const [sign, size] = coefficientTex(coefficient);
    const row = rows[rows.length - 1];
    row.push(i === 0 && sign === '+' ? size : sign + size);
    row.push(item);
  });
  if (terms.length && tilde) rows[rows.length - 1].push('\\Bigg]');
  const spec: FigureSpec = {
    format: 'frg-spec',
    version: 1,
    rows: rows.map((r) => r.filter((x) => x !== '')),
  };
  for (const k of ['style', 'vertexTypes', 'regulatorKind', 'rowGap', 'align'] as const) if (flow[k] !== undefined) (spec as unknown as Record<string, unknown>)[k] = flow[k];
  if (flow.lineTypes) spec.fields = flow.lineTypes;
  return spec;
}
