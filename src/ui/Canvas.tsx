import { useEffect, useMemo, useRef, useState } from 'react';
import type { DEdge, Label, Vec } from '../model/types';
import { newId } from '../model/defaults';
import { bendThrough, groupOf, mergeNodes, moveInsertion, nearestOnPath, nodeMap, splitEdge, tFromDrawS } from '../model/ops';
import { getStamp } from '../model/stamps';
import { instantiate, missingFields, missingVertexTypes } from '../model/library';
import { allTemplates } from './actions';
import { dist, normalize, scale, sub } from '../geometry/vec';
import { buildScene, drawT, vertexRadius } from '../render/scene';
import { unionBox, type BBox } from '../render/primitives';
import { cmdsToD } from '../render/svg';
import { useEditor } from '../store/store';
import { PrimPath } from './PrimPath';

type Hit =
  | { type: 'node'; id: string }
  | { type: 'edge'; id: string }
  | { type: 'label'; id: string }
  | { type: 'insertion'; id: string; edgeId: string }
  | { type: 'region'; id: string }
  | { type: 'resize'; id: string }
  | { type: 'bend'; id: string };

type Drag =
  | { kind: 'move'; start: Vec; anchor: Vec; nodes: Map<string, Vec>; labels: Map<string, Vec>; regions: Map<string, Vec>; single?: string }
  | { kind: 'region'; start: Vec; cur: Vec }
  | { kind: 'resize'; id: string }
  | { kind: 'bend'; edgeId: string }
  | { kind: 'insertion'; edgeId: string; insId: string }
  | { kind: 'line'; from: string | null; fromPt: Vec; cur: Vec; paint?: string }
  | { kind: 'band'; start: Vec; cur: Vec; additive: boolean }
  | { kind: 'pan'; startClient: Vec; startView: View };

interface View {
  x: number;
  y: number;
  zoom: number;
}

const deg = Math.PI / 180;

