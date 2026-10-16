// Multi-item layout helpers: equation rows and "regulator on each line" sums.
import type { Diagram, FrgDocument } from './types';
import { newId } from './defaults';
import { closure, duplicate, translate } from './ops';
import { buildScene, labelHost } from '../render/scene';
import type { BBox } from '../render/primitives';
import { isRegulator } from '../styles/nodeKinds';

/** Selection grown to whole groups and everything attached. */
export function expandSelection(d: Diagram, ids: Iterable<string>): Set<string> {
  const all = closure(d, ids);
  for (const g of d.groups) if (g.members.some((m) => all.has(m))) for (const m of g.members) all.add(m);
  return closure(d, all);
}

/**
 * Split a selection into independent items: groups, connected components of
 * nodes/edges, and free labels. Attached labels travel with their host.
 */
export function rowItems(d: Diagram, ids: Iterable<string>): Set<string>[] {
  const all = expandSelection(d, ids);
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => {
    if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b));
  };
  for (const id of all) parent.set(id, id);
  for (const e of d.edges) if (all.has(e.id)) union(e.id, e.from), union(e.id, e.to);
  for (const l of d.labels) {
    const host = labelHost(l);
    if (all.has(l.id) && host) union(l.id, host);
  }
  for (const g of d.groups) for (const m of g.members) if (all.has(m)) union(m, g.members[0]);
  const items = new Map<string, Set<string>>();
  for (const id of all) {
    const r = find(id);
    if (!items.has(r)) items.set(r, new Set());
    items.get(r)!.add(id);
  }
  return [...items.values()];
}

/**
 * Place the selected items left to right with the style's gap, vertically centred on
 * the leftmost item. Returns per-item shifts; apply them with translate().
 */
export function planRow(doc: FrgDocument, ids: Iterable<string>): { ids: Set<string>; dx: number; dy: number }[] {
  const items = rowItems(doc.diagram, ids)
    .map((item) => ({ ids: item, box: buildScene(doc, item).bbox }))
    .filter((i): i is { ids: Set<string>; box: BBox } => !!i.box)
    .sort((a, b) => a.box.x + a.box.w / 2 - (b.box.x + b.box.w / 2));
  if (items.length < 2) return [];
  const gap = doc.style.rowGap;
  const cy = items[0].box.y + items[0].box.h / 2;
  let cursor = items[0].box.x + items[0].box.w + gap;
  return items.slice(1).map(({ ids, box }) => {
    const shift = { ids, dx: cursor - box.x, dy: cy - (box.y + box.h / 2) };
    cursor += box.w + gap;
    return shift;
  });
}

export function arrangeRow(d: Diagram, plan: ReturnType<typeof planRow>): void {
  for (const s of plan) translate(d, s.ids, s.dx, s.dy);
}

/**
 * Turn one diagram into the sum of copies with the regulator on each internal line in turn,
 * separated by "+" labels. `doc` is the current (pre-change) document, used for measuring.
 * Returns the ids of everything in the resulting sum, or null if there is nothing to distribute.
 */
export function regulatorSum(d: Diagram, doc: FrgDocument, ids: Iterable<string>): string[] | null {
  const item = expandSelection(doc.diagram, ids);
  const nodes = new Map(doc.diagram.nodes.map((n) => [n.id, n]));
  const internal = doc.diagram.edges.filter(
    (e) => item.has(e.id) && e.field !== 'aux' && nodes.get(e.from)?.kind !== 'external' && nodes.get(e.to)?.kind !== 'external',
  );
  const box = buildScene(doc, item).bbox;
  if (!internal.length || !box) return null;

  // Keep the kind of regulator the diagram already carries.
  const kind = d.edges.flatMap((e) => (item.has(e.id) ? e.insertions : [])).find((i) => isRegulator(i.kind))?.kind ?? 'regulator';
  const setRegulator = (edgeIds: Set<string>, on: string) => {
    for (const e of d.edges) {
      if (!edgeIds.has(e.id)) continue;
      e.insertions = e.insertions.filter((i) => !isRegulator(i.kind));
      if (e.id === on) e.insertions.push({ id: newId('i'), kind, t: 0.5 });
    }
  };
  setRegulator(item, internal[0].id);

  const gap = doc.style.rowGap;
  const plusW = doc.style.termSize;
  const step = box.w + 2 * gap + plusW;

  // Make room: push items to the right of this diagram in the same row further right.
  const others = [...doc.diagram.nodes, ...doc.diagram.edges, ...doc.diagram.labels, ...doc.diagram.regions].map((x) => x.id).filter((id) => !item.has(id));
  for (const other of rowItems(doc.diagram, others)) {
    const b = buildScene(doc, other).bbox;
    const sameRow = b && b.y < box.y + box.h && b.y + b.h > box.y;
    if (b && sameRow && b.x >= box.x + box.w - 1) translate(d, other, (internal.length - 1) * step, 0);
  }

  const out = [...item];
  internal.slice(1).forEach((e, k) => {
    const shift = (k + 1) * step;
    const { ids: copy, map } = duplicate(d, item, { x: shift, y: 0 });
    setRegulator(new Set(copy), map.get(e.id)!);
    const plus = { id: newId('l'), tex: '+', x: box.x + shift - gap - plusW / 2, y: box.y + box.h / 2 };
    d.labels.push(plus);
    out.push(...copy, plus.id);
  });
  return out;
}

