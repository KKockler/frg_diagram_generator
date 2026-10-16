// Editor commands shared by the toolbar, palette and keyboard shortcuts.
import { closure, deleteIds, duplicate, groupIds, translate, ungroupIds } from '../model/ops';
import { applyShifts, arrangeRow, expandSelection, planAlign, planDistribute, planRow, regulatorSum, transformSelection, type AlignMode, type Transform } from '../model/layout';
import { emptyDocument, newId } from '../model/defaults';
import { download, exportPdf, exportSvg } from '../export/exporters';
import { toTikz } from '../export/tikz';
import { emptyLibrary, extractTemplate, mergeLibrary, missingFields, missingVertexTypes, parseLibrary, GROUP_LIBRARY, type Library } from '../model/library';
import type { FieldType, FrgDocument, VertexType } from '../model/types';
import { buildScene } from '../render/scene';
import { parseAnyFile, serializeDocument } from '../export/io';
import { useEditor } from '../store/store';

const S = useEditor.getState;

export function deleteSelection() {
  const ids = new Set(S().selection);
  if (!ids.size) return;
  S().apply((d) => deleteIds(d.diagram, ids));
  S().set({ selection: [] });
}

export function duplicateSelection() {
  const s = S();
  if (!s.selection.length) return;
  let out: string[] = [];
  const g = s.doc.style.gridSize * 4;
  const ids = expandSelection(s.doc.diagram, s.selection);
  s.apply((d) => void (out = duplicate(d.diagram, ids, { x: g, y: g }).ids));
  s.set({ selection: out });
}

export function flipSelection() {
  const ids = new Set(S().selection);
  S().apply((d) => {
    for (const e of d.diagram.edges) if (ids.has(e.id)) e.reversed = !e.reversed;
  });
}

export function nudgeSelection(dx: number, dy: number) {
  const s = S();
  const ids = closure(s.doc.diagram, s.selection);
  s.apply((d) => translate(d.diagram, ids, dx, dy));
}

export function selectAll() {
  const d = S().doc.diagram;
  S().set({ selection: [...d.nodes.map((n) => n.id), ...d.edges.map((e) => e.id), ...d.labels.map((l) => l.id), ...d.regions.map((r) => r.id)] });
}

/** Line up the selected diagrams and TeX terms as one equation row. */
export function arrangeSelection() {
  const s = S();
  const plan = planRow(s.doc, s.selection);
  if (plan.length) s.apply((d) => arrangeRow(d.diagram, plan));
}

export function groupSelection() {
  const s = S();
  if (!s.selection.length) return;
  let members: string[] = [];
  s.apply((d) => void (members = groupIds(d.diagram, new Set(s.selection)).members));
  s.set({ selection: members });
}

export function ungroupSelection() {
  const s = S();
  s.apply((d) => ungroupIds(d.diagram, new Set(s.selection)));
}

/** Replace the selected diagram by the sum with ⊗ on each internal line in turn. */
export function regulatorOnEachLine() {
  const s = S();
  let out: string[] | null = null;
  const doc = s.doc;
  s.apply((d) => void (out = regulatorSum(d.diagram, doc, s.selection)));
  if (out) s.set({ selection: out });
}

/**
 * Palette rule: with the Select tool, a palette click modifies the selection;
 * with any drawing tool it only chooses what to draw next.
 */
const modifiesSelection = () => S().tool === 'select' && S().selection.length > 0;

/** Palette: clicking a field re-assigns selected lines, otherwise starts drawing with it. */
export function pickField(id: string) {
  const s = S();
  const ids = new Set(s.selection);
  const edges = s.doc.diagram.edges.filter((e) => ids.has(e.id));
  s.set({ activeField: id });
  if (modifiesSelection() && edges.length) {
    s.apply((d) => {
      for (const e of d.diagram.edges) if (ids.has(e.id)) e.field = id;
    });
  } else if (s.tool === 'select') s.set({ tool: 'line' });
}

export function pickNodeKind(kind: string) {
  const s = S();
  const ids = new Set(s.selection);
  const nodes = s.doc.diagram.nodes.filter((n) => ids.has(n.id));
  s.set({ activeNodeKind: kind });
  if (modifiesSelection() && nodes.length) {
    s.apply((d) => {
      for (const n of d.diagram.nodes) if (ids.has(n.id)) n.kind = kind;
    });
  } else s.set({ tool: 'vertex' });
}

/** Clicking an insertion kind: re-kinds selected insertions, adds one to selected lines, or picks the tool. */
export function pickInsertion(kind: string) {
  const s = S();
  const ids = new Set(s.selection);
  s.set({ activeInsertion: kind });
  const edges = s.doc.diagram.edges;
  const selIns = edges.flatMap((e) => e.insertions).filter((i) => ids.has(i.id));
  const selEdges = edges.filter((e) => ids.has(e.id));
  if (!modifiesSelection()) s.set({ tool: 'insertion' });
  else if (selIns.length) {
    s.apply((d) => {
      for (const e of d.diagram.edges) for (const i of e.insertions) if (ids.has(i.id)) i.kind = kind;
    });
  } else if (selEdges.length) {
    s.apply((d) => {
      for (const e of d.diagram.edges) if (ids.has(e.id)) e.insertions.push({ id: newId('i'), kind, t: 0.5 });
    });
  } else s.set({ tool: 'insertion' });
}

export function newDocument() {
  if (S().doc.diagram.nodes.length && !confirm('Discard the current diagram? (Undo still works.)')) return;
  const cur = S().doc;
  S().load({ ...emptyDocument(), style: cur.style, fieldTypes: cur.fieldTypes });
}

