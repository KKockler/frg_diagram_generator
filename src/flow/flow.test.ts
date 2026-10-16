import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSpec, itemSlots, SpecError, type DiagramItem } from '../spec/spec';
import { flowToSpec, funkitInput, maximalVertices, validateFlow, type FlowSpec, type FunkitOutput } from './flow';

// The fixtures are FunKit's results for the example flows, saved with
// `frg flow examples/<name>.flow.json --save-funkit src/flow/fixtures/<name>.funkit.json`.
const read = (path: string) => JSON.parse(readFileSync(join(__dirname, path), 'utf8'));
const example = (name: string): [FlowSpec, FunkitOutput] => [
  validateFlow(read(`../../examples/${name}.flow.json`)),
  read(`fixtures/${name}.funkit.json`),
];

function problems(raw: unknown): string[] {
  try {
    validateFlow(raw);
  } catch (e) {
    if (e instanceof SpecError) return e.problems;
    throw e;
  }
  return [];
}

/** The terms of a flow's figure: coefficient TeX and diagram, in order. */
function terms(flow: FlowSpec, out: FunkitOutput) {
  const items = flowToSpec(flow, out).rows.flatMap((r) => (Array.isArray(r) ? r : r.items)).slice(1);
  const res: { c: string; d: DiagramItem }[] = [];
  for (let i = 0; i < items.length; i++)
    if (typeof items[i] === 'object' && 'diagram' in (items[i] as object)) res.push({ c: i && typeof items[i - 1] === 'string' ? (items[i - 1] as string) : '', d: items[i] as DiagramItem });
  return res;
}

describe('flow specs', () => {
  it('reports every problem with its path', () => {
    const p = problems({
      format: 'frg-flow',
      version: 1,
      fields: [{ id: 'q', grassmann: true, line: 'quark' }, { id: 'phi', line: 'nope' }, { id: 'q' }],
      legs: ['pi'],
      vertices: [['q', 'q']],
      colour: 1,
    });
    expect(p).toEqual(
      expect.arrayContaining([
        'colour: unknown key (allowed: "$schema", "format", "version", "fields", "legs", "vertices", "lhs", "perRow", "regulator", "style", "lineTypes", "vertexTypes", "regulatorKind", "vertex", "rowGap", "align")',
        'fields[0].anti: a Grassmann field needs its antifield',
        expect.stringMatching(/^fields\[1\]\.line: unknown line type "nope"/),
        'fields[2].id: "q" is already used',
        expect.stringMatching(/^legs\[0\]: unknown field "pi"/),
        'vertices[0]: expected a list of at least three fields',
      ]),
    );
  });

  it('truncates maximally, conserving the charge of complex fields', () => {
    const [flow] = example('qm_pion');
    const v = maximalVertices(flow).map((x) => x.join(' '));
    expect(v).toContain('sigma pi pi');
    expect(v).toContain('pi qb q');
    expect(v).toContain('qb qb q q');
    expect(v).toContain('pi pi pi pi');
    expect(v).not.toContain('pi q q');
    expect(v.every((x) => x.split(' ').length >= 3 && x.split(' ').length <= 4)).toBe(true);
  });

  it('writes the FunKit input: n derivatives of the Wetterich equation', () => {
    const [flow] = example('qm_pion');
    const inp = funkitInput(flow, 'out.json');
    expect(inp.derivatives).toEqual([['pi', 1001], ['pi', 1002]]);
    expect(inp.equation[0].filter((o) => 'type' in o && o.type === 'FDOp')).toHaveLength(2);
    // Pairs as (antifield, field), in this key order.
    expect(Object.keys((inp.setup.gFields as object[])[0])).toEqual(['qb', 'q']);
    expect(inp.setup.cFields).toEqual([{ sigma: [] }, { pi: [] }]);
    expect((inp.setup.truncation as Record<string, unknown>).Propagator).toEqual([['sigma', 'sigma'], ['pi', 'pi'], ['qb', 'q']]);
    const own = funkitInput({ ...flow, vertices: [['sigma', 'pi', 'pi']] }, 'out.json');
    expect((own.setup.truncation as Record<string, unknown>).GammaN).toEqual([['sigma', 'pi', 'pi']]);
  });
});

