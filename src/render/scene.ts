import type { DEdge, DNode, FieldType, FrgDocument, Label, Region, StyleSheet, Vec, VertexType } from '../model/types';
import { applyColorMode, resolveColor } from '../model/defaults';
import { arcThrough, selfLoop, smoothThrough, type Path } from '../geometry/path';
import { add, perp, scale } from '../geometry/vec';
import { arrowHead, getLineStyle, paramsFor } from '../styles/lineStyles';
import { getInsertionKind, getVertexShape } from '../styles/nodeKinds';
import { bboxOf, type BBox, type PathPrim, type Prim, type TexPrim } from './primitives';
import { typeset } from './tex';

/** Geometric centre-line of an edge in its drawing direction (reversed edges are flipped). */
export function edgePath(e: DEdge, nodes: Map<string, DNode>): Path | null {
  const a = nodes.get(e.from);
  const b = nodes.get(e.to);
  if (!a || !b) return null;
  let p: Path;
  if (e.from === e.to) {
    const loop = e.loop ?? { radius: 20, angle: -Math.PI / 2 };
    p = selfLoop(a, loop.radius, loop.angle);
  } else {
    p = arcThrough(a, b, e.bend);
  }
  return e.reversed ? p.reverse() : p;
}

/** Insertion position t (along from→to) mapped into drawing direction. */
export const drawT = (e: DEdge, t: number) => (e.reversed ? 1 - t : t);

/**
 * Arrow positions: centred in each stretch between the ends and insertions.
 * Stretches too short to hold an arrow clear of the insertion get none,
 * but a line always keeps at least its longest stretch's arrow.
 */
export function arrowFractions(e: DEdge, length: number, style: StyleSheet): number[] {
  const ts = [0, ...e.insertions.map((i) => drawT(e, i.t)).sort((a, b) => a - b), 1];
  const minLen = style.arrowLength * 1.5 + style.regulatorRadius;
  const stretches = ts.slice(0, -1).map((t, i) => ({ mid: (t + ts[i + 1]) / 2, len: (ts[i + 1] - t) * length }));
  const out = stretches.filter((s) => s.len >= minLen).map((s) => s.mid);
  if (!out.length && length > 0) out.push(stretches.reduce((a, b) => (b.len > a.len ? b : a)).mid);
  return out;
}

const FALLBACK_FIELD: FieldType = { id: '?', name: '?', tex: '', line: 'single', color: 'Gray', arrows: 'none' };

/** How far a field's drawing extends to either side of its centre-line. */
function halfWidth(f: FieldType, style: StyleSheet): number {
  const ls = getLineStyle(f.line);
  const p = paramsFor(ls, f.params);
  const w = f.line === 'double' ? (p.sep || style.doubleSep) / 2 : (p.amplitude ?? 0);
  return w + style.lineWidth / 2;
}

// ---------------------------------------------------------------------------
// TeX labels

/** A typeset label centred at c. */
export function texPrim(tex: string, c: Vec, size: number, color: string): TexPrim {
  const t = typeset(tex);
  const s = size / 1000;
  const w = t.vb.w * s;
  const h = t.vb.h * s;
  const x0 = c.x - w / 2;
  const y0 = c.y - h / 2;
  return {
    tex: {
      source: tex,
      size,
      inner: t.inner.replace(/currentColor/g, color),
      x: x0 - t.vb.x * s,
      y: y0 - t.vb.y * s,
      s,
      color,
      box: { x: x0, y: y0, w, h },
    },
  };
}

/** Where a label's centre sits (attachment point + offset). */
export function labelCenter(l: Label, nodes: Map<string, DNode>, paths: Map<string, Path>, edges: Map<string, DEdge>): Vec | null {
  if (!l.attach) return { x: l.x, y: l.y };
  if ('node' in l.attach) {
    const n = nodes.get(l.attach.node);
    return n ? { x: n.x + l.x, y: n.y + l.y } : null;
  }
  const e = edges.get(l.attach.edge);
  const p = e && paths.get(e.id);
  if (!e || !p) return null;
  const q = p.pointAt(drawT(e, l.attach.t) * p.length);
  return { x: q.x + l.x, y: q.y + l.y };
}

/** Id of the node/edge a label hangs on, if any. */
export const labelHost = (l: Label): string | undefined => (l.attach ? ('node' in l.attach ? l.attach.node : l.attach.edge) : undefined);

// ---------------------------------------------------------------------------