export function saveDocument() {
  download(new Blob([serializeDocument(S().doc)], { type: 'application/json' }), 'diagram.frg.json');
}

export function openDocument() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.frg.json,.svg,.pdf,.tex';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      S().load(parseAnyFile(file.name, new Uint8Array(await file.arrayBuffer())));
    } catch (err) {
      alert(`Could not open ${file.name}:\n${(err as Error).message}`);
    }
  };
  input.click();
}

function exportOpts(selectionOnly: boolean) {
  const s = S();
  const only = selectionOnly && s.selection.length ? closure(s.doc.diagram, s.selection) : undefined;
  return { scale: s.exportScale, margin: s.exportMargin, only };
}

export function doExportSvg(selectionOnly = false) {
  try {
    download(exportSvg(S().doc, exportOpts(selectionOnly)), 'diagram.svg');
  } catch (err) {
    alert((err as Error).message);
  }
}

export async function doExportPdf(selectionOnly = false) {
  try {
    download(await exportPdf(S().doc, exportOpts(selectionOnly)), 'diagram.pdf');
  } catch (err) {
    alert((err as Error).message);
  }
}

function tikzText(selectionOnly: boolean, standalone: boolean): string {
  const s = S();
  const o = exportOpts(selectionOnly);
  return toTikz(s.doc, { scale: o.scale, only: o.only, standalone, source: serializeDocument(s.doc) }).tex;
}

export function doExportTikz(selectionOnly = false) {
  download(new Blob([tikzText(selectionOnly, true)], { type: 'text/x-tex' }), 'diagram.tex');
}

export async function copyTikz(selectionOnly = false) {
  try {
    await navigator.clipboard.writeText(tikzText(selectionOnly, false));
  } catch {
    alert('Copying to the clipboard is not allowed here; use "Export TikZ" instead.');
  }
}

// ---- libraries ----------------------------------------------------------------

/** All templates available for placing: the bundled group library, then the user's own. */
export const allTemplates = () => [...GROUP_LIBRARY.templates, ...S().userLibrary.templates];

export function saveSelectionAsTemplate(name: string) {
  const s = S();
  const t = extractTemplate(s.doc, s.selection, name.trim() || 'My diagram');
  if (!t) return;
  s.set({ userLibrary: { ...s.userLibrary, templates: [...s.userLibrary.templates, t] } });
}

export function deleteTemplate(id: string) {
  const s = S();
  s.set({ userLibrary: { ...s.userLibrary, templates: s.userLibrary.templates.filter((t) => t.id !== id) } });
}

export function addFieldsToDocument(fields: FieldType[], vertexTypes: VertexType[] = []) {
  const add = missingFields(S().doc, fields);
  const addV = missingVertexTypes(S().doc, vertexTypes);
  if (add.length || addV.length)
    S().apply((d) => {
      d.fieldTypes.push(...add.map((f) => ({ ...f })));
      d.vertexTypes.push(...addV.map((v) => ({ ...v })));
    });
}

/**
 * Add a generated figure (e.g. a flow equation) to the drawing: below what is already there, with
 * the line and vertex types it needs that the document lacks, and selected.
 */
export function insertFigure(part: FrgDocument) {
  const s = S();
  const D = part.diagram;
  const ids = [...D.nodes, ...D.edges, ...D.labels, ...D.regions].map((x) => x.id);
  const here = buildScene(s.doc).bbox;
  const there = buildScene(part).bbox;
  if (here && there) translate(D, new Set(ids), here.x - there.x, here.y + here.h + 40 - there.y);
  const fields = missingFields(s.doc, part.fieldTypes);
  const vertexTypes = missingVertexTypes(s.doc, part.vertexTypes);
  // One undo step for the whole insertion.
  s.apply((d) => {
    d.fieldTypes.push(...fields.map((f) => ({ ...f })));
    d.vertexTypes.push(...vertexTypes.map((v) => ({ ...v })));
    d.diagram.nodes.push(...D.nodes);
    d.diagram.edges.push(...D.edges);
    d.diagram.labels.push(...D.labels);
    d.diagram.regions.push(...D.regions);
    d.diagram.groups.push(...D.groups);
  });
  s.set({ selection: ids, fitRequest: S().fitRequest + 1 });
}

/** Export: personal templates plus the current document's field types and style sheet. */
export function exportLibrary() {
  const s = S();
  const lib: Library = { ...mergeLibrary(s.userLibrary, { ...emptyLibrary(''), fields: s.doc.fieldTypes, vertexTypes: s.doc.vertexTypes }), styles: [s.doc.style] };
  download(new Blob([JSON.stringify(lib, null, 1)], { type: 'application/json' }), 'my-library.frglib.json');
}

export function importLibrary() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.frglib.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const lib = parseLibrary(await file.text());
      S().set({ userLibrary: mergeLibrary(S().userLibrary, lib) });
      addFieldsToDocument(lib.fields, lib.vertexTypes);
    } catch (err) {
      alert(`Could not import ${file.name}:\n${(err as Error).message}`);
    }
  };
  input.click();
}

// ---- align / distribute / rotate / mirror ------------------------------------

export function alignSelection(mode: AlignMode) {
  const s = S();
  const plan = planAlign(s.doc, s.selection, mode);
  if (plan.length) s.apply((d) => applyShifts(d.diagram, plan));
}

export function distributeSelection(axis: 'x' | 'y') {
  const s = S();
  const plan = planDistribute(s.doc, s.selection, axis);
  if (plan.length) s.apply((d) => applyShifts(d.diagram, plan));
}

export function transformSel(t: Transform) {
  const s = S();
  if (s.selection.length) s.apply((d) => transformSelection(d.diagram, s.selection, t));
}
