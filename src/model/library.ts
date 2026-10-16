// Shareable libraries (.frglib.json): field types, style sheets and custom templates.
// The group library ships with the app (library/group.frglib.json); every user also has a
// personal library kept in the browser and exportable as a file.
import type { Diagram, FieldType, FrgDocument, StyleSheet, Vec, VertexType } from './types';
import { newId } from './defaults';
import { duplicate } from './ops';
import { expandSelection } from './layout';
import { buildScene } from '../render/scene';
import groupLibraryJson from '../../library/group.frglib.json';

export interface Template {
  id: string;
  name: string;
  /** Items centred on the origin, forming one group. */
  diagram: Diagram;
  /** Field and vertex types the template uses, so it renders in documents that lack them. */
  fields: FieldType[];
  vertexTypes?: VertexType[];
}

export interface Library {
  format: 'frg-library';
  version: 1;
  name: string;
  fields: FieldType[];
  vertexTypes: VertexType[];
  styles: StyleSheet[];
  templates: Template[];
}

export const emptyLibrary = (name: string): Library => ({ format: 'frg-library', version: 1, name, fields: [], vertexTypes: [], styles: [], templates: [] });

export function parseLibrary(text: string): Library {
  const raw = JSON.parse(text) as Partial<Library>;
  if (raw.format !== 'frg-library') throw new Error('Not an fRG library file (.frglib.json).');
  return { ...emptyLibrary(raw.name ?? 'Library'), ...raw, format: 'frg-library', version: 1 } as Library;
}

export const GROUP_LIBRARY: Library = parseLibrary(JSON.stringify(groupLibraryJson));

/** Snapshot the selection as a template: recentred on the origin and wrapped in one group. */
export function extractTemplate(doc: FrgDocument, ids: Iterable<string>, name: string): Template | null {
  const all = expandSelection(doc.diagram, ids);
  const box = buildScene(doc, all).bbox;
  if (!box) return null;
  const D = doc.diagram;
  const tmp: Diagram = structuredClone({
    nodes: D.nodes.filter((n) => all.has(n.id)),
    edges: D.edges.filter((e) => all.has(e.id)),
    labels: D.labels.filter((l) => all.has(l.id)),
    regions: D.regions.filter((r) => all.has(r.id)),
    groups: [],
  });
  const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const moved = relocate(tmp, { x: -c.x, y: -c.y });
  const used = new Set(moved.edges.map((e) => e.field));
  const usedV = new Set(moved.nodes.map((n) => n.kind));
  return {
    id: newId('t'),
    name,
    diagram: moved,
    fields: doc.fieldTypes.filter((f) => used.has(f.id)).map((f) => ({ ...f })),
    vertexTypes: doc.vertexTypes.filter((v) => usedV.has(v.id)).map((v) => ({ ...v })),
  };
}

/** Fresh-id copy of a diagram shifted by offset, wrapped in one group. */
function relocate(src: Diagram, offset: Vec, groupName = 'Template'): Diagram {
  const tmp: Diagram = structuredClone({ ...src, regions: src.regions ?? [], groups: [] });
  const ids = new Set([...tmp.nodes, ...tmp.edges, ...tmp.labels, ...tmp.regions].map((x) => x.id));
  const { ids: fresh } = duplicate(tmp, ids, offset);
  const keep = new Set(fresh);
  const out: Diagram = {
    nodes: tmp.nodes.filter((n) => keep.has(n.id)),
    edges: tmp.edges.filter((e) => keep.has(e.id)),
    labels: tmp.labels.filter((l) => keep.has(l.id)),
    regions: tmp.regions.filter((r) => keep.has(r.id)),
    groups: [],
  };
  out.groups.push({ id: newId('g'), name: groupName, members: [...out.nodes, ...out.edges, ...out.labels, ...out.regions].map((x) => x.id) });
  return out;
}

/** Items to add to a document when placing a template at `at`. */
export function instantiate(t: Template, at: Vec): Diagram {
  return relocate(t.diagram, at, t.name);
}

export const missingVertexTypes = (doc: FrgDocument, vts: VertexType[] = []) => vts.filter((v) => !doc.vertexTypes.some((x) => x.id === v.id));

/** Field types from `fields` that the document does not have yet. */
export const missingFields = (doc: FrgDocument, fields: FieldType[]) => fields.filter((f) => !doc.fieldTypes.some((x) => x.id === f.id));

/** Merge a library into another (templates appended, fields/styles added when new). */
export function mergeLibrary(into: Library, add: Library): Library {
  return {
    ...into,
    fields: [...into.fields, ...add.fields.filter((f) => !into.fields.some((x) => x.id === f.id))],
    vertexTypes: [...into.vertexTypes, ...add.vertexTypes.filter((v) => !into.vertexTypes.some((x) => x.id === v.id))],
    styles: [...into.styles, ...add.styles.filter((s) => !into.styles.some((x) => x.name === s.name))],
    templates: [...into.templates, ...add.templates.filter((t) => !into.templates.some((x) => x.id === t.id))],
  };
}
