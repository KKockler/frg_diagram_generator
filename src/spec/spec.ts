// Figure specs (.frg-spec.json): a compact, coordinate-free description of a figure as rows of
// TeX terms and pre-built diagrams. Meant to be written by hand, scripts or AI assistants;
// specToDocument() lays it out exactly like the editor's "Arrange row" would.
import type { DEdge, Diagram, DNode, FieldType, FrgDocument, StyleSheet, Vec, VertexType } from '../model/types';
import { DEFAULT_STYLE, emptyDocument, newId, STYLE_PRESETS } from '../model/defaults';
import { STAMPS, buildRing, getStamp } from '../model/stamps';
import { arrangeRow, planRow } from '../model/layout';
import { translate } from '../model/ops';
import { GROUP_LIBRARY } from '../model/library';
import { buildScene, edgePath } from '../render/scene';
import { add, perp, scale, sub } from '../geometry/vec';
import { isRegulator, REGULATOR_KINDS } from '../styles/nodeKinds';

export interface DiagramItem {
  /** Id of a pre-built diagram (see `frg list`). */
  diagram: string;
  /** Field of every line, unless overridden below. Default "scalar". */
  field?: string;
  /** Field of the external legs. */
  legs?: string;
  /** Field of all internal lines. */
  internal?: string;
  /** Field per internal line, by slot name ("upper", "lower", "left", "right", "middle", "loop") or index. */
  lines?: Record<string, string>;
  /** Slot(s) carrying the regulator ⊗; "none" for no regulator, "each" for the sum over all internal lines. */
  regulator?: string | string[];
  /** Kind of regulator insertion: "regulator" (∂ₜR, ⊗) or "flowRegulator" ((∂ₜ + 2δΦ̇/δΦ)R, ⬠). */
  regulatorKind?: string;
  /** Vertex type of all internal vertices. */
  vertex?: string;
  /** Slots (or "legs") whose arrows are flipped. */
  reverse?: string[];
  /** TeX label beside a line, by slot. */
  labels?: Record<string, string>;
  /** Momentum arrow with TeX label beside a line, by slot. */
  momentum?: Record<string, string>;
  /**
   * External legs per internal vertex, in the diagram's vertex order: a leg count, or one entry per
   * leg (a field, or {field, dir} with dir "in"/"out" pointing the leg's arrow into or out of the
   * vertex). Defines a "ring"; on other diagrams the counts must match theirs.
   */
  vertices?: (number | LegSpec[])[];
}

export type LegSpec = string | { field: string; dir?: 'in' | 'out' };

/** The diagram id of the generic one-loop ring (not a stamp: its shape comes from "vertices"). */
export const RING = { id: 'ring', label: 'One-loop ring (vertices with given legs)' };

export type TermItem = string | { tex: string; size?: number; color?: string };
export type SpecItem = TermItem | DiagramItem;
export type SpecRow = SpecItem[] | { items: SpecItem[] };

export interface FigureSpec {
  format: 'frg-spec';
  version: 1;
  /** Preset name ("fqcd", "thesis", "journal", "grayscale", "talk") or style-sheet overrides (optionally with "preset"). */
  style?: string | (Partial<StyleSheet> & { preset?: string });
  /** Extra or overridden line types. */
  fields?: FieldType[];
  /** Extra or overridden vertex types. */
  vertexTypes?: VertexType[];
  /** Default regulator insertion kind of all diagrams (see DiagramItem.regulatorKind). */
  regulatorKind?: string;
  rows: SpecRow[];
  /** Vertical gap between rows (pt). Default 30. */
  rowGap?: number;
  /** Horizontal alignment of rows. Default "left". */
  align?: 'left' | 'center';
}

export class SpecError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
  }
}

// ---- slots ----------------------------------------------------------------------