describe('FunKit results as figures', () => {
  it('draws the pion 2-point flow with the built-in tadpole and bubble', () => {
    const [flow, out] = example('qm_pion');
    const spec = flowToSpec(flow, out);
    expect(spec.rows[0]).toContain('\\partial_t\\Gamma^{(2)}_{\\pi\\pi} =');
    const t = terms(flow, out);
    expect(t.map((x) => x.d.diagram)).toEqual(['tadpole', 'tadpole', 'tadpole', 'bubble', 'bubble', 'bubble', 'bubble', 'bubble']);
    const quarkLoop = t.find((x) => x.d.diagram === 'bubble' && x.d.internal === 'quark')!;
    expect(quarkLoop.c).toBe('-2');
    // The loop is oriented with the ring, so no arrow needs flipping; legs are the pions.
    expect(quarkLoop.d.reverse).toBeUndefined();
    expect(quarkLoop.d.legs).toBe('pion');
    expect(t.filter((x) => x.d.diagram === 'tadpole').map((x) => x.c)).toEqual(['-\\frac{1}{2}', '-\\frac{1}{2}', '-']);
    expect(() => buildSpec(spec)).not.toThrow();
  });

  it('uses rings where no built-in diagram fits, with the legs always in the same place', () => {
    const [flow, out] = example('phi4_4pt');
    const t = terms(flow, out);
    expect(t.map((x) => [x.c, x.d.diagram, x.d.vertices?.join() ?? '', x.d.regulator])).toEqual([
      ['-\\frac{1}{2}', 'ring', '4', '0'],
      ['+4', 'ring', '3,1', '0'],
      ['+3', 'fish', '', '0'],
      ['-12', 'ring', '2,1,1', '0'],
      ['-6', 'ring', '2,1,1', '1'],
      ['+12', 'box', '', '1'],
    ]);
    expect(() => buildSpec(flowToSpec(flow, out))).not.toThrow();
  });

  it('points fermion arrows along the fermion line', () => {
    const [flow, out] = example('qm_yukawa');
    const t = terms(flow, out);
    expect(t).toHaveLength(12);
    for (const { d } of t) {
      expect(d.diagram).toBe('triangle');
      // q̄ leaves at vertex 0, q enters at vertex 1, π at vertex 2: the order of "legs".
      expect(d.vertices).toEqual([[{ field: 'quark', dir: 'out' }], [{ field: 'quark', dir: 'in' }], ['pion']]);
      // Internal quark lines run from q's vertex towards q̄'s: line 0 is 0 → 1, so it is flipped.
      const lines = d.lines!;
      if (lines['0'] === 'quark') expect(d.reverse).toEqual(['0']);
      else expect(d.reverse).toBeUndefined();
    }
    // The three regulator positions of each diagram are next to each other.
    expect(t.slice(0, 3).map((x) => x.d.regulator)).toEqual(['0', '1', '2']);
  });

  it('writes the flow as \\tilde\\partial_t of diagrams without regulator', () => {
    const [flow, out] = example('phi4_4pt');
    const tilde = { ...flow, regulator: 'tilde' as const };
    const items = flowToSpec(tilde, out).rows.flatMap((r) => (Array.isArray(r) ? r : r.items));
    expect(items[1]).toBe('\\tilde{\\partial}_t \\Bigg[');
    expect(items[items.length - 1]).toBe('\\Bigg]');
    // ½ ∂̃ₜ Tr ln(Γ⁽²⁾ + R), four derivatives: the textbook coefficients.
    const t = terms(tilde, out);
    expect(t.map((x) => [x.c, x.d.diagram, x.d.vertices?.join() ?? '', x.d.regulator])).toEqual([
      ['\\frac{1}{2}', 'ring', '4', 'none'],
      ['-2', 'ring', '3,1', 'none'],
      ['-\\frac{3}{2}', 'fish', '', 'none'],
      ['+6', 'ring', '2,1,1', 'none'],
      ['-3', 'box', '', 'none'],
    ]);
    // The σπ bubble with ⊗ on σ and the one with ⊗ on π are one diagram.
    const [qm, qmOut] = example('qm_pion');
    const bubbles = terms({ ...qm, regulator: 'tilde' }, qmOut).filter((x) => x.d.diagram === 'bubble');
    expect(bubbles.map((x) => [x.c, x.d.internal ?? x.d.lines])).toEqual([
      ['-\\frac{1}{2}', 'sigma'],
      ['-', { 0: 'sigma', 1: 'pion' }],
      ['-\\frac{1}{2}', 'pion'],
      ['+', 'quark'],
    ]);
    expect(() => buildSpec(flowToSpec(tilde, out))).not.toThrow();
  });

  it('rejects results that are not one-loop rings', () => {
    const [flow] = example('qm_pion');
    const bad = { equation: [[{ prefactor: 1 }, { type: 'Propagator', legs: [['pi', 1], ['pi', 2]] }]] } as FunkitOutput;
    expect(() => flowToSpec(flow, bad)).toThrow(/no regulator/);
  });
});

