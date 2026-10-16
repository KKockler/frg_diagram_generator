import type { StyleSheet, Vec } from '../model/types';
import { resolveColor } from '../model/defaults';
import { circleCmds, type Path } from '../geometry/path';
import { add, angleOf, fromAngle } from '../geometry/vec';
import type { PathPrim, Prim } from '../render/primitives';

/** Colours and outline of a vertex, already resolved. */
export interface VertexPaint {
  fill: string | undefined;
  stroke: string | undefined;
  width: number;
}

/**
 * A vertex shape (circle, square, …). Vertex *types* in the document pick a shape plus size and
 * colours; register new shapes with registerVertexShape().
 */
export interface VertexShape {
  id: string;
  label: string;
  build(p: Vec, r: number, paint: VertexPaint): Prim[];
}

/** Something placed along a propagator (regulator insertion, dressing blob, …). */
export interface InsertionKind {
  id: string;
  label: string;
  /** color = resolved colour of the field the insertion sits on. */
  build(path: Path, s: number, color: string, st: StyleSheet): Prim[];
}

const shapes = new Map<string, VertexShape>();
const insertionKinds = new Map<string, InsertionKind>();

export const registerVertexShape = (k: VertexShape) => void shapes.set(k.id, k);
export const getVertexShape = (id: string): VertexShape => shapes.get(id) ?? shapes.get('circle')!;
export const listVertexShapes = () => [...shapes.values()];

export const registerInsertionKind = (k: InsertionKind) => void insertionKinds.set(k.id, k);
export const getInsertionKind = (id: string): InsertionKind | undefined => insertionKinds.get(id);
export const listInsertionKinds = () => [...insertionKinds.values()];

// ---------------------------------------------------------------------------

const polygon = (p: Vec, r: number, n: number, rot: number): PathPrim['d'] => [
  ...Array.from({ length: n }, (_, i) => ({ op: i ? ('L' as const) : ('M' as const), p: add(p, fromAngle(rot + (2 * Math.PI * i) / n, r)) })),
  { op: 'Z' as const },
];

const filled = (d: PathPrim['d'], paint: VertexPaint): PathPrim => ({ d, fill: paint.fill, stroke: paint.stroke, width: paint.width, join: 'miter' });

registerVertexShape({ id: 'circle', label: 'Circle', build: (p, r, paint) => [filled(circleCmds(p, r), paint)] });
registerVertexShape({ id: 'square', label: 'Square', build: (p, r, paint) => [filled(polygon(p, r * 0.9 * Math.SQRT2, 4, Math.PI / 4), paint)] });
registerVertexShape({ id: 'diamond', label: 'Diamond', build: (p, r, paint) => [filled(polygon(p, r * 1.15, 4, 0), paint)] });
registerVertexShape({ id: 'triangle', label: 'Triangle', build: (p, r, paint) => [filled(polygon(p, r * 1.2, 3, -Math.PI / 2), paint)] });
registerVertexShape({
  id: 'hatched',
  label: 'Hatched circle',
  build(p, r, paint) {
    // Diagonal hatching clipped analytically to the circle.
    const d: PathPrim['d'] = [];
    const t = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
    const n = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    const step = r / 3;
    for (let o = -r + step / 2; o < r; o += step) {
      const h = Math.sqrt(r * r - o * o);
      d.push({ op: 'M', p: { x: p.x + o * n.x - h * t.x, y: p.y + o * n.y - h * t.y } });
      d.push({ op: 'L', p: { x: p.x + o * n.x + h * t.x, y: p.y + o * n.y + h * t.y } });
    }
    return [
      filled(circleCmds(p, r), { ...paint, stroke: undefined }),
      { d, stroke: paint.stroke ?? '#000000', width: Math.max(paint.width, 0.5) * 0.8 },
      filled(circleCmds(p, r), { ...paint, fill: undefined }),
    ];
  },
});
registerVertexShape({
  id: 'cross',
  label: 'Cross (×)',
  build(p, r, paint) {
    const a = (phi: number) => add(p, fromAngle(phi, r));
    const d: PathPrim['d'] = [
      { op: 'M', p: a(Math.PI / 4) },
      { op: 'L', p: a((5 * Math.PI) / 4) },
      { op: 'M', p: a((3 * Math.PI) / 4) },
      { op: 'L', p: a((7 * Math.PI) / 4) },
    ];
    return [{ d, stroke: paint.stroke ?? paint.fill ?? '#000000', width: Math.max(paint.width, 1) }];
  },
});

