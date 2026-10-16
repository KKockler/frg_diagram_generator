// Pure document operations used by the editor. They mutate a Diagram (typically an immer draft).
import type { DEdge, Diagram, DNode, Group, Label, Vec } from './types';
import { newId } from './defaults';
import type { Path } from '../geometry/path';
import { dist, dot, lerp, normalize, perp, sub } from '../geometry/vec';
import { drawT, edgePath, labelHost } from '../render/scene';

export const nodeMap = (d: Diagram) => new Map(d.nodes.map((n) => [n.id, n]));

/** Sagitta that makes the arc from a to b pass through p (p on the perpendicular bisector). */
export function bendThrough(a: Vec, b: Vec, p: Vec): number {
  return dot(sub(p, lerp(a, b, 0.5)), perp(normalize(sub(b, a))));
}

/** Nearest point on a path: returns arc length s and distance. */
export function nearestOnPath(path: Path, p: Vec, samples = 120): { s: number; d: number } {
  let best = { s: 0, d: Infinity };
  for (let i = 0; i <= samples; i++) {
    const s = (path.length * i) / samples;
    const d = dist(path.pointAt(s), p);
    if (d < best.d) best = { s, d };
  }
  // one refinement pass
  const h = path.length / samples;
  for (let i = -10; i <= 10; i++) {
    const s = Math.min(Math.max(best.s + (h * i) / 10, 0), path.length);
    const d = dist(path.pointAt(s), p);
    if (d < best.d) best = { s, d };
  }
  return best;
}

/** Position t ∈ [0,1] along from→to for arc length s measured in drawing direction. */
export function tFromDrawS(e: DEdge, path: Path, s: number): number {
  return drawT(e, path.length === 0 ? 0 : s / path.length);
}

/** The group containing id, if any. */
export const groupOf = (d: Diagram, id: string): Group | undefined => d.groups.find((g) => g.members.includes(id));

/** Drop dangling group members / labels, empty groups and unused endpoints. */
export function cleanup(d: Diagram): void {
  const used = new Set<string>();
  for (const e of d.edges) used.add(e.from).add(e.to);
  d.nodes = d.nodes.filter((n) => n.kind !== 'external' || used.has(n.id));
  const alive = new Set([...d.nodes.map((n) => n.id), ...d.edges.map((e) => e.id)]);
  d.labels = d.labels.filter((l) => {
    const host = labelHost(l);
    return !host || alive.has(host);
  });
  for (const l of d.labels) alive.add(l.id);
  for (const r of d.regions) alive.add(r.id);
  for (const g of d.groups) g.members = g.members.filter((m) => alive.has(m));
  d.groups = d.groups.filter((g) => g.members.length > 0);
}

export function deleteIds(d: Diagram, ids: Set<string>): void {
  d.nodes = d.nodes.filter((n) => !ids.has(n.id));
  const alive = new Set(d.nodes.map((n) => n.id));
  d.edges = d.edges.filter((e) => !ids.has(e.id) && alive.has(e.from) && alive.has(e.to));
  for (const e of d.edges) e.insertions = e.insertions.filter((i) => !ids.has(i.id));
  d.labels = d.labels.filter((l) => !ids.has(l.id));
  d.regions = d.regions.filter((r) => !ids.has(r.id));
  cleanup(d);
}

/** Insert a node at point p on the edge, splitting it in two while keeping its geometry. */
export function splitEdge(d: Diagram, edgeId: string, p: Vec, kind: string): DNode | null {
  const e = d.edges.find((x) => x.id === edgeId);
  if (!e) return null;
  const nodes = nodeMap(d);
  const path = edgePath(e, nodes);
  if (!path) return null;
  const { s } = nearestOnPath(path, p);
  const t = Math.min(Math.max(tFromDrawS(e, path, s), 0.01), 0.99);
  // Work in from→to orientation.
  const fwd = e.reversed ? path.reverse() : path;
  const sf = t * fwd.length;
  const node: DNode = { id: newId('n'), kind, ...fwd.pointAt(sf) };
  const a = nodes.get(e.from)!;
  const b = nodes.get(e.to)!;
  const e1: DEdge = {
    ...e,
    id: newId('e'),
    to: node.id,
    loop: undefined,
    momentum: undefined,
    bend: bendThrough(a, node, fwd.pointAt(sf / 2)),
    insertions: e.insertions.filter((i) => i.t < t).map((i) => ({ ...i, t: i.t / t })),
  };
  const e2: DEdge = {
    ...e,
    id: newId('e'),
    from: node.id,
    loop: undefined,
    momentum: undefined,
    bend: bendThrough(node, b, fwd.pointAt((sf + fwd.length) / 2)),
    insertions: e.insertions.filter((i) => i.t >= t).map((i) => ({ ...i, t: (i.t - t) / (1 - t) })),
  };
  d.nodes.push(node);
  d.edges.splice(d.edges.indexOf(e), 1, e1, e2);
  for (const l of d.labels) {
    if (l.attach && 'edge' in l.attach && l.attach.edge === e.id) {
      l.attach = l.attach.t < t ? { edge: e1.id, t: l.attach.t / t } : { edge: e2.id, t: (l.attach.t - t) / (1 - t) };
    }
  }
  const g = groupOf(d, e.id);
  if (g) g.members.push(node.id, e1.id, e2.id);
  cleanup(d);
  return node;
}