describe('ring diagram', () => {
  const ring = (vertices: unknown, extra: object = {}) => ({ format: 'frg-spec', version: 1, rows: [[{ diagram: 'ring', vertices, ...extra }]] });

  it('has one line per vertex, line i from vertex i to i + 1', () => {
    expect(itemSlots({ diagram: 'ring', vertices: [1, 1, 1, 1, 1] })).toHaveLength(5);
    expect(itemSlots({ diagram: 'ring', vertices: [3] })).toEqual(['loop']);
    const doc = buildSpec(ring([2, 1, 1], { regulator: 'each' }));
    expect(doc.diagram.groups).toHaveLength(3);
  });

  it('sets leg fields and arrow directions per vertex', () => {
    const doc = buildSpec(ring([[{ field: 'quark', dir: 'in' }, 'pion'], [{ field: 'quark', dir: 'out' }]], { field: 'quark' }));
    const nodes = new Map(doc.diagram.nodes.map((n) => [n.id, n]));
    const legs = doc.diagram.edges.filter((e) => nodes.get(e.from)!.kind === 'external' || nodes.get(e.to)!.kind === 'external');
    expect(legs.map((e) => e.field).sort()).toEqual(['pion', 'quark', 'quark']);
    // Arrows run from → to unless reversed: towards the vertex for "in", away for "out".
    const [v0, v1] = doc.diagram.nodes.filter((n) => n.kind !== 'external').map((n) => n.id);
    const quarkLeg = (v: string) => legs.find((e) => e.field === 'quark' && (e.from === v || e.to === v))!;
    const head = (e: (typeof legs)[number]) => (e.reversed ? e.from : e.to);
    expect(head(quarkLeg(v0))).toBe(v0);
    expect(head(quarkLeg(v1))).not.toBe(v1);
  });

  it('validates vertices', () => {
    const p = (raw: unknown) => {
      try {
        buildSpec(raw);
        return [];
      } catch (e) {
        return (e as SpecError).problems;
      }
    };
    expect(p(ring(undefined))[0]).toMatch(/^rows\[0\]\[0\]\.vertices: expected a non-empty array/);
    expect(p(ring([1, -1, [{ field: 'quark', dir: 'up' }]]))).toEqual([
      'rows[0][0].vertices[1]: expected a leg count ≥ 0',
      'rows[0][0].vertices[2][0].dir: expected "in" or "out"',
    ]);
    expect(p({ format: 'frg-spec', version: 1, rows: [[{ diagram: 'bubble', vertices: [2, 1] }]] })).toEqual([
      'rows[0][0].vertices: legs per vertex [2,1] do not match "bubble" ([1,1]); use "diagram": "ring" for other shapes',
    ]);
    expect(p({ format: 'frg-spec', version: 1, rows: [[{ diagram: 'bubble', vertices: [['quark'], ['pion']] }]] })).toEqual([]);
  });
});
