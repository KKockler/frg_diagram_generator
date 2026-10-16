// Example documents, built from the pre-built diagrams exactly as a user would:
// place templates, swap line types, arrange rows. They double as regression tests
// and appear under Library… → Examples.
import type { Diagram, FrgDocument } from './types';
import { emptyDocument, newId, THESIS_STYLE } from './defaults';
import { getStamp } from './stamps';
import { arrangeRow, planRow } from './layout';
import { translate } from './ops';
import { buildScene } from '../render/scene';

type Fields = { legs: string; upper: string; lower: string };

/** Place a polarisation diagram with the given fields; ⊗ sits on the upper line. */
function bubble(doc: FrgDocument, at: { x: number; y: number }, f: Fields): Diagram {
  const d = getStamp('bubble').build({ at, style: doc.style, field: f.legs });
  const nodes = new Map(d.nodes.map((n) => [n.id, n]));
  for (const e of d.edges) {
    const internal = nodes.get(e.from)!.kind !== 'external' && nodes.get(e.to)!.kind !== 'external';
    if (internal) e.field = e.insertions.length ? f.upper : f.lower;
  }
  return d;
}

function tadpole(doc: FrgDocument, at: { x: number; y: number }, field: string): Diagram {
  return getStamp('tadpole').build({ at, style: doc.style, field });
}

function add(doc: FrgDocument, d: Diagram): string[] {
  const D = doc.diagram;
  D.nodes.push(...d.nodes);
  D.edges.push(...d.edges);
  D.labels.push(...d.labels);
  D.groups.push(...d.groups);
  D.regions.push(...d.regions);
  return [...d.nodes, ...d.edges, ...d.labels].map((x) => x.id);
}

function term(doc: FrgDocument, tex: string, x: number, y: number, size?: number): string {
  const id = newId('l');
  doc.diagram.labels.push({ id, tex, x, y, size });
  return id;
}

/** One equation row: terms are TeX strings or diagram builders, laid out with Arrange row. */
function row(doc: FrgDocument, y: number, items: (string | ((at: { x: number; y: number }) => Diagram))[]) {
  const ids: string[] = [];
  items.forEach((it, i) => {
    const at = { x: i * 80, y };
    ids.push(...(typeof it === 'string' ? [term(doc, it, at.x, at.y)] : add(doc, it(at))));
  });
  arrangeRow(doc.diagram, planRow(doc, ids));
  return ids;
}

/** A document in the thesis style, which the examples below reproduce. */
function thesisDocument(): FrgDocument {
  return { ...emptyDocument(), style: { ...THESIS_STYLE } };
}

/** The pion, sigma and quark two-point flows of the quark–meson model (thesis Fig. "2pt_flow"). */
export function twoPointFlow(): FrgDocument {
  const doc = thesisDocument();
  const B = (f: Fields) => (at: { x: number; y: number }) => bubble(doc, at, f);
  const pi = 'pion',
    si = 'sigma',
    q = 'quark';
  const rows = [
    row(doc, 0, ['\\partial_t\\Gamma^{(2)}_{\\pi} \\propto -\\frac{1}{2}', (at) => tadpole(doc, at, pi), '+', B({ legs: pi, upper: si, lower: pi }), '+', B({ legs: pi, upper: pi, lower: si }), '-2', B({ legs: pi, upper: q, lower: q })]),
    row(doc, 120, ['\\partial_t\\Gamma^{(2)}_{\\sigma} \\propto', B({ legs: si, upper: pi, lower: pi }), '+', B({ legs: si, upper: si, lower: si }), '-2', B({ legs: si, upper: q, lower: q })]),
    row(doc, 240, ['\\partial_t\\Gamma^{(2)}_{q} \\propto', B({ legs: q, upper: q, lower: pi }), '+', B({ legs: q, upper: pi, lower: q }), '+', B({ legs: q, upper: q, lower: si }), '+', B({ legs: q, upper: si, lower: q })]),
  ];
  // Left-align the rows on the left edges of their left-hand sides.
  const lhs = rows.map((r) => buildScene(doc, new Set([r[0]])).bbox!.x);
  const x0 = Math.min(...lhs);
  rows.forEach((r, i) => translate(doc.diagram, new Set(r), x0 - lhs[i], 0));
  return doc;
}

/** Notation table: propagators, regulator insertions and the n-point vertex. */
export function notation(): FrgDocument {
  const doc = thesisDocument();
  const fields = ['pion', 'sigma', 'quark', 'gluon', 'ghost'];
  fields.forEach((f, i) => {
    const y = i * 45;
    const name = doc.fieldTypes.find((x) => x.id === f)!.tex;
    row(doc, y, [`G_{${name}} =`, (at) => getStamp('propagator').build({ at, style: doc.style, field: f }), `\\quad \\partial_t R_{${name}} =`, (at) => getStamp('regulatorProp').build({ at, style: doc.style, field: f })]);
  });
  row(doc, 250, ['\\Gamma^{(n)} =', (at) => getStamp('npoint').build({ at, style: doc.style, field: 'scalar' })]);
  return doc;
}

export const EXAMPLES: { id: string; name: string; build: () => FrgDocument }[] = [
  { id: '2pt_flow', name: 'Two-point flows of the quark–meson model', build: twoPointFlow },
  { id: 'notation', name: 'Notation: propagators, regulators, vertices', build: notation },
];