const isExt = (nodes: Map<string, DNode>, id: string) => nodes.get(id)?.kind === 'external';
/** Lines that are not external legs: internal lines, and free lines with both ends loose (a propagator). */
const isInternal = (e: DEdge, nodes: Map<string, DNode>) => e.field !== 'aux' && isExt(nodes, e.from) === isExt(nodes, e.to);

/** Centre of a diagram's internal vertices (the stamp's anchor). */
function coreCenter(d: Diagram): Vec {
  const core = d.nodes.filter((n) => n.kind !== 'external');
  const pts = core.length ? core : d.nodes;
  return scale(
    pts.reduce((s, n) => add(s, n), { x: 0, y: 0 }),
    1 / Math.max(pts.length, 1),
  );
}

/**
 * Name the internal lines of a diagram by where they sit relative to its centre:
 * "loop" for self-loops, "line" for a free propagator, "middle" for lines through the centre,
 * otherwise upper/lower/left/right.
 * Duplicates get a number appended (upper1, upper2).
 */
export function lineSlots(d: Diagram): { name: string; edge: DEdge; mid: Vec; normal: Vec }[] {
  const nodes = new Map(d.nodes.map((n) => [n.id, n]));
  const c = coreCenter(d);
  const out = d.edges
    .filter((e) => isInternal(e, nodes))
    .map((edge) => {
      const p = edgePath(edge, nodes)!;
      const mid = p.pointAt(p.length / 2);
      const normal = perp(p.tangentAt(p.length / 2));
      const v = sub(mid, c);
      let name: string;
      if (edge.loop) name = 'loop';
      else if (isExt(nodes, edge.from)) name = 'line';
      else if (Math.hypot(v.x, v.y) < 1) name = 'middle';
      else if (Math.abs(v.y) >= Math.abs(v.x)) name = v.y < 0 ? 'upper' : 'lower';
      else name = v.x < 0 ? 'left' : 'right';
      return { name, edge, mid, normal };
    });
  const count = new Map<string, number>();
  for (const s of out) count.set(s.name, (count.get(s.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const s of out) {
    if (count.get(s.name)! < 2) continue;
    const k = (seen.get(s.name) ?? 0) + 1;
    seen.set(s.name, k);
    s.name += k;
  }
  return out;
}

/** Slot names and default regulator position of every pre-built diagram. */
export function stampCatalog(): { id: string; label: string; slots: string[]; regulator: string | null }[] {
  return STAMPS.map((s) => {
    const d = s.build({ at: { x: 0, y: 0 }, style: DEFAULT_STYLE, field: 'scalar' });
    const slots = lineSlots(d);
    return { id: s.id, label: s.label, slots: slots.map((x) => x.name), regulator: slots.find((x) => x.edge.insertions.length)?.name ?? null };
  });
}

const legCount = (v: number | LegSpec[]) => (typeof v === 'number' ? v : v.length);

/** The diagram an item starts from, before its options are applied. */
function baseDiagram(it: DiagramItem, at: Vec, style: StyleSheet): Diagram {
  const ctx = { at, style, field: it.field ?? 'scalar' };
  return it.diagram === RING.id ? buildRing(ctx, (it.vertices ?? []).map(legCount)) : getStamp(it.diagram).build(ctx);
}

/** Line slot names of an item's diagram (for a ring they depend on its vertices). */
export function itemSlots(it: DiagramItem): string[] {
  return lineSlots(baseDiagram(it, { x: 0, y: 0 }, DEFAULT_STYLE)).map((s) => s.name);
}

/** The internal vertices of a diagram in node order, each with its external legs in edge order. */
function vertexLegs(d: Diagram): { node: DNode; legs: DEdge[] }[] {
  const nodes = new Map(d.nodes.map((n) => [n.id, n]));
  return d.nodes
    .filter((n) => n.kind !== 'external')
    .map((node) => ({ node, legs: d.edges.filter((e) => e.field !== 'aux' && !isInternal(e, nodes) && (e.from === node.id || e.to === node.id)) }));
}

// ---- validation -------------------------------------------------------------------

export const PRESET_ALIASES: Record<string, string> = {
  fqcd: 'fQCD',
  thesis: 'Thesis',
  journal: 'Journal (black & white)',
  grayscale: 'Grayscale',
  talk: 'Talk (bold)',
};

export function findPreset(name: string): StyleSheet | undefined {
  const full = PRESET_ALIASES[name.toLowerCase()] ?? name;
  return STYLE_PRESETS.find((p) => p.name.toLowerCase() === full.toLowerCase());
}

const DIAGRAM_KEYS = ['diagram', 'field', 'legs', 'internal', 'lines', 'regulator', 'regulatorKind', 'vertex', 'reverse', 'labels', 'momentum', 'vertices'];
const SPEC_KEYS = ['$schema', 'format', 'version', 'style', 'fields', 'vertexTypes', 'regulatorKind', 'rows', 'rowGap', 'align'];

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const list = (xs: Iterable<string>) => [...xs].map((x) => `"${x}"`).join(', ');

/** Field and vertex types available to a spec: defaults, the group library, then the spec's own. */
export function typeTables(spec: Partial<FigureSpec>) {
  const base = emptyDocument();
  const fields = new Map<string, FieldType>();
  for (const f of [...base.fieldTypes, ...GROUP_LIBRARY.fields, ...(Array.isArray(spec.fields) ? spec.fields : [])]) fields.set(f.id, f);
  const vertices = new Map<string, VertexType>();
  for (const v of [...base.vertexTypes, ...GROUP_LIBRARY.vertexTypes, ...(Array.isArray(spec.vertexTypes) ? spec.vertexTypes : [])]) vertices.set(v.id, v);
  return { fields, vertices };
}

/** Check a parsed spec; throws SpecError listing every problem with its JSON path. */
export function validateSpec(raw: unknown): FigureSpec {
  const errs: string[] = [];
  if (!isObj(raw)) throw new SpecError(['spec: expected a JSON object']);
  if (raw.format !== 'frg-spec') errs.push(`format: expected "frg-spec", got ${JSON.stringify(raw.format)}`);
  if (raw.version !== 1) errs.push(`version: expected 1, got ${JSON.stringify(raw.version)}`);
  for (const k of Object.keys(raw)) if (!SPEC_KEYS.includes(k)) errs.push(`${k}: unknown key (allowed: ${list(SPEC_KEYS)})`);

  const spec = raw as Partial<FigureSpec>;
  const { fields, vertices } = typeTables(spec);
  const diagramIds = [...STAMPS.map((s) => s.id), RING.id];

  if (typeof spec.style === 'string') {
    if (!findPreset(spec.style)) errs.push(`style: unknown preset "${spec.style}" (known: ${list(Object.keys(PRESET_ALIASES))})`);
  } else if (spec.style !== undefined) {
    if (!isObj(spec.style)) errs.push('style: expected a preset name or an object');
    else
      for (const [k, v] of Object.entries(spec.style)) {
        if (k === 'preset') {
          if (typeof v !== 'string' || !findPreset(v)) errs.push(`style.preset: unknown preset ${JSON.stringify(v)} (known: ${list(Object.keys(PRESET_ALIASES))})`);
        } else if (!(k in DEFAULT_STYLE)) errs.push(`style.${k}: unknown style key (allowed: preset, ${list(Object.keys(DEFAULT_STYLE))})`);
        else if (typeof v !== typeof DEFAULT_STYLE[k as keyof StyleSheet]) errs.push(`style.${k}: expected a ${typeof DEFAULT_STYLE[k as keyof StyleSheet]}`);
      }
  }
  for (const [key, arr, need] of [
    ['fields', spec.fields, ['id', 'name', 'tex', 'line', 'color', 'arrows']],
    ['vertexTypes', spec.vertexTypes, ['id', 'name', 'shape', 'scale', 'fill', 'stroke', 'strokeWidth']],
  ] as const) {
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) {
      errs.push(`${key}: expected an array`);
      continue;
    }
    arr.forEach((t: unknown, i) => {
      if (!isObj(t)) errs.push(`${key}[${i}]: expected an object`);
      else for (const k of need) if (t[k] === undefined) errs.push(`${key}[${i}].${k}: missing`);
    });
  }
  const checkRegKind = (path: string, k: unknown) => {
    if (k !== undefined && (typeof k !== 'string' || !isRegulator(k))) errs.push(`${path}: unknown regulator kind ${JSON.stringify(k)} (known: ${list(REGULATOR_KINDS)})`);
  };
  checkRegKind('regulatorKind', spec.regulatorKind);
  if (spec.rowGap !== undefined && typeof spec.rowGap !== 'number') errs.push('rowGap: expected a number');
  if (spec.align !== undefined && spec.align !== 'left' && spec.align !== 'center') errs.push('align: expected "left" or "center"');

  const checkField = (path: string, f: unknown) => {
    if (typeof f !== 'string' || !fields.has(f)) errs.push(`${path}: unknown field ${JSON.stringify(f)} (known: ${list(fields.keys())})`);
  };
  const checkSlotMap = (path: string, m: unknown, slots: string[], val: (p: string, v: unknown) => void) => {
    if (!isObj(m)) return errs.push(`${path}: expected an object mapping line slots to values`);
    for (const [k, v] of Object.entries(m)) {
      if (!slots.includes(k) && !(/^\d+$/.test(k) && +k < slots.length)) errs.push(`${path}.${k}: no such line (this diagram has: ${list(slots)})`);
      val(`${path}.${k}`, v);
    }
  };
  const isTexStr = (p: string, v: unknown) => typeof v !== 'string' && errs.push(`${p}: expected a TeX string`);
  /** Check a "vertices" list; false if it is unusable (so the ring cannot be built). */
  const checkVertices = (path: string, vs: unknown, diagram: string): boolean => {
    if (!Array.isArray(vs) || vs.length === 0) {
      errs.push(`${path}: expected a non-empty array with one entry per vertex (a leg count or a list of legs)`);
      return false;
    }
    let ok = true;
    vs.forEach((v: unknown, j) => {
      const q = `${path}[${j}]`;
      if (typeof v === 'number') {
        if (!Number.isInteger(v) || v < 0) ok = !errs.push(`${q}: expected a leg count ≥ 0`);
      } else if (Array.isArray(v)) {
        v.forEach((l: unknown, m) => {
          if (typeof l === 'string') return checkField(`${q}[${m}]`, l);
          if (!isObj(l)) return (ok = !errs.push(`${q}[${m}]: expected a field or {"field": ..., "dir": "in"|"out"}`));
          checkField(`${q}[${m}].field`, l.field);
          if (l.dir !== undefined && l.dir !== 'in' && l.dir !== 'out') errs.push(`${q}[${m}].dir: expected "in" or "out"`);
          for (const k of Object.keys(l)) if (k !== 'field' && k !== 'dir') errs.push(`${q}[${m}].${k}: unknown key (allowed: "field", "dir")`);
        });
      } else ok = !errs.push(`${q}: expected a leg count or a list of legs`);
    });
    if (!ok || diagram === RING.id) return ok;
    const have = vertexLegs(getStamp(diagram).build({ at: { x: 0, y: 0 }, style: DEFAULT_STYLE, field: 'scalar' })).map((v) => v.legs.length);
    const want = (vs as (number | LegSpec[])[]).map(legCount);
    if (have.join() !== want.join()) errs.push(`${path}: legs per vertex [${want}] do not match "${diagram}" ([${have}]); use "diagram": "ring" for other shapes`);
    return true;
  };

  if (!Array.isArray(spec.rows) || spec.rows.length === 0) errs.push('rows: expected a non-empty array of rows');
  else
    spec.rows.forEach((row, r) => {
      const items = Array.isArray(row) ? row : isObj(row) && Array.isArray(row.items) ? row.items : null;
      if (!items) return errs.push(`rows[${r}]: expected an array of items (or {"items": [...]})`);
      items.forEach((it: unknown, i) => {
        const p = `rows[${r}][${i}]`;
        if (typeof it === 'string') return;
        if (!isObj(it)) return errs.push(`${p}: expected a TeX string, {"tex": ...} or {"diagram": ...}`);
        if ('tex' in it && !('diagram' in it)) {
          if (typeof it.tex !== 'string') errs.push(`${p}.tex: expected a string`);
          for (const k of Object.keys(it)) if (!['tex', 'size', 'color'].includes(k)) errs.push(`${p}.${k}: unknown key for a TeX term (allowed: "tex", "size", "color")`);
          return;
        }
        if (typeof it.diagram !== 'string' || !diagramIds.includes(it.diagram)) return errs.push(`${p}.diagram: unknown diagram ${JSON.stringify(it.diagram)} (known: ${list(diagramIds)})`);
        if ((it.vertices !== undefined || it.diagram === RING.id) && !checkVertices(`${p}.vertices`, it.vertices, it.diagram)) return;
        const slots = itemSlots(it as unknown as DiagramItem);
        for (const k of Object.keys(it)) if (!DIAGRAM_KEYS.includes(k)) errs.push(`${p}.${k}: unknown key (allowed: ${list(DIAGRAM_KEYS)})`);
        for (const k of ['field', 'legs', 'internal'] as const) if (it[k] !== undefined) checkField(`${p}.${k}`, it[k]);
        if (it.lines !== undefined) checkSlotMap(`${p}.lines`, it.lines, slots, checkField);
        if (it.labels !== undefined) checkSlotMap(`${p}.labels`, it.labels, slots, isTexStr);
        if (it.momentum !== undefined) checkSlotMap(`${p}.momentum`, it.momentum, slots, isTexStr);
        if (it.vertex !== undefined && (typeof it.vertex !== 'string' || !vertices.has(it.vertex)))
          errs.push(`${p}.vertex: unknown vertex type ${JSON.stringify(it.vertex)} (known: ${list(vertices.keys())})`);
        if (it.regulator !== undefined) {
          const regs = Array.isArray(it.regulator) ? it.regulator : [it.regulator];
          for (const g of regs) {
            const ok = g === 'none' || g === 'each' || (typeof g === 'string' && (slots.includes(g) || (/^\d+$/.test(g) && +g < slots.length)));
            if (!ok) errs.push(`${p}.regulator: ${JSON.stringify(g)} is not "none", "each" or a line of this diagram (${list(slots)})`);
          }
          if (regs.length > 1 && regs.some((g) => g === 'none' || g === 'each')) errs.push(`${p}.regulator: "none"/"each" cannot be combined with other slots`);
        }
        checkRegKind(`${p}.regulatorKind`, it.regulatorKind);
        if (it.reverse !== undefined) {
          if (!Array.isArray(it.reverse)) errs.push(`${p}.reverse: expected an array of slot names`);
          else for (const s of it.reverse) if (s !== 'legs' && !slots.includes(s) && !(/^\d+$/.test(s) && +s < slots.length)) errs.push(`${p}.reverse: no line ${JSON.stringify(s)} (this diagram has: "legs", ${list(slots)})`);
        }
      });
    });
  if (errs.length) throw new SpecError(errs);
  return spec as FigureSpec;
}

// ---- building ---------------------------------------------------------------------

function styleOf(spec: FigureSpec): StyleSheet {
  if (typeof spec.style === 'string') return { ...findPreset(spec.style)! };
  const { preset, ...over } = spec.style ?? {};
  return { ...(preset ? findPreset(preset)! : DEFAULT_STYLE), ...over };
}

const slotIndex = (slots: { name: string }[], key: string) => (/^\d+$/.test(key) ? +key : slots.findIndex((s) => s.name === key));

/** Build one diagram item; `regulator` is a resolved list of slots (empty = none). */
function buildDiagram(doc: FrgDocument, it: DiagramItem, at: Vec, regulator: string[] | null, regulatorKind: string): Diagram {
  const d = baseDiagram(it, at, doc.style);
  const slots = lineSlots(d);
  const internal = new Set(slots.map((s) => s.edge.id));
  const c = coreCenter(d);
  for (const e of d.edges) {
    if (e.field === 'aux') continue;
    if (internal.has(e.id)) e.field = it.internal ?? e.field;
    else e.field = it.legs ?? e.field;
  }
  for (const [k, f] of Object.entries(it.lines ?? {})) slots[slotIndex(slots, k)].edge.field = f;
  if (it.vertices)
    vertexLegs(d).forEach(({ node, legs }, j) => {
      const spec = it.vertices![j];
      if (typeof spec === 'number') return;
      legs.forEach((e, m) => {
        const l = typeof spec[m] === 'string' ? { field: spec[m] as string } : (spec[m] as Exclude<LegSpec, string>);
        e.field = l.field;
        // Arrows run along the drawing direction (from → to unless reversed).
        if (l.dir) e.reversed = (l.dir === 'in') !== (e.to === node.id);
      });
    });
  if (regulator) {
    for (const s of slots) s.edge.insertions = s.edge.insertions.filter((i) => !isRegulator(i.kind));
    for (const k of regulator) slots[slotIndex(slots, k)].edge.insertions.push({ id: newId('i'), kind: 'regulator', t: 0.5 });
  }
  for (const e of d.edges) for (const i of e.insertions) if (isRegulator(i.kind)) i.kind = it.regulatorKind ?? regulatorKind;
  if (it.vertex) for (const n of d.nodes) if (n.kind !== 'external') n.kind = it.vertex;
  for (const k of it.reverse ?? []) {
    if (k === 'legs') for (const e of d.edges) if (!internal.has(e.id) && e.field !== 'aux') e.reversed = !e.reversed;
    if (k !== 'legs') slots[slotIndex(slots, k)].edge.reversed = !slots[slotIndex(slots, k)].edge.reversed;
  }
  // Labels and momentum arrows go on the outer side of a line (away from the diagram's centre).
  const outward = (s: (typeof slots)[number]) => {
    const dot = (s.mid.x - c.x) * s.normal.x + (s.mid.y - c.y) * s.normal.y;
    return dot < 0 ? -1 : 1;
  };
  for (const [k, tex] of Object.entries(it.momentum ?? {})) {
    const s = slots[slotIndex(slots, k)];
    s.edge.momentum = { tex, side: outward(s), reversed: false };
  }
  for (const [k, tex] of Object.entries(it.labels ?? {})) {
    const s = slots[slotIndex(slots, k)];
    // Opposite the momentum arrow if there is one.
    const side = s.edge.momentum ? -s.edge.momentum.side : outward(s);
    const off = scale(s.normal, side * (doc.style.fontSize * 0.8 + doc.style.doubleSep));
    const l = { id: newId('l'), tex, x: off.x, y: off.y, attach: { edge: s.edge.id, t: 0.5 } };
    d.labels.push(l);
    d.groups[0].members.push(l.id);
  }
  return d;
}

function addDiagram(doc: FrgDocument, d: Diagram): string[] {
  const D = doc.diagram;
  D.nodes.push(...d.nodes);
  D.edges.push(...d.edges);
  D.labels.push(...d.labels);
  D.groups.push(...d.groups);
  D.regions.push(...d.regions);
  return [...d.nodes, ...d.edges, ...d.labels].map((x) => x.id);
}

function addTerm(doc: FrgDocument, t: TermItem, at: Vec): string[] {
  const id = newId('l');
  const term = typeof t === 'string' ? { tex: t } : t;
  doc.diagram.labels.push({ id, x: at.x, y: at.y, ...term });
  return [id];
}

/** Expand "regulator": "each" into the sum of copies with ⊗ on each internal line. */
function expandItems(items: SpecItem[]): (TermItem | { item: DiagramItem; regulator: string[] | null })[] {
  const out: (TermItem | { item: DiagramItem; regulator: string[] | null })[] = [];
  for (const it of items) {
    if (typeof it === 'string' || !('diagram' in it)) {
      out.push(it);
      continue;
    }
    const reg = it.regulator === undefined ? null : Array.isArray(it.regulator) ? it.regulator : [it.regulator];
    if (reg?.[0] === 'each') {
      itemSlots(it).forEach((s, k) => {
        if (k) out.push('+');
        out.push({ item: it, regulator: [s] });
      });
    } else out.push({ item: it, regulator: reg?.[0] === 'none' ? [] : reg });
  }
  return out;
}

/** Lay out a validated spec as an editable document. */
export function specToDocument(spec: FigureSpec): FrgDocument {
  const doc = emptyDocument();
  doc.style = styleOf(spec);
  const { fields, vertices } = typeTables(spec);
  const rows: string[][] = [];
  for (const row of spec.rows) {
    const items = expandItems(Array.isArray(row) ? row : row.items);
    const ids: string[] = [];
    items.forEach((it, i) => {
      const at = { x: i * 80, y: 0 };
      if (typeof it === 'string' || 'tex' in it) ids.push(...addTerm(doc, it, at));
      else ids.push(...addDiagram(doc, buildDiagram(doc, it.item, at, it.regulator, spec.regulatorKind ?? 'regulator')));
    });
    arrangeRow(doc.diagram, planRow(doc, ids));
    rows.push(ids);
  }

  // Types the figure uses that the defaults lack (group library or the spec's own), and overrides.
  const usedF = new Set(doc.diagram.edges.map((e) => e.field));
  for (const [id, f] of fields) {
    const i = doc.fieldTypes.findIndex((x) => x.id === id);
    if (i >= 0) doc.fieldTypes[i] = { ...f };
    else if (usedF.has(id) || spec.fields?.some((x) => x.id === id)) doc.fieldTypes.push({ ...f });
  }
  const usedV = new Set(doc.diagram.nodes.map((n) => n.kind));
  for (const [id, v] of vertices) {
    const i = doc.vertexTypes.findIndex((x) => x.id === id);
    if (i >= 0) doc.vertexTypes[i] = { ...v };
    else if (usedV.has(id) || spec.vertexTypes?.some((x) => x.id === id)) doc.vertexTypes.push({ ...v });
  }

  // Stack the rows and align them.
  const gap = spec.rowGap ?? 30;
  const boxes = rows.map((r) => buildScene(doc, new Set(r)).bbox!);
  const x0 = Math.min(...boxes.map((b) => b.x));
  const cx = boxes[0].x + boxes[0].w / 2;
  let y = boxes[0].y;
  rows.forEach((r, i) => {
    const b = boxes[i];
    const dx = spec.align === 'center' ? cx - (b.x + b.w / 2) : x0 - b.x;
    translate(doc.diagram, new Set(r), dx, y - b.y);
    y += b.h + gap;
  });
  return doc;
}

/** Parse, validate and lay out a spec given as text or an already parsed object. */
export function buildSpec(input: string | unknown): FrgDocument {
  let raw = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      throw new SpecError([`spec: invalid JSON (${(e as Error).message})`]);
    }
  }
  return specToDocument(validateSpec(raw));
}

export const isSpec = (raw: unknown): boolean => isObj(raw) && raw.format === 'frg-spec';
