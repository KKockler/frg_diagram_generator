import { describe, expect, it } from 'vitest';
import { emptyDocument } from './defaults';
import { deleteIds, duplicate, mergeNodes, nodeMap, splitEdge } from './ops';
import { STAMPS } from './stamps';
import { buildScene, edgePath } from '../render/scene';
import { toSvgString, sourceFromSvg } from '../render/svg';
import { normalizeDocument, parseAnyFile, pdfSourceBlock, serializeDocument } from '../export/io';
import { listLineStyles } from '../styles/lineStyles';
import { dist } from '../geometry/vec';
import { isTex, type PathPrim } from '../render/primitives';

function docWith(stampId: string) {
  const doc = emptyDocument();
  const d = STAMPS.find((s) => s.id === stampId)!.build({ at: { x: 0, y: 0 }, style: doc.style, field: 'pion' });
  doc.diagram = d;
  return doc;
}

describe('stamps', () => {
  it.each(STAMPS.map((s) => s.id))('%s renders with a finite bounding box', (id) => {
    const scene = buildScene(docWith(id));
    expect(scene.prims.length).toBeGreaterThan(0);
    expect(scene.bbox && isFinite(scene.bbox.w) && scene.bbox.w > 0).toBe(true);
  });

  it('bubble lines lie on one circle of the canonical loop radius', () => {
    const doc = docWith('bubble');
    const nodes = nodeMap(doc.diagram);
    const internal = doc.diagram.edges.filter((e) => nodes.get(e.from)!.kind !== 'external' && nodes.get(e.to)!.kind !== 'external');
    expect(internal).toHaveLength(2);
    for (const e of internal) {
      const p = edgePath(e, nodes)!;
      expect(dist(p.pointAt(p.length / 2), { x: 0, y: 0 })).toBeCloseTo(doc.style.loopRadius);
    }
  });
});

describe('every line style', () => {
  it.each(listLineStyles().map((s) => s.id))('%s builds finite geometry', (id) => {
    const doc = docWith('bubble');
    doc.fieldTypes = [{ id: 'pion', name: 'x', tex: '', line: id, color: 'Black', arrows: 'forward' }];
    const scene = buildScene(doc);
    for (const p of scene.prims.filter((q) => !isTex(q)) as PathPrim[])
      for (const c of p.d) if (c.op !== 'Z') expect(isFinite(c.p.x) && isFinite(c.p.y)).toBe(true);
  });
});

describe('ops', () => {
  it('splitEdge keeps the geometry of an arc', () => {
    const doc = docWith('bubble');
    const nodes = nodeMap(doc.diagram);
    const top = doc.diagram.edges.find((e) => e.insertions.length)!;
    const before = edgePath(top, nodes)!;
    const q = before.pointAt(before.length * 0.25);
    const n = splitEdge(doc.diagram, top.id, q, 'bareVertex')!;
    expect(dist(n, q)).toBeLessThan(0.5);
    const nodes2 = nodeMap(doc.diagram);
    for (const e of doc.diagram.edges.filter((e) => e.from === n.id || e.to === n.id)) {
      const p = edgePath(e, nodes2)!;
      expect(dist(p.pointAt(p.length / 2), { x: 0, y: 0 })).toBeCloseTo(doc.style.loopRadius, 1);
    }
    // regulator ends up on the second half
    expect(doc.diagram.edges.flatMap((e) => e.insertions)).toHaveLength(1);
  });

  it('deleting a vertex removes its lines and orphaned endpoints', () => {
    const doc = docWith('propagator');
    const [e] = doc.diagram.edges;
    deleteIds(doc.diagram, new Set([e.id]));
    expect(doc.diagram.nodes).toHaveLength(0);
  });

  it('merging an endpoint into a vertex re-attaches the line', () => {
    const doc = docWith('vertex4');
    const ext = doc.diagram.nodes.find((n) => n.kind === 'external')!;
    const v = doc.diagram.nodes.find((n) => n.kind === 'fullVertex')!;
    mergeNodes(doc.diagram, ext.id, v.id);
    expect(doc.diagram.nodes.find((n) => n.id === ext.id)).toBeUndefined();
    expect(doc.diagram.edges.some((e) => e.from === e.to && e.loop)).toBe(true);
  });

  it('duplicate copies nodes, edges and insertions with fresh ids', () => {
    const doc = docWith('tadpole');
    const all = new Set(doc.diagram.edges.map((e) => e.id));
    const out = duplicate(doc.diagram, all, { x: 100, y: 0 });
    expect(doc.diagram.edges).toHaveLength(6);
    expect(new Set(doc.diagram.edges.map((e) => e.id)).size).toBe(6);
    expect(out.ids.length).toBe(3 + 3);
    expect(doc.diagram.groups).toHaveLength(2);
  });
});

describe('file round-trip', () => {
  it('survives JSON, SVG metadata and the PDF marker block', () => {
    const doc = docWith('box');
    const json = serializeDocument(doc);
    expect(normalizeDocument(JSON.parse(json))).toEqual(doc);

    const scene = buildScene(doc);
    const svg = toSvgString(scene.prims, scene.bbox!, { source: json });
    expect(JSON.parse(sourceFromSvg(svg)!)).toEqual(doc);
    expect(parseAnyFile('x.svg', new TextEncoder().encode(svg))).toEqual(doc);

    const fakePdf = `%PDF-1.3\n<x:xmpmeta>${pdfSourceBlock(json)}</x:xmpmeta>\n%%EOF`;
    expect(parseAnyFile('x.pdf', new TextEncoder().encode(fakePdf))).toEqual(doc);
  });

  it('rejects foreign JSON', () => {
    expect(() => normalizeDocument({ hello: 1 })).toThrow();
  });
});
