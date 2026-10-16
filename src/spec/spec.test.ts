import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { FrgDocument } from '../model/types';
import { STAMPS } from '../model/stamps';
import { EXAMPLES } from '../model/examples';
import { buildScene } from '../render/scene';
import { parseAnyFile, serializeDocument } from '../export/io';
import { toTikz } from '../export/tikz';
import { buildSpec, RING, SpecError, stampCatalog } from './spec';
import { specSchema } from './schema';

const EX = join(__dirname, '../../examples');
const specFiles = readdirSync(EX).filter((f) => f.endsWith('.spec.json'));
const readSpec = (f: string) => readFileSync(join(EX, f), 'utf8');

const spec = (rows: unknown[], extra: object = {}) => ({ format: 'frg-spec', version: 1, rows, ...extra });

function problems(raw: unknown): string[] {
  try {
    buildSpec(raw);
  } catch (e) {
    if (e instanceof SpecError) return e.problems;
    throw e;
  }
  return [];
}

/** Per diagram, left to right: its line fields and which field carries the regulator. */
function signature(doc: FrgDocument) {
  return doc.diagram.groups
    .map((g) => {
      const edges = doc.diagram.edges.filter((e) => g.members.includes(e.id));
      const box = buildScene(doc, new Set(g.members)).bbox!;
      return {
        y: Math.round((box.y + box.h / 2) / 20),
        x: box.x,
        name: g.name,
        fields: edges.map((e) => e.field).sort(),
        regulator: edges.filter((e) => e.insertions.length).map((e) => e.field),
      };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(({ name, fields, regulator }) => ({ name, fields, regulator }));
}

describe('figure specs', () => {
  it('names the lines of every pre-built diagram', () => {
    // Part of the spec format: changing a name breaks existing specs.
    expect(Object.fromEntries(stampCatalog().map((s) => [s.id, [s.slots.join(','), s.regulator]]))).toEqual({
      propagator: ['line', null],
      regulatorProp: ['line', 'line'],
      wetterich: ['loop', 'loop'],
      tadpole: ['loop', 'loop'],
      bubble: ['upper,lower', 'upper'],
      fish: ['upper,lower', 'upper'],
      triangle: ['left,right,lower', 'left'],
      box: ['left,upper,right,lower', 'upper'],
      sunset: ['upper,middle,lower', 'upper'],
      vertex4: ['', null],
      npoint: ['', null],
      exchange: ['middle', null],
    });
  });

  it.each(specFiles)('%s builds and exports', (f) => {
    const doc = buildSpec(readSpec(f));
    expect(buildScene(doc).bbox!.w).toBeGreaterThan(100);
    expect(toTikz(doc, { scale: 1, standalone: true }).tex).toContain('\\begin{tikzpicture}');
  });

  it('2pt_flow.spec.json reproduces the hand-built example', () => {
    const fromSpec = buildSpec(readSpec('2pt_flow.spec.json'));
    expect(signature(fromSpec)).toEqual(signature(EXAMPLES[0].build()));
  });

  it('notation.spec.json reproduces the hand-built example', () => {
    expect(signature(buildSpec(readSpec('notation.spec.json')))).toEqual(signature(EXAMPLES[1].build()));
  });

  it('lines up each row on a common centre line and left-aligns the rows', () => {
    const doc = buildSpec(spec([['A =', { diagram: 'bubble' }, '+', { diagram: 'tadpole' }], ['B =', { diagram: 'box' }]]));
    const terms = doc.diagram.labels.filter((l) => !l.attach);
    const rowA = terms.filter((l) => l.tex !== 'B =');
    expect(new Set(rowA.map((l) => Math.round(l.y))).size).toBe(1);
    const lhs = terms.filter((l) => l.tex.endsWith('=')).map((l) => buildScene(doc, new Set([l.id])).bbox!.x);
    expect(lhs[0]).toBeCloseTo(lhs[1]);
  });

  it('applies legs, internal, lines, vertex, reverse and regulator', () => {
    const doc = buildSpec(
      spec([[{ diagram: 'box', field: 'quark', legs: 'pion', internal: 'sigma', lines: { left: 'gluon' }, vertex: 'bareVertex', regulator: ['right', 'lower'], reverse: ['upper'] }]]),
    );
    const nodes = new Map(doc.diagram.nodes.map((n) => [n.id, n]));
    const ext = (id: string) => nodes.get(id)!.kind === 'external';
    const legs = doc.diagram.edges.filter((e) => ext(e.from) || ext(e.to));
    const internal = doc.diagram.edges.filter((e) => !ext(e.from) && !ext(e.to));
    expect(legs.map((e) => e.field)).toEqual(['pion', 'pion', 'pion', 'pion']);
    expect(internal.map((e) => e.field).sort()).toEqual(['gluon', 'sigma', 'sigma', 'sigma']);
    expect(internal.filter((e) => e.insertions.length)).toHaveLength(2);
    expect(internal.filter((e) => e.reversed)).toHaveLength(1);
    expect(doc.diagram.nodes.filter((n) => !ext(n.id)).every((n) => n.kind === 'bareVertex')).toBe(true);
  });

  it('"regulator": "each" becomes the sum over internal lines', () => {
    const doc = buildSpec(spec([[{ diagram: 'triangle', regulator: 'each' }]]));
    expect(doc.diagram.groups).toHaveLength(3);
    expect(doc.diagram.labels.filter((l) => l.tex === '+')).toHaveLength(2);
    const regs = doc.diagram.groups.map((g) => doc.diagram.edges.filter((e) => g.members.includes(e.id) && e.insertions.length).length);
    expect(regs).toEqual([1, 1, 1]);
  });

  it('adds labels and momentum arrows, and group-library fields on use', () => {
    const doc = buildSpec(spec([[{ diagram: 'exchange', internal: 'vector', labels: { middle: '\\rho' }, momentum: { middle: 'k' } }]]));
    expect(doc.fieldTypes.some((f) => f.id === 'vector')).toBe(true);
    expect(doc.diagram.edges.find((e) => e.field === 'vector')!.momentum?.tex).toBe('k');
    expect(doc.diagram.labels.find((l) => l.tex === '\\rho')!.attach).toBeDefined();
  });

  it('uses style presets, overrides and custom types', () => {
    const doc = buildSpec(
      spec([[{ diagram: 'propagator', field: 'higgs' }]], {
        style: { preset: 'talk', lineWidth: 4 },
        fields: [{ id: 'higgs', name: 'Higgs', tex: 'h', line: 'dashed', color: 'ForestGreen', arrows: 'none' }],
      }),
    );
    expect(doc.style.name).toBe('Talk (bold)');
    expect(doc.style.lineWidth).toBe(4);
    expect(doc.fieldTypes.find((f) => f.id === 'higgs')!.line).toBe('dashed');
  });

  it('picks the regulator kind per spec or per diagram', () => {
    const doc = buildSpec(
      spec([[{ diagram: 'bubble', field: 'pion', regulator: 'each' }, { diagram: 'tadpole', field: 'pion', regulatorKind: 'regulator' }]], { regulatorKind: 'flowRegulator' }),
    );
    const kinds = doc.diagram.edges.flatMap((e) => e.insertions.map((i) => i.kind));
    expect(kinds.sort()).toEqual(['flowRegulator', 'flowRegulator', 'regulator']);
    expect(problems(spec([[{ diagram: 'bubble', regulatorKind: 'pentagon' }]]))).toEqual([expect.stringMatching(/^rows\[0\]\[0\]\.regulatorKind: unknown regulator kind "pentagon"/)]);
  });

  it('reports every problem with its path', () => {
    const p = problems({
      format: 'frg-spec',
      version: 1,
      colour: 'red',
      style: 'poster',
      rows: [['x', { diagram: 'bubble', field: 'pi', lines: { top: 'pion' }, regulator: 'loop', vertx: 'blob' }, { diagram: 'pentagon' }, 3]],
    });
    expect(p).toEqual([
      expect.stringMatching(/^colour: unknown key/),
      expect.stringMatching(/^style: unknown preset "poster"/),
      expect.stringMatching(/^rows\[0\]\[1\]\.vertx: unknown key/),
      expect.stringMatching(/^rows\[0\]\[1\]\.field: unknown field "pi" \(known: "pion"/),
      expect.stringMatching(/^rows\[0\]\[1\]\.lines\.top: no such line \(this diagram has: "upper", "lower"\)/),
      expect.stringMatching(/^rows\[0\]\[1\]\.regulator: "loop" is not/),
      expect.stringMatching(/^rows\[0\]\[2\]\.diagram: unknown diagram "pentagon"/),
      expect.stringMatching(/^rows\[0\]\[3\]: expected/),
    ]);
    expect(problems({ format: 'frg-diagram', rows: [] })[0]).toMatch(/^format/);
    expect(problems('{ nope')[0]).toMatch(/invalid JSON/);
  });

  it('opens in the editor like any other file', () => {
    const doc = parseAnyFile('fig.json', new TextEncoder().encode(readSpec('showcase.spec.json')));
    expect(doc.format).toBe('frg-diagram');
    // and the result round-trips as a normal document
    expect(parseAnyFile('fig.frg.json', new TextEncoder().encode(serializeDocument(doc))).diagram.edges).toHaveLength(doc.diagram.edges.length);
  });

  it('schema lists every diagram', () => {
    const s = specSchema() as { $defs: { diagram: { properties: { diagram: { enum: string[] } } } } };
    expect(s.$defs.diagram.properties.diagram.enum).toEqual([...STAMPS.map((x) => x.id), RING.id]);
  });

  // `npm run build:cli && node dist-cli/frg.mjs schema > frg-spec.schema.json` refreshes it.
  it('frg-spec.schema.json is up to date', () => {
    expect(JSON.parse(readFileSync(join(EX, '../frg-spec.schema.json'), 'utf8'))).toEqual(specSchema());
  });
});
