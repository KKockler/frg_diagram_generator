// Pre-built standard topologies. Each is drawn with the style sheet's canonical sizes,
// so every bubble / tadpole / box in a document comes out identical.
import type { DEdge, Diagram, DNode, Label, StyleSheet, Vec } from './types';
import { newId } from './defaults';
import { add, fromAngle } from '../geometry/vec';
import { bendThrough } from './ops';

export interface StampCtx {
  at: Vec;
  style: StyleSheet;
  /** Field used for external legs and for internal lines. */
  field: string;
}

export interface Stamp {
  id: string;
  label: string;
  /** Returns the diagram's items, grouped as one unit named after the stamp. */
  build(ctx: StampCtx): Diagram;
}

class Builder {
  nodes: DNode[] = [];
  edges: DEdge[] = [];
  labels: Label[] = [];
  name = 'Diagram';
  constructor(readonly field: string) {}
  node(p: Vec, kind = 'fullVertex'): string {
    const id = newId('n');
    this.nodes.push({ id, kind, x: p.x, y: p.y });
    return id;
  }
  edge(from: string, to: string, bend = 0, extra: Partial<DEdge> = {}): DEdge {
    const e: DEdge = { id: newId('e'), from, to, field: this.field, bend, reversed: false, insertions: [], ...extra };
    this.edges.push(e);
    return e;
  }
  regulator(e: DEdge, t = 0.5) {
    e.insertions.push({ id: newId('i'), kind: 'regulator', t });
  }
  /** External leg pointing into vertex v from direction phi. */
  leg(v: string, vp: Vec, phi: number, length: number) {
    const ext = this.node(add(vp, fromAngle(phi, length)), 'external');
    // Legs are oriented towards the vertex on the incoming side (phi pointing left).
    if (Math.cos(phi) < -1e-6) this.edge(ext, v);
    else this.edge(v, ext);
  }
  /** Vertices on a circle joined by arcs of that circle (or straight lines: a polygon), oriented in the order given. */
  ring(c: Vec, r: number, angles: number[], straight = false): { ids: string[]; pts: Vec[]; edges: DEdge[] } {
    const pts = angles.map((a) => add(c, fromAngle(a, r)));
    const ids = pts.map((p) => this.node(p));
    const edges = angles.map((a, i) => {
      const j = (i + 1) % angles.length;
      let b = angles[j];
      while (b <= a) b += 2 * Math.PI;
      const mid = add(c, fromAngle((a + b) / 2, r));
      return this.edge(ids[i], ids[j], straight ? 0 : bendThrough(pts[i], pts[j], mid));
    });
    return { ids, pts, edges };
  }
  label(tex: string, attach: Label['attach'], x: number, y: number): Label {
    const l: Label = { id: newId('l'), tex, x, y, attach };
    this.labels.push(l);
    return l;
  }
  done(): Diagram {
    const members = [...this.nodes, ...this.edges, ...this.labels].map((x) => x.id);
    return { nodes: this.nodes, edges: this.edges, labels: this.labels, regions: [], groups: [{ id: newId('g'), name: this.name, members }] };
  }
}

const deg = Math.PI / 180;
/** Corner radius of a regular n-gon whose sides are as long as the bubble is wide (2 × loop radius). */
const polygonRadius = (style: StyleSheet, n: number) => style.loopRadius / Math.sin(Math.PI / n);
// Screen coordinates: y down, so angle −90° is "up".
const TOP = -90 * deg;