function momentumPrims(e: DEdge, path: Path, field: FieldType, style: StyleSheet): Prim[] {
  const m = e.momentum;
  if (!m || path.length < 1) return [];
  const d = m.side * (halfWidth(field, style) + 5);
  const off = path.offset(d);
  const L = off.length;
  const len = Math.min(L * 0.5, 22);
  const s0 = (L - len) / 2;
  const pts: Vec[] = [];
  for (let i = 0; i <= 12; i++) pts.push(off.pointAt(s0 + (len * i) / 12));
  const color = '#000000';
  const small = { ...style, arrowLength: style.arrowLength * 0.8, arrowWidth: style.arrowWidth * 0.8 };
  const dir: 1 | -1 = m.reversed ? -1 : 1;
  const tipS = dir === 1 ? s0 + len - small.arrowLength / 2 : s0 + small.arrowLength / 2;
  const out: Prim[] = [
    { d: smoothThrough(pts), stroke: color, width: style.lineWidth * 0.6, cap: 'butt' },
    arrowHead(off, tipS, dir, color, small),
  ];
  if (m.tex) {
    const size = style.fontSize * 0.85;
    const mid = off.pointAt(L / 2);
    const n = scale(perp(off.tangentAt(L / 2)), Math.sign(d) || 1);
    const box = texPrim(m.tex, mid, size, color).tex.box;
    const extent = (Math.abs(n.x) * box.w) / 2 + (Math.abs(n.y) * box.h) / 2;
    out.push(texPrim(m.tex, add(mid, scale(n, extent + 2)), size, color));
  }
  return out;
}

export function edgePrims(e: DEdge, path: Path, field: FieldType | undefined, style: StyleSheet): Prim[] {
  const f = field ?? FALLBACK_FIELD;
  const ls = getLineStyle(f.line);
  const color = resolveColor(f.color);
  const prims = ls.build({
    path,
    color,
    style,
    params: paramsFor(ls, f.params),
    arrows: f.arrows,
    arrowAt: arrowFractions(e, path.length, style),
  });
  for (const ins of e.insertions) {
    const kind = getInsertionKind(ins.kind);
    if (kind) prims.push(...kind.build(path, drawT(e, ins.t) * path.length, color, style));
  }
  prims.push(...momentumPrims(e, path, f, style));
  return prims;
}

const FALLBACK_VERTEX: VertexType = { id: '?', name: '?', shape: 'circle', scale: 1, fill: 'Gray', stroke: 'Black', strokeWidth: 0.6 };

export const vertexTypeOf = (doc: FrgDocument, kind: string): VertexType | undefined =>
  kind === 'external' ? undefined : (doc.vertexTypes.find((v) => v.id === kind) ?? FALLBACK_VERTEX);

/** Drawn radius of a node (endpoints: 0). */
export function vertexRadius(doc: FrgDocument, kind: string): number {
  const vt = vertexTypeOf(doc, kind);
  return vt ? vt.scale * doc.style.vertexRadius : 0;
}

export function vertexPrims(vt: VertexType, p: Vec, style: StyleSheet): Prim[] {
  const col = (c: string) => (c === 'none' || !c ? undefined : resolveColor(c === 'style' ? style.vertexColor : c));
  const r = vt.scale * style.vertexRadius;
  const stroke = col(vt.stroke);
  const prims = getVertexShape(vt.shape).build(p, r, { fill: col(vt.fill), stroke, width: stroke ? vt.strokeWidth * style.lineWidth : 0 });
  if (vt.tex?.trim()) prims.push(texPrim(vt.tex, p, r * 1.1, stroke ?? '#000000'));
  return prims;
}