// ---- align / distribute / rotate / mirror --------------------------------------

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

type Shift = { ids: Set<string>; dx: number; dy: number };

function measuredItems(doc: FrgDocument, ids: Iterable<string>) {
  return rowItems(doc.diagram, ids)
    .map((item) => ({ ids: item, box: buildScene(doc, item).bbox }))
    .filter((i): i is { ids: Set<string>; box: BBox } => !!i.box);
}

/** Align the selected items' bounding boxes to a common edge or centre line. */
export function planAlign(doc: FrgDocument, ids: Iterable<string>, mode: AlignMode): Shift[] {
  const items = measuredItems(doc, ids);
  if (items.length < 2) return [];
  const x0 = Math.min(...items.map((i) => i.box.x));
  const x1 = Math.max(...items.map((i) => i.box.x + i.box.w));
  const y0 = Math.min(...items.map((i) => i.box.y));
  const y1 = Math.max(...items.map((i) => i.box.y + i.box.h));
  return items.map(({ ids, box: b }) => {
    const dx = mode === 'left' ? x0 - b.x : mode === 'right' ? x1 - b.x - b.w : mode === 'hcenter' ? (x0 + x1) / 2 - b.x - b.w / 2 : 0;
    const dy = mode === 'top' ? y0 - b.y : mode === 'bottom' ? y1 - b.y - b.h : mode === 'vcenter' ? (y0 + y1) / 2 - b.y - b.h / 2 : 0;
    return { ids, dx, dy };
  });
}

/** Spread items so the gaps between neighbours are equal; the outermost items stay put. */
export function planDistribute(doc: FrgDocument, ids: Iterable<string>, axis: 'x' | 'y'): Shift[] {
  const items = measuredItems(doc, ids);
  if (items.length < 3) return [];
  const pos = (b: BBox) => (axis === 'x' ? b.x : b.y);
  const size = (b: BBox) => (axis === 'x' ? b.w : b.h);
  items.sort((a, b) => pos(a.box) - pos(b.box));
  const first = items[0].box;
  const last = items[items.length - 1].box;
  const total = pos(last) + size(last) - pos(first);
  const gap = (total - items.reduce((s, i) => s + size(i.box), 0)) / (items.length - 1);
  let cursor = pos(first);
  return items.map(({ ids, box }) => {
    const d = cursor - pos(box);
    cursor += size(box) + gap;
    return { ids, dx: axis === 'x' ? d : 0, dy: axis === 'y' ? d : 0 };
  });
}

export const applyShifts = (d: Diagram, plan: Shift[]) => plan.forEach((s) => translate(d, s.ids, s.dx, s.dy));

export type Transform = { kind: 'rotate'; angle: number } | { kind: 'mirror'; axis: 'x' | 'y' };

/**
 * Rotate or mirror the selection about the centre of its vertices, free labels and regions.
 * Lines follow their end points; bends flip under mirroring so arcs keep their shape.
 */
export function transformSelection(d: Diagram, ids: Iterable<string>, t: Transform): void {
  const all = expandSelection(d, ids);
  const pts = [
    ...d.nodes.filter((n) => all.has(n.id)),
    ...d.labels.filter((l) => all.has(l.id) && !l.attach),
    ...d.regions.filter((r) => all.has(r.id)).map((r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })),
  ];
  if (!pts.length) return;
  const cx = (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2;
  const cy = (Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2;
  const cos = t.kind === 'rotate' ? Math.cos(t.angle) : 1;
  const sin = t.kind === 'rotate' ? Math.sin(t.angle) : 0;
  /** Map a vector relative to the centre. */
  const vec = (x: number, y: number) =>
    t.kind === 'rotate' ? { x: cos * x - sin * y, y: sin * x + cos * y } : t.axis === 'x' ? { x: -x, y } : { x, y: -y };
  const point = <P extends { x: number; y: number }>(p: P) => {
    const v = vec(p.x - cx, p.y - cy);
    p.x = cx + v.x;
    p.y = cy + v.y;
  };
  for (const n of d.nodes) if (all.has(n.id)) point(n);
  for (const e of d.edges) {
    if (!all.has(e.id)) continue;
    if (e.loop) {
      const v = vec(Math.cos(e.loop.angle), Math.sin(e.loop.angle));
      e.loop.angle = Math.atan2(v.y, v.x);
    }
    if (t.kind === 'mirror') {
      e.bend = -e.bend;
      if (e.momentum) e.momentum.side = e.momentum.side === 1 ? -1 : 1;
    }
  }
  for (const l of d.labels) {
    if (!all.has(l.id)) continue;
    if (!l.attach) point(l);
    else {
      const v = vec(l.x, l.y);
      l.x = v.x;
      l.y = v.y;
    }
  }
  for (const r of d.regions) {
    if (!all.has(r.id)) continue;
    const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    point(c);
    // Regions stay axis-aligned; a quarter turn swaps width and height.
    if (t.kind === 'rotate' && Math.abs(Math.abs(Math.sin(t.angle)) - 1) < 1e-6) [r.w, r.h] = [r.h, r.w];
    r.x = c.x - r.w / 2;
    r.y = c.y - r.h / 2;
  }
}