export const STAMPS: Stamp[] = [
  {
    id: 'propagator',
    label: 'Propagator',
    build({ at, style, field }) {
      const b = new Builder(field);
      const L = style.legLength * 1.5;
      b.edge(b.node(add(at, { x: -L, y: 0 }), 'external'), b.node(add(at, { x: L, y: 0 }), 'external'));
      return b.done();
    },
  },
  {
    id: 'regulatorProp',
    label: 'Regulator insertion',
    build({ at, style, field }) {
      const b = new Builder(field);
      const L = style.legLength * 1.5;
      const e = b.edge(b.node(add(at, { x: -L, y: 0 }), 'external'), b.node(add(at, { x: L, y: 0 }), 'external'));
      b.regulator(e);
      return b.done();
    },
  },
  {
    id: 'wetterich',
    label: 'Wetterich loop (one-loop flow)',
    build({ at, style, field }) {
      // A closed propagator with the regulator on top: ∂ₜΓ = ½ STr G ∂ₜR. The loop hangs on an
      // invisible node at its bottom, so it has no vertex.
      const b = new Builder(field);
      const r = style.loopRadius;
      const v = b.node(add(at, { x: 0, y: r }), 'external');
      b.regulator(b.edge(v, v, 0, { loop: { radius: r, angle: TOP } }));
      return b.done();
    },
  },
  {
    id: 'tadpole',
    label: 'Tadpole',
    build({ at, style, field }) {
      const b = new Builder(field);
      const r = style.loopRadius;
      const v = b.node(at);
      const loop = b.edge(v, v, 0, { loop: { radius: r, angle: TOP } });
      b.regulator(loop);
      b.leg(v, at, 180 * deg, style.legLength + r * 0.5);
      b.leg(v, at, 0, style.legLength + r * 0.5);
      return b.done();
    },
  },
  {
    id: 'bubble',
    label: 'Polarisation / self-energy',
    build({ at, style, field }) {
      const b = new Builder(field);
      const r = style.loopRadius;
      const { ids, pts, edges } = b.ring(at, r, [180 * deg, 0]);
      b.regulator(edges[0]);
      b.leg(ids[0], pts[0], 180 * deg, style.legLength);
      b.leg(ids[1], pts[1], 0, style.legLength);
      return b.done();
    },
  },
  {
    id: 'fish',
    label: 'Fish (4-point)',
    build({ at, style, field }) {
      const b = new Builder(field);
      const r = style.loopRadius;
      const { ids, pts, edges } = b.ring(at, r, [180 * deg, 0]);
      b.regulator(edges[0]);
      // Legs as on the 4-point vertex: ±45° from the axis, 1.3 × the leg length.
      for (const a of [135, 225]) b.leg(ids[0], pts[0], a * deg, style.legLength * 1.3);
      for (const a of [45, -45]) b.leg(ids[1], pts[1], a * deg, style.legLength * 1.3);
      return b.done();
    },
  },
  {
    id: 'triangle',
    label: 'Triangle (3-point)',
    build({ at, style, field }) {
      const b = new Builder(field);
      const angles = [150, 270, 30].map((a) => a * deg);
      const { ids, pts, edges } = b.ring(at, polygonRadius(style, angles.length), angles, true);
      b.regulator(edges[0]);
      angles.forEach((a, i) => b.leg(ids[i], pts[i], a, style.legLength));
      return b.done();
    },
  },
  {
    id: 'box',
    label: 'Box (4-point)',
    build({ at, style, field }) {
      const b = new Builder(field);
      const angles = [135, 225, 315, 45].map((a) => a * deg);
      const { ids, pts, edges } = b.ring(at, polygonRadius(style, angles.length), angles, true);
      b.regulator(edges[1]);
      angles.forEach((a, i) => b.leg(ids[i], pts[i], a, style.legLength));
      return b.done();
    },
  },
  {
    id: 'sunset',
    label: 'Sunset (2-loop)',
    build({ at, style, field }) {
      const b = new Builder(field);
      const r = style.loopRadius;
      const pl = add(at, { x: -r, y: 0 });
      const pr = add(at, { x: r, y: 0 });
      const l = b.node(pl);
      const rr = b.node(pr);
      b.regulator(b.edge(l, rr, -r));
      b.edge(l, rr, 0);
      b.edge(rr, l, -r);
      b.leg(l, pl, 180 * deg, style.legLength);
      b.leg(rr, pr, 0, style.legLength);
      return b.done();
    },
  },
  {
    id: 'vertex4',
    label: '4-point vertex',
    build({ at, style, field }) {
      const b = new Builder(field);
      const v = b.node(at);
      for (const a of [135, 225, 45, -45]) b.leg(v, at, a * deg, style.legLength * 1.3);
      return b.done();
    },
  },
  {
    id: 'npoint',
    label: 'n-point vertex Γ⁽ⁿ⁾',
    build({ at, style, field }) {
      // Vertex at the bottom, two legs opening upwards, dotted arc labelled n between them.
      const b = new Builder(field);
      const v = b.node(at);
      const L = style.legLength * 1.4;
      const angles = [-125 * deg, -55 * deg];
      for (const a of angles) b.edge(b.node(add(at, fromAngle(a, L)), 'external'), v);
      const r = L * 0.7;
      const [p, q] = angles.map((a) => add(at, fromAngle(a, r)));
      const arc = b.edge(b.node(p, 'external'), b.node(q, 'external'), 0, { field: 'aux' });
      arc.bend = bendThrough(p, q, add(at, fromAngle(TOP, r)));
      b.label('n', { edge: arc.id, t: 0.5 }, 0, -style.fontSize * 0.6);
      return b.done();
    },
  },
  {
    id: 'exchange',
    label: 'Boson exchange (4-point)',
    build({ at, style, field }) {
      // Two vertices joined by an internal line, two legs on each: the bosonised 4-fermion vertex.
      const b = new Builder(field);
      const h = style.loopRadius;
      const top = add(at, { x: 0, y: -h });
      const bottom = add(at, { x: 0, y: h });
      const t = b.node(top);
      const u = b.node(bottom);
      b.edge(t, u);
      for (const a of [-150, -30]) b.leg(t, top, a * deg, style.legLength);
      for (const a of [150, 30]) b.leg(u, bottom, a * deg, style.legLength);
      return b.done();
    },
  },
];