export function Canvas() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const snapOn = useEditor((s) => s.snap);
  const st = doc.style;
  const D = doc.diagram;

  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ x: 400, y: 300, zoom: 2 });
  const [hover, setHover] = useState<Hit | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const spaceDown = useRef(false);

  useEffect(() => {
    const el = svgRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    const kd = (e: KeyboardEvent) => e.code === 'Space' && (spaceDown.current = true);
    const ku = (e: KeyboardEvent) => e.code === 'Space' && (spaceDown.current = false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      ro.disconnect();
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, []);

  // Zoom to fit on request (document opened, "0" key); the first request waits for the real size.
  const fitRequest = useEditor((s) => s.fitRequest);
  const fitted = useRef(0);
  useEffect(() => {
    if (fitted.current === fitRequest || size.w < 50) return;
    fitted.current = fitRequest;
    const b = buildScene(useEditor.getState().doc).bbox;
    if (!b) return;
    const zoom = Math.min(Math.max(Math.min((size.w - 60) / b.w, (size.h - 60) / b.h), 0.2), 4);
    setView({ zoom, x: size.w / 2 - (b.x + b.w / 2) * zoom, y: size.h / 2 - (b.y + b.h / 2) * zoom });
  }, [fitRequest, size]);

  const nodes = useMemo(() => nodeMap(D), [D]);
  const scene = useMemo(() => buildScene(doc), [doc]);
  const paths = scene.paths;
  const sel = useMemo(() => new Set(selection), [selection]);
  const singleEdge = selection.length === 1 ? D.edges.find((e) => e.id === selection[0]) : undefined;

  /** Outlines of groups that are entirely selected, so a placed diagram reads as one unit. */
  const groupBoxes = useMemo(() => {
    const out: BBox[] = [];
    for (const g of D.groups) {
      if (!g.members.every((m) => sel.has(m))) continue;
      const b = buildScene(doc, new Set(g.members)).bbox;
      if (b) out.push(b);
    }
    return out;
  }, [doc, D.groups, sel]);

  // ---- coordinates ---------------------------------------------------------
  const toModel = (ev: { clientX: number; clientY: number }): Vec => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (ev.clientX - r.left - view.x) / view.zoom, y: (ev.clientY - r.top - view.y) / view.zoom };
  };
  const snap = (p: Vec, alt = false): Vec => {
    if (!snapOn || alt) return p;
    const g = st.gridSize;
    return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
  };
  const tol = 7 / view.zoom;

  const insertionPos = (e: DEdge, insT: number): Vec | null => {
    const p = paths.get(e.id);
    return p ? p.pointAt(drawT(e, insT) * p.length) : null;
  };

  const hitNode = (p: Vec, exclude?: Set<string>): string | null => {
    let best: string | null = null;
    let bd = Infinity;
    for (const n of D.nodes) {
      if (exclude?.has(n.id)) continue;
      const d = dist(n, p);
      const r = n.kind === 'external' ? 4 : vertexRadius(doc, n.kind);
      if (d < r + tol && d < bd) {
        bd = d;
        best = n.id;
      }
    }
    return best;
  };

  const hitEdge = (p: Vec): { id: string; d: number } | null => {
    let best: { id: string; d: number } | null = null;
    for (const [id, path] of paths) {
      const { d } = nearestOnPath(path, p, 60);
      if (d < tol + st.doubleSep && (!best || d < best.d)) best = { id, d };
    }
    return best;
  };

  const singleRegion = selection.length === 1 ? D.regions.find((r) => r.id === selection[0]) : undefined;

  const hitTest = (p: Vec): Hit | null => {
    if (singleRegion && tool === 'select' && dist(p, { x: singleRegion.x + singleRegion.w, y: singleRegion.y + singleRegion.h }) < tol + 2)
      return { type: 'resize', id: singleRegion.id };
    // The bend handle only exists for the Select tool; other tools must see the line itself.
    if (singleEdge && tool === 'select') {
      const path = paths.get(singleEdge.id);
      if (path && dist(path.pointAt(path.length / 2), p) < tol + 2) return { type: 'bend', id: singleEdge.id };
    }
    for (const e of D.edges)
      for (const i of e.insertions) {
        const q = insertionPos(e, i.t);
        if (q && dist(q, p) < st.regulatorRadius + tol / 2) return { type: 'insertion', id: i.id, edgeId: e.id };
      }
    for (const [id, b] of scene.labelBoxes)
      if (p.x > b.x - tol / 2 && p.x < b.x + b.w + tol / 2 && p.y > b.y - tol / 2 && p.y < b.y + b.h + tol / 2) return { type: 'label', id };
    const n = hitNode(p);
    if (n) return { type: 'node', id: n };
    const e = hitEdge(p);
    if (e) return { type: 'edge', id: e.id };
    // Regions lie behind everything, so they are hit last (topmost first).
    for (const r of [...D.regions].reverse()) {
      const inside =
        r.shape === 'ellipse'
          ? ((p.x - r.x - r.w / 2) / (r.w / 2)) ** 2 + ((p.y - r.y - r.h / 2) / (r.h / 2)) ** 2 <= 1
          : p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      if (inside) return { type: 'region', id: r.id };
    }
    return null;
  };

  /** Clicking a member of a group selects the whole group. */
  const selectionFor = (id: string): string[] => groupOf(D, id)?.members ?? [id];

  const api = useEditor.getState;

  /** Label defaults: a line is labelled with its field's symbol. */
  const fieldTex = (edgeId: string | undefined) => {
    const e = D.edges.find((x) => x.id === edgeId);
    return doc.fieldTypes.find((f) => f.id === e?.field)?.tex || 'x';
  };

  const addLabel = (l: Label) => {
    const s = api();
    s.apply((d) => void d.diagram.labels.push(l));
    s.set({ selection: [l.id], focusLabel: s.focusLabel + 1 });
  };

  // ---- pointer handlers ----------------------------------------------------
  const onPointerDown = (ev: React.PointerEvent) => {
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    const p = toModel(ev);
    if (ev.button === 1 || spaceDown.current) {
      setDrag({ kind: 'pan', startClient: { x: ev.clientX, y: ev.clientY }, startView: view });
      return;
    }
    if (ev.button !== 0) return;
    const hit = hitTest(p);
    const s = api();

    if (tool === 'region') {
      const q = snap(p, ev.altKey);
      setDrag({ kind: 'region', start: q, cur: q });
      return;
    }

    if (tool === 'select') {
      if (hit?.type === 'resize') {
        s.beginGesture();
        setDrag({ kind: 'resize', id: hit.id });
      } else if (hit?.type === 'bend') {
        s.beginGesture();
        setDrag({ kind: 'bend', edgeId: hit.id });
      } else if (hit?.type === 'insertion') {
        s.set({ selection: [hit.id] });
        s.beginGesture();
        setDrag({ kind: 'insertion', edgeId: hit.edgeId, insId: hit.id });
      } else if (hit) {
        const ids = selectionFor(hit.id);
        let next = selection;
        if (ev.shiftKey) next = sel.has(hit.id) ? selection.filter((x) => !ids.includes(x)) : [...new Set([...selection, ...ids])];
        else if (!sel.has(hit.id)) next = ids;
        s.set({ selection: next });
        startMove(p, next, hit.type === 'node' ? hit.id : undefined);
      } else {
        setDrag({ kind: 'band', start: p, cur: p, additive: ev.shiftKey });
      }
      return;
    }

    if (tool === 'line') {
      const from = hit?.type === 'node' ? hit.id : null;
      const fromPt = from ? { x: nodes.get(from)!.x, y: nodes.get(from)!.y } : snap(p, ev.altKey);
      // A plain click on a line repaints it with the active field.
      setDrag({ kind: 'line', from, fromPt, cur: fromPt, paint: hit?.type === 'edge' ? hit.id : undefined });
      return;
    }

    if (tool === 'vertex') {
      const kind = s.activeNodeKind;
      if (hit?.type === 'node') {
        s.apply((d) => void (d.diagram.nodes.find((n) => n.id === hit.id)!.kind = kind));
      } else if (hit?.type === 'edge') {
        let id = '';
        s.apply((d) => void (id = splitEdge(d.diagram, hit.id, p, kind)?.id ?? ''));
        if (id) s.set({ selection: [id] });
      } else if (!hit) {
        const id = newId('n');
        s.apply((d) => void d.diagram.nodes.push({ id, kind, ...snap(p, ev.altKey) }));
        s.set({ selection: [id] });
      }
      return;
    }

    if (tool === 'insertion') {
      if (hit?.type === 'insertion') s.set({ selection: [hit.id] });
      else if (hit?.type === 'edge') {
        const e = D.edges.find((x) => x.id === hit.id)!;
        const path = paths.get(e.id)!;
        let t = tFromDrawS(e, path, nearestOnPath(path, p).s);
        if (snapOn && Math.abs(t - 0.5) < 0.08) t = 0.5;
        const id = newId('i');
        s.apply((d) => void d.diagram.edges.find((x) => x.id === e.id)!.insertions.push({ id, kind: s.activeInsertion, t }));
        s.set({ selection: [id] });
      }
      return;
    }

    if (tool === 'text') {
      if (hit?.type === 'label') {
        s.set({ selection: [hit.id], focusLabel: s.focusLabel + 1 });
      } else if (hit?.type === 'node') {
        const edge = D.edges.find((e) => e.from === hit.id || e.to === hit.id);
        const n = nodes.get(hit.id)!;
        addLabel({ id: newId('l'), tex: fieldTex(edge?.id), x: 0, y: -(Math.max(vertexRadius(doc, n.kind), 3) + st.fontSize * 0.7), attach: { node: hit.id } });
      } else if (hit?.type === 'edge' || hit?.type === 'insertion') {
        const e = D.edges.find((x) => x.id === (hit.type === 'edge' ? hit.id : hit.edgeId))!;
        const path = paths.get(e.id)!;
        const { s: sd } = nearestOnPath(path, p);
        const q = path.pointAt(sd);
        const off = scale(normalize(sub(p, q)), st.doubleSep / 2 + st.fontSize * 0.8);
        addLabel({ id: newId('l'), tex: fieldTex(e.id), x: off.x, y: off.y, attach: { edge: e.id, t: tFromDrawS(e, path, sd) } });
      } else {
        addLabel({ id: newId('l'), tex: '+', ...snap(p, ev.altKey) });
      }
      return;
    }

    if (tool === 'stamp') {
      const at = snap(p, ev.altKey);
      const tpl = s.activeStamp.startsWith('lib:') ? allTemplates().find((t) => 'lib:' + t.id === s.activeStamp) : undefined;
      const dg = tpl ? instantiate(tpl, at) : getStamp(s.activeStamp).build({ at, style: st, field: s.activeField });
      const extraFields = tpl ? missingFields(doc, tpl.fields) : [];
      const extraVertices = tpl ? missingVertexTypes(doc, tpl.vertexTypes) : [];
      s.apply((d) => {
        d.fieldTypes.push(...extraFields);
        d.vertexTypes.push(...extraVertices);
        d.diagram.nodes.push(...dg.nodes);
        d.diagram.edges.push(...dg.edges);
        d.diagram.labels.push(...dg.labels);
        d.diagram.groups.push(...dg.groups);
      });
      // Back to Select, so a second click doesn't drop an identical diagram on top.
      s.set({ selection: dg.groups[0].members, tool: 'select' });
    }
  };

  /** Start dragging the selection: nodes move, free labels move, lone attached labels shift their offset. */
  const startMove = (p: Vec, ids: string[], anchorNode?: string) => {
    const set = new Set(ids);
    const moving = new Map<string, Vec>();
    for (const id of ids) if (nodes.has(id)) moving.set(id, { x: nodes.get(id)!.x, y: nodes.get(id)!.y });
    for (const e of D.edges)
      if (set.has(e.id))
        for (const n of [e.from, e.to]) moving.set(n, { x: nodes.get(n)!.x, y: nodes.get(n)!.y });
    const labels = new Map<string, Vec>();
    for (const l of D.labels) {
      if (!set.has(l.id)) continue;
      const host = l.attach ? ('node' in l.attach ? l.attach.node : l.attach.edge) : undefined;
      const hostMoves = host && (moving.has(host) || set.has(host));
      if (!hostMoves) labels.set(l.id, { x: l.x, y: l.y });
    }
    const regions = new Map(D.regions.filter((r) => set.has(r.id)).map((r) => [r.id, { x: r.x, y: r.y }]));
    if (!moving.size && !labels.size && !regions.size) return;
    const anchor = (anchorNode && moving.get(anchorNode)) || [...moving.values()][0] || [...labels.values()][0] || [...regions.values()][0];
    api().beginGesture();
    setDrag({ kind: 'move', start: p, anchor, nodes: moving, labels, regions, single: moving.size === 1 && !labels.size && !regions.size ? [...moving.keys()][0] : undefined });
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    const p = toModel(ev);
    const d = dragRef.current;
    if (!d) {
      setHover(tool === 'stamp' ? null : hitTest(p));
      return;
    }
    const s = api();
    switch (d.kind) {
      case 'pan':
        setView({ ...d.startView, x: d.startView.x + ev.clientX - d.startClient.x, y: d.startView.y + ev.clientY - d.startClient.y });
        break;
      case 'move': {
        const o = d.anchor;
        const target = snap({ x: o.x + p.x - d.start.x, y: o.y + p.y - d.start.y }, ev.altKey);
        const dx = target.x - o.x;
        const dy = target.y - o.y;
        s.apply((dr) => {
          for (const n of dr.diagram.nodes) {
            const q = d.nodes.get(n.id);
            if (q) {
              n.x = q.x + dx;
              n.y = q.y + dy;
            }
          }
          for (const l of dr.diagram.labels) {
            const q = d.labels.get(l.id);
            if (q) {
              l.x = q.x + dx;
              l.y = q.y + dy;
            }
          }
          for (const r of dr.diagram.regions) {
            const q = d.regions.get(r.id);
            if (q) {
              r.x = q.x + dx;
              r.y = q.y + dy;
            }
          }
        }, false);
        break;
      }
      case 'region':
        setDrag({ ...d, cur: snap(p, ev.altKey) });
        break;
      case 'resize': {
        const q = snap(p, ev.altKey);
        s.apply((dr) => {
          const r = dr.diagram.regions.find((x) => x.id === d.id);
          if (r) {
            r.w = Math.max(q.x - r.x, 4);
            r.h = Math.max(q.y - r.y, 4);
          }
        }, false);
        break;
      }
      case 'bend':
        s.apply((dr) => {
          const e = dr.diagram.edges.find((x) => x.id === d.edgeId)!;
          const a = nodes.get(e.from)!;
          if (e.from === e.to) {
            const v = sub(p, a);
            let angle = Math.atan2(v.y, v.x);
            let radius = Math.hypot(v.x, v.y) / 2;
            if (snapOn && !ev.altKey) {
              angle = Math.round(angle / (15 * deg)) * 15 * deg;
              radius = Math.abs(radius - st.loopRadius) < 3 ? st.loopRadius : Math.round(radius);
            }
            e.loop = { radius: Math.max(radius, 3), angle };
          } else {
            const b = nodes.get(e.to)!;
            const half = dist(a, b) / 2;
            let bend = bendThrough(a, b, p);
            if (snapOn && !ev.altKey) {
              if (Math.abs(bend) < 3) bend = 0;
              else if (Math.abs(Math.abs(bend) - half) < 3) bend = Math.sign(bend) * half;
              else bend = Math.round(bend);
            }
            e.bend = bend;
          }
        }, false);
        break;
      case 'insertion': {
        // Dragging an insertion close to another line moves it there.
        const near = hitEdge(p);
        const edgeId = near ? near.id : d.edgeId;
        const e = D.edges.find((x) => x.id === edgeId);
        const path = e && paths.get(e.id);
        if (!e || !path) break;
        let t = tFromDrawS(e, path, nearestOnPath(path, p).s);
        if (snapOn && !ev.altKey) for (const q of [0.25, 0.5, 0.75]) if (Math.abs(t - q) < 0.03) t = q;
        t = Math.min(Math.max(t, 0.02), 0.98);
        s.apply((dr) => {
          if (edgeId !== d.edgeId) moveInsertion(dr.diagram, d.insId, edgeId, t);
          const ins = dr.diagram.edges.find((x) => x.id === edgeId)!.insertions.find((i) => i.id === d.insId);
          if (ins) ins.t = t;
        }, false);
        if (edgeId !== d.edgeId) setDrag({ ...d, edgeId });
        break;
      }
      case 'line': {
        const n = hitNode(p);
        setDrag({ ...d, cur: n ? { x: nodes.get(n)!.x, y: nodes.get(n)!.y } : snap(p, ev.altKey) });
        break;
      }
      case 'band':
        setDrag({ ...d, cur: p });
        break;
    }
  };

  const onPointerUp = (ev: React.PointerEvent) => {
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    const s = api();
    const p = toModel(ev);
    switch (d.kind) {
      case 'move': {
        // Dropping a single node onto another one merges them (connect a leg to a vertex).
        if (d.single) {
          const target = hitNode(p, new Set([d.single]));
          if (target) {
            s.apply((dr) => mergeNodes(dr.diagram, d.single!, target), false);
            s.set({ selection: [target] });
          }
        }
        s.endGesture();
        break;
      }
      case 'bend':
      case 'insertion':
      case 'resize':
        s.endGesture();
        break;
      case 'region': {
        const x = Math.min(d.start.x, d.cur.x),
          y = Math.min(d.start.y, d.cur.y);
        const w = Math.abs(d.cur.x - d.start.x),
          h = Math.abs(d.cur.y - d.start.y);
        if (w < 3 || h < 3) break;
        const id = newId('r');
        s.apply((dr) => void dr.diagram.regions.push({ id, shape: 'rect', x, y, w, h, fill: 'LightGray', opacity: 0.5, stroke: 'none', dashed: false, radius: 4 }));
        s.set({ selection: [id], tool: 'select' });
        break;
      }
      case 'line': {
        const target = hitNode(p);
        const moved = dist(d.fromPt, d.cur) > 1;
        if (!moved && d.paint) {
          s.apply((dr) => void (dr.diagram.edges.find((e) => e.id === d.paint)!.field = s.activeField));
          break;
        }
        if (!moved && !(d.from && target === d.from)) break;
        const edgeId = newId('e');
        s.apply((dr) => {
          let from = d.from;
          if (!from) {
            from = newId('n');
            dr.diagram.nodes.push({ id: from, kind: 'external', ...d.fromPt });
          }
          let to = target;
          if (!to) {
            to = newId('n');
            dr.diagram.nodes.push({ id: to, kind: 'external', ...d.cur });
          }
          const e: DEdge = { id: edgeId, from, to, field: s.activeField, bend: 0, reversed: false, insertions: [] };
          if (from === to) e.loop = { radius: st.loopRadius, angle: -Math.PI / 2 };
          dr.diagram.edges.push(e);
        });
        s.set({ selection: [edgeId] });
        break;
      }
      case 'band': {
        const x0 = Math.min(d.start.x, d.cur.x),
          x1 = Math.max(d.start.x, d.cur.x);
        const y0 = Math.min(d.start.y, d.cur.y),
          y1 = Math.max(d.start.y, d.cur.y);
        const inside = (q: Vec) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
        const ids = new Set(D.nodes.filter((n) => inside(n)).map((n) => n.id));
        for (const e of D.edges) if (ids.has(e.from) && ids.has(e.to)) ids.add(e.id);
        for (const [id, b] of scene.labelBoxes) if (inside({ x: b.x + b.w / 2, y: b.y + b.h / 2 })) ids.add(id);
        for (const r of D.regions) if (inside(r) && inside({ x: r.x + r.w, y: r.y + r.h })) ids.add(r.id);
        for (const id of [...ids]) for (const m of selectionFor(id)) ids.add(m);
        s.set({ selection: d.additive ? [...new Set([...selection, ...ids])] : [...ids] });
        break;
      }
    }
  };

  /** Double-click selects a single element, even inside a group (e.g. to bend one line). */
  const onDoubleClick = (ev: React.MouseEvent) => {
    if (tool !== 'select') return;
    const hit = hitTest(toModel(ev));
    const s = api();
    if (!hit || hit.type === 'bend' || hit.type === 'resize') return;
    s.set({ selection: [hit.id] });
    if (hit.type === 'label') s.set({ focusLabel: s.focusLabel + 1 });
  };

  const onWheel = (ev: React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const mx = ev.clientX - r.left;
    const my = ev.clientY - r.top;
    const zoom = Math.min(Math.max(view.zoom * Math.exp(-ev.deltaY * 0.0015), 0.2), 20);
    setView({ zoom, x: mx - ((mx - view.x) / view.zoom) * zoom, y: my - ((my - view.y) / view.zoom) * zoom });
  };

  // ---- rendering -----------------------------------------------------------
  const vis = { x: -view.x / view.zoom, y: -view.y / view.zoom, w: size.w / view.zoom, h: size.h / view.zoom };
  const g2 = st.gridSize * 2;
  const px = 1 / view.zoom;
  const underlay = (id: string, color: string, opacity: number) => {
    const path = paths.get(id);
    return path ? (
      <path key={`u${id}${color}`} d={cmdsToD(path.toCmds())} stroke={color} strokeOpacity={opacity} strokeWidth={st.doubleSep + st.lineWidth + 8 * px} fill="none" strokeLinecap="round" />
    ) : null;
  };
  const hoverId = hover && hover.type !== 'bend' && hover.type !== 'resize' ? hover.id : null;
  const hoverIds = new Set(hoverId && tool === 'select' ? selectionFor(hoverId) : hoverId ? [hoverId] : []);
  const cursor = drag?.kind === 'pan' ? 'grabbing' : tool === 'select' ? (hover ? 'pointer' : 'default') : tool === 'text' ? 'text' : 'crosshair';
  const labelOutline = (id: string, strong: boolean) => {
    const b = scene.labelBoxes.get(id);
    return b && <rect key={`lb${id}`} x={b.x - 2 * px} y={b.y - 2 * px} width={b.w + 4 * px} height={b.h + 4 * px} fill="#3d8bfd" fillOpacity={strong ? 0.1 : 0.05} stroke="#3d8bfd" strokeOpacity={strong ? 1 : 0.5} strokeWidth={px} />;
  };
  const allGroupBox = groupBoxes.reduce<BBox | null>((a, b) => unionBox(a, b), null);

  return (
    <svg
      ref={svgRef}
      className="canvas"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      onPointerLeave={() => setHover(null)}
      onWheel={onWheel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <defs>
        <pattern id="grid" width={g2} height={g2} patternUnits="userSpaceOnUse">
          <circle cx={0} cy={0} r={0.9 * px} fill="#b9bec7" />
          <circle cx={g2} cy={0} r={0.9 * px} fill="#b9bec7" />
          <circle cx={0} cy={g2} r={0.9 * px} fill="#b9bec7" />
          <circle cx={g2} cy={g2} r={0.9 * px} fill="#b9bec7" />
        </pattern>
      </defs>
      <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
        {snapOn && <rect x={vis.x} y={vis.y} width={vis.w} height={vis.h} fill="url(#grid)" />}
        {groupBoxes.map((b, i) => (
          <rect key={`g${i}`} x={b.x - 4 * px} y={b.y - 4 * px} width={b.w + 8 * px} height={b.h + 8 * px} fill="none" stroke="#3d8bfd" strokeWidth={px} strokeDasharray={`${4 * px} ${3 * px}`} />
        ))}
        {selection.map((id) => underlay(id, '#3d8bfd', 0.28))}
        {[...hoverIds].filter((id) => !sel.has(id)).map((id) => underlay(id, '#3d8bfd', 0.12))}
        {scene.prims.map((p, i) => (
          <PrimPath key={i} prim={p} />
        ))}
        {/* editor-only overlays */}
        {D.nodes
          .filter((n) => n.kind === 'external')
          .map((n) => (
            <circle key={n.id} cx={n.x} cy={n.y} r={2.5 * px + 1} fill="#fff" stroke="#8a93a3" strokeWidth={1.2 * px} />
          ))}
        {D.nodes
          .filter((n) => (sel.has(n.id) || hoverIds.has(n.id)) && n.kind !== 'external')
          .map((n) => (
            <circle key={`s${n.id}`} cx={n.x} cy={n.y} r={vertexRadius(doc, n.kind) + 4 * px} fill="none" stroke="#3d8bfd" strokeOpacity={sel.has(n.id) ? 1 : 0.5} strokeWidth={2 * px} />
          ))}
        {D.labels.filter((l) => sel.has(l.id) || hoverIds.has(l.id)).map((l) => labelOutline(l.id, sel.has(l.id)))}
        {D.regions
          .filter((r) => sel.has(r.id) || hoverIds.has(r.id))
          .map((r) => (
            <rect key={`r${r.id}`} x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke="#3d8bfd" strokeOpacity={sel.has(r.id) ? 1 : 0.5} strokeWidth={1.5 * px} strokeDasharray={`${4 * px} ${3 * px}`} />
          ))}
        {singleRegion && <rect x={singleRegion.x + singleRegion.w - 4 * px} y={singleRegion.y + singleRegion.h - 4 * px} width={8 * px} height={8 * px} fill="#fff" stroke="#3d8bfd" strokeWidth={1.5 * px} />}
        {drag?.kind === 'region' && (
          <rect x={Math.min(drag.start.x, drag.cur.x)} y={Math.min(drag.start.y, drag.cur.y)} width={Math.abs(drag.cur.x - drag.start.x)} height={Math.abs(drag.cur.y - drag.start.y)} fill="#c8c8c8" fillOpacity={0.4} stroke="#3d8bfd" strokeWidth={px} />
        )}
        {D.edges.flatMap((e) =>
          e.insertions
            .filter((i) => sel.has(i.id) || i.id === hoverId)
            .map((i) => {
              const q = insertionPos(e, i.t);
              return q && <circle key={`i${i.id}`} cx={q.x} cy={q.y} r={st.regulatorRadius + 4 * px} fill="none" stroke="#3d8bfd" strokeOpacity={sel.has(i.id) ? 1 : 0.5} strokeWidth={2 * px} />;
            }),
        )}
        {singleEdge &&
          (() => {
            const path = paths.get(singleEdge.id);
            if (!path) return null;
            const m = path.pointAt(path.length / 2);
            const r = 4 * px + 1;
            return <rect x={m.x - r} y={m.y - r} width={2 * r} height={2 * r} fill="#fff" stroke="#3d8bfd" strokeWidth={1.5 * px} transform={`rotate(45 ${m.x} ${m.y})`} />;
          })()}
        {allGroupBox && groupBoxes.length === 1 && (
          <text x={allGroupBox.x - 4 * px} y={allGroupBox.y - 7 * px} fontSize={11 * px} fill="#3d8bfd">
            {D.groups.find((g) => g.members.every((m) => sel.has(m)))?.name}
          </text>
        )}
        {drag?.kind === 'line' && <line x1={drag.fromPt.x} y1={drag.fromPt.y} x2={drag.cur.x} y2={drag.cur.y} stroke="#3d8bfd" strokeWidth={1.5 * px} strokeDasharray={`${4 * px} ${3 * px}`} />}
        {drag?.kind === 'band' && (
          <rect x={Math.min(drag.start.x, drag.cur.x)} y={Math.min(drag.start.y, drag.cur.y)} width={Math.abs(drag.cur.x - drag.start.x)} height={Math.abs(drag.cur.y - drag.start.y)} fill="#3d8bfd" fillOpacity={0.08} stroke="#3d8bfd" strokeWidth={px} />
        )}
      </g>
    </svg>
  );
}