/** Insertion kinds that are regulators: a diagram carries one of them, and "regulator on each line" moves it. */
export const REGULATOR_KINDS = ['regulator', 'flowRegulator'];
export const isRegulator = (kind: string) => REGULATOR_KINDS.includes(kind);

function regulatorPaint(color: string, st: StyleSheet) {
  return {
    fill: st.regulatorFill === 'none' ? undefined : resolveColor(st.regulatorFill ?? 'White'),
    stroke: !st.regulatorStroke || st.regulatorStroke === 'line' ? color : resolveColor(st.regulatorStroke),
    width: st.lineWidth,
  };
}

registerInsertionKind({
  id: 'regulator',
  label: 'Regulator ∂ₜR (⊗)',
  build(path, s, color, st) {
    const c = path.pointAt(s);
    const r = st.regulatorRadius;
    const arm = (phi: number) => add(c, fromAngle(phi, r));
    const { fill, stroke, width: w } = regulatorPaint(color, st);
    return [
      { d: circleCmds(c, r), fill, stroke, width: w },
      {
        d: [
          { op: 'M', p: arm(Math.PI / 4) },
          { op: 'L', p: arm((5 * Math.PI) / 4) },
          { op: 'M', p: arm((3 * Math.PI) / 4) },
          { op: 'L', p: arm((7 * Math.PI) / 4) },
        ],
        stroke,
        width: w,
      },
    ];
  },
});

/**
 * Regulator insertion of the generalised flow equation with flowing fields, (∂ₜ + 2 δΦ̇/δΦ) R:
 * a crossed pentagon pointing along the line (as in arXiv:2408.08413).
 */
registerInsertionKind({
  id: 'flowRegulator',
  label: 'Flowing-field regulator (∂ₜ + 2δΦ̇/δΦ)R (⬠)',
  build(path, s, color, st) {
    const c = path.pointAt(s);
    const r = st.regulatorRadius;
    const rot = angleOf(path.tangentAt(s));
    const corner = (k: number) => add(c, fromAngle(rot + (2 * Math.PI * k) / 5, r));
    const { fill, stroke, width: w } = regulatorPaint(color, st);
    return [
      { d: polygon(c, r, 5, rot), fill, stroke, width: w, join: 'miter' },
      {
        d: [
          { op: 'M', p: corner(2) },
          { op: 'L', p: corner(4) },
          { op: 'M', p: corner(3) },
          { op: 'L', p: corner(1) },
        ],
        stroke,
        width: w,
      },
    ];
  },
});

registerInsertionKind({
  id: 'dressing',
  label: 'Dressed propagator blob',
  build(path, s, _color, st) {
    return [{ d: circleCmds(path.pointAt(s), st.vertexRadius * 1.3), fill: '#c8c8c8', stroke: '#000000', width: st.lineWidth * 0.6 }];
  },
});

registerInsertionKind({
  id: 'cross',
  label: 'Cross (mass insertion)',
  build(path, s, color, st) {
    const c = path.pointAt(s);
    const r = st.regulatorRadius * 0.8;
    const arm = (phi: number) => add(c, fromAngle(phi, r));
    return [
      {
        d: [
          { op: 'M', p: arm(Math.PI / 4) },
          { op: 'L', p: arm((5 * Math.PI) / 4) },
          { op: 'M', p: arm((3 * Math.PI) / 4) },
          { op: 'L', p: arm((7 * Math.PI) / 4) },
        ],
        stroke: color,
        width: st.lineWidth * 1.2,
      },
    ];
  },
});