export function regionPath(r: Region): PathPrim['d'] {
  if (r.shape === 'ellipse') {
    // Ellipse from a unit circle: 4 Béziers.
    const k = 0.5522847498;
    const cx = r.x + r.w / 2,
      cy = r.y + r.h / 2,
      a = r.w / 2,
      b = r.h / 2;
    return [
      { op: 'M', p: { x: cx + a, y: cy } },
      { op: 'C', c1: { x: cx + a, y: cy + k * b }, c2: { x: cx + k * a, y: cy + b }, p: { x: cx, y: cy + b } },
      { op: 'C', c1: { x: cx - k * a, y: cy + b }, c2: { x: cx - a, y: cy + k * b }, p: { x: cx - a, y: cy } },
      { op: 'C', c1: { x: cx - a, y: cy - k * b }, c2: { x: cx - k * a, y: cy - b }, p: { x: cx, y: cy - b } },
      { op: 'C', c1: { x: cx + k * a, y: cy - b }, c2: { x: cx + a, y: cy - k * b }, p: { x: cx + a, y: cy } },
      { op: 'Z' },
    ];
  }
  const q = Math.min(r.radius, r.w / 2, r.h / 2);
  const k = q * 0.4477152502; // (1 - 0.5523) * q: control point offset from the corner
  const { x, y, w, h } = r;
  if (q <= 0)
    return [
      { op: 'M', p: { x, y } },
      { op: 'L', p: { x: x + w, y } },
      { op: 'L', p: { x: x + w, y: y + h } },
      { op: 'L', p: { x, y: y + h } },
      { op: 'Z' },
    ];
  return [
    { op: 'M', p: { x: x + q, y } },
    { op: 'L', p: { x: x + w - q, y } },
    { op: 'C', c1: { x: x + w - k, y }, c2: { x: x + w, y: y + k }, p: { x: x + w, y: y + q } },
    { op: 'L', p: { x: x + w, y: y + h - q } },
    { op: 'C', c1: { x: x + w, y: y + h - k }, c2: { x: x + w - k, y: y + h }, p: { x: x + w - q, y: y + h } },
    { op: 'L', p: { x: x + q, y: y + h } },
    { op: 'C', c1: { x: x + k, y: y + h }, c2: { x, y: y + h - k }, p: { x, y: y + h - q } },
    { op: 'L', p: { x, y: y + q } },
    { op: 'C', c1: { x, y: y + k }, c2: { x: x + k, y }, p: { x: x + q, y } },
    { op: 'Z' },
  ];
}

function regionPrim(r: Region, style: StyleSheet): PathPrim {
  const fill = r.fill === 'none' ? undefined : resolveColor(r.fill);
  const stroke = r.stroke === 'none' ? undefined : resolveColor(r.stroke);
  const w = style.lineWidth * 0.6;
  return { d: regionPath(r), fill, opacity: fill ? r.opacity : undefined, stroke, width: w, dash: r.dashed && stroke ? [3 * w, 2.5 * w] : undefined };
}

export interface Scene {
  prims: Prim[];
  bbox: BBox | null;
  /** Rendered box of every label, for hit-testing and selection outlines. */
  labelBoxes: Map<string, BBox>;
  paths: Map<string, Path>;
}

/**
 * Full picture of a document: edges, then vertices on top, then labels.
 * With `only`, restrict to those node/edge/label ids (labels also follow their host).
 */
export function buildScene(doc: FrgDocument, only?: Set<string>): Scene {
  const { nodes, edges, labels } = doc.diagram;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const fields = new Map(doc.fieldTypes.map((f) => [f.id, f]));
  const paths = new Map<string, Path>();
  for (const e of edges) {
    const p = edgePath(e, byId);
    if (p) paths.set(e.id, p);
  }
  const prims: Prim[] = [];
  for (const r of doc.diagram.regions ?? []) {
    if (only && !only.has(r.id)) continue;
    prims.push(regionPrim(r, doc.style));
  }
  for (const e of edges) {
    if (only && !only.has(e.id)) continue;
    const p = paths.get(e.id);
    if (p) prims.push(...edgePrims(e, p, fields.get(e.field), doc.style));
  }
  for (const n of nodes) {
    if (only && !only.has(n.id)) continue;
    const vt = vertexTypeOf(doc, n.kind);
    if (vt) prims.push(...vertexPrims(vt, n, doc.style));
  }
  const labelBoxes = new Map<string, BBox>();
  for (const l of labels) {
    const host = labelHost(l);
    if (only && !only.has(l.id) && !(host && only.has(host))) continue;
    const c = labelCenter(l, byId, paths, edgeById);
    if (!c || !l.tex.trim()) continue;
    const size = l.size ?? (l.attach ? doc.style.fontSize : doc.style.termSize);
    const prim = texPrim(l.tex, c, size, resolveColor(l.color ?? 'Black'));
    labelBoxes.set(l.id, prim.tex.box);
    prims.push(prim);
  }
  if (doc.style.colorMode && doc.style.colorMode !== 'color') recolor(prims, doc.style.colorMode);
  return { prims, bbox: bboxOf(prims), labelBoxes, paths };
}

function recolor(prims: Prim[], mode: StyleSheet['colorMode']): void {
  const m = (c: string) => applyColorMode(c, mode);
  for (const p of prims) {
    if ('tex' in p) {
      p.tex.color = m(p.tex.color);
      p.tex.inner = p.tex.inner.replace(/#[0-9a-f]{6}/gi, m);
    } else {
      if (p.stroke) p.stroke = m(p.stroke);
      if (p.fill) p.fill = m(p.fill);
    }
  }
}