// Every stamp's group is named after it.
for (const s of STAMPS) {
  const build = s.build;
  s.build = (ctx) => {
    const d = build(ctx);
    d.groups[0].name = s.label;
    return d;
  };
}

export const getStamp = (id: string) => STAMPS.find((s) => s.id === id) ?? STAMPS[0];

/** Directions of k legs fanned around the outward direction phi. */
function fan(phi: number, k: number, step: number): number[] {
  return Array.from({ length: k }, (_, j) => phi + (j - (k - 1) / 2) * step);
}

/**
 * A one-loop diagram: legs.length vertices on a ring, vertex i carrying legs[i] external legs.
 * Line i runs from vertex i to vertex i + 1, so the ring is oriented; its regulator sits on line 0.
 * One vertex is a tadpole (loop on top, legs fanned below), two a bubble, more a regular polygon
 * with a horizontal bottom side, sized like the triangle and box.
 */
export function buildRing(ctx: StampCtx, legs: number[]): Diagram {
  const { at, style, field } = ctx;
  const b = new Builder(field);
  b.name = 'Ring';
  const n = legs.length;
  const r = style.loopRadius;
  let ids: string[];
  let pts: Vec[];
  let edges: DEdge[];
  let outward: number[];
  if (n === 1) {
    ids = [b.node(at)];
    pts = [at];
    edges = [b.edge(ids[0], ids[0], 0, { loop: { radius: r, angle: TOP } })];
    outward = [90 * deg];
  } else {
    outward = n === 2 ? [180 * deg, 0] : legs.map((_, i) => (90 + 180 / n + (i * 360) / n) * deg);
    ({ ids, pts, edges } = b.ring(at, n === 2 ? r : polygonRadius(style, n), outward, n > 2));
  }
  b.regulator(edges[0]);
  legs.forEach((k, i) => {
    if (n === 1) {
      // Over the lower half, from left to right: two legs are the tadpole's.
      const dirs = k === 1 ? [90 * deg] : Array.from({ length: k }, (_, j) => (180 - (j * 180) / (k - 1)) * deg);
      for (const a of dirs) b.leg(ids[i], pts[i], a, style.legLength + r * 0.5);
      return;
    }
    // Two legs on a bubble vertex sit like the fish's; otherwise at most 120° wide.
    const step = n === 2 && k === 2 ? 90 * deg : (Math.min(60, 120 / Math.max(k - 1, 1)) * deg);
    const len = k > 1 ? style.legLength * 1.3 : style.legLength;
    for (const a of fan(outward[i], k, step)) b.leg(ids[i], pts[i], a, len);
  });
  return b.done();
}