/** Merge node `src` into `dst` (edges and labels are re-attached). Keeps the more specific kind. */
export function mergeNodes(d: Diagram, src: string, dst: string): void {
  if (src === dst) return;
  const s = d.nodes.find((n) => n.id === src);
  const t = d.nodes.find((n) => n.id === dst);
  if (!s || !t) return;
  if (t.kind === 'external' && s.kind !== 'external') t.kind = s.kind;
  for (const e of d.edges) {
    const wasLoop = e.from === e.to;
    if (e.from === src) e.from = dst;
    if (e.to === src) e.to = dst;
    if (!wasLoop && e.from === e.to) e.loop = { radius: 20, angle: -Math.PI / 2 };
  }
  for (const l of d.labels) if (l.attach && 'node' in l.attach && l.attach.node === src) l.attach = { node: dst };
  d.nodes = d.nodes.filter((n) => n.id !== src);
  cleanup(d);
}

/** Move an insertion onto another edge at position t. */
export function moveInsertion(d: Diagram, insId: string, toEdge: string, t: number): void {
  const from = d.edges.find((e) => e.insertions.some((i) => i.id === insId));
  const to = d.edges.find((e) => e.id === toEdge);
  if (!from || !to) return;
  const ins = from.insertions.find((i) => i.id === insId)!;
  from.insertions = from.insertions.filter((i) => i.id !== insId);
  to.insertions.push({ ...ins, t });
}

/**
 * Everything that belongs to a selection: selected ids, endpoints of selected edges,
 * edges between selected nodes, and labels hanging on any of those.
 */
export function closure(d: Diagram, ids: Iterable<string>): Set<string> {
  const out = new Set(ids);
  for (const e of d.edges) if (out.has(e.id)) out.add(e.from).add(e.to);
  for (const e of d.edges) if (out.has(e.from) && out.has(e.to)) out.add(e.id);
  for (const l of d.labels) {
    const host = labelHost(l);
    if (host && out.has(host)) out.add(l.id);
  }
  return out;
}

/** Deep-copy the given items with fresh ids, shifted by `offset`. Returns new ids and the id map. */
export function duplicate(d: Diagram, ids: Set<string>, offset: Vec): { ids: string[]; map: Map<string, string> } {
  const all = closure(d, ids);
  const map = new Map<string, string>();
  const out: string[] = [];
  const fresh = (old: string, prefix: string) => {
    const id = newId(prefix);
    map.set(old, id);
    out.push(id);
    return id;
  };
  for (const n of d.nodes.filter((n) => all.has(n.id))) {
    d.nodes.push({ ...n, id: fresh(n.id, 'n'), x: n.x + offset.x, y: n.y + offset.y });
  }
  for (const e of d.edges.filter((e) => all.has(e.id))) {
    d.edges.push({
      ...e,
      id: fresh(e.id, 'e'),
      from: map.get(e.from)!,
      to: map.get(e.to)!,
      loop: e.loop && { ...e.loop },
      momentum: e.momentum && { ...e.momentum },
      insertions: e.insertions.map((i) => ({ ...i, id: newId('i') })),
    });
  }
  for (const l of d.labels.filter((l) => all.has(l.id))) {
    const host = labelHost(l);
    const copy: Label = { ...l, id: fresh(l.id, 'l') };
    if (!host) {
      copy.x += offset.x;
      copy.y += offset.y;
    } else copy.attach = 'node' in l.attach! ? { node: map.get(host)! } : { edge: map.get(host)!, t: (l.attach as { t: number }).t };
    d.labels.push(copy);
  }
  for (const r of d.regions.filter((r) => all.has(r.id))) {
    d.regions.push({ ...r, id: fresh(r.id, 'r'), x: r.x + offset.x, y: r.y + offset.y });
  }
  for (const g of [...d.groups]) {
    if (g.members.every((m) => map.has(m))) d.groups.push({ id: newId('g'), name: g.name, members: g.members.map((m) => map.get(m)!) });
  }
  return { ids: out, map };
}

/** Make the selection one group (removing the items from other groups). */
export function groupIds(d: Diagram, ids: Set<string>, name = 'Group'): Group {
  const members = [...closure(d, ids)];
  for (const g of d.groups) g.members = g.members.filter((m) => !members.includes(m));
  const g: Group = { id: newId('g'), name, members };
  d.groups = d.groups.filter((x) => x.members.length > 0);
  d.groups.push(g);
  return g;
}

export function ungroupIds(d: Diagram, ids: Set<string>): void {
  d.groups = d.groups.filter((g) => !g.members.some((m) => ids.has(m)));
}

/** Translate nodes and free labels among `ids` by (dx, dy). */
export function translate(d: Diagram, ids: Set<string>, dx: number, dy: number): void {
  for (const n of d.nodes)
    if (ids.has(n.id)) {
      n.x += dx;
      n.y += dy;
    }
  for (const l of d.labels)
    if (ids.has(l.id) && !l.attach) {
      l.x += dx;
      l.y += dy;
    }
  for (const r of d.regions)
    if (ids.has(r.id)) {
      r.x += dx;
      r.y += dy;
    }
}
