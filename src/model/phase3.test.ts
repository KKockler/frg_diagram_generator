import { describe, expect, it } from 'vitest';
import { applyColorMode, emptyDocument, STYLE_PRESETS } from './defaults';
import { getStamp } from './stamps';
import { emptyLibrary, extractTemplate, GROUP_LIBRARY, instantiate, mergeLibrary, parseLibrary } from './library';
import { buildScene } from '../render/scene';
import { isTex } from '../render/primitives';

function withBubble() {
  const doc = emptyDocument();
  const d = getStamp('bubble').build({ at: { x: 100, y: 50 }, style: doc.style, field: 'pion' });
  doc.diagram = d;
  d.labels.push({ id: 'l', tex: '\\pi', x: 0, y: -10, attach: { node: d.nodes[0].id } });
  d.groups[0].members.push('l');
  return doc;
}

describe('colour modes', () => {
  it('maps colours to grey or black but keeps white and greys', () => {
    expect(applyColorMode('#0080ff', 'color')).toBe('#0080ff');
    expect(applyColorMode('#0080ff', 'black')).toBe('#000000');
    expect(applyColorMode('#ffffff', 'black')).toBe('#ffffff');
    expect(applyColorMode('#c8c8c8', 'black')).toBe('#c8c8c8');
    expect(applyColorMode('#ff0000', 'grayscale')).toBe('#4c4c4c');
  });

  it('the journal preset renders no colour at all', () => {
    const doc = withBubble();
    doc.style = { ...STYLE_PRESETS.find((p) => p.colorMode === 'black')! };
    for (const p of buildScene(doc).prims) {
      const cols = isTex(p) ? [p.tex.color] : [p.stroke, p.fill].filter(Boolean);
      for (const c of cols) expect(['#000000', '#ffffff']).toContain(c);
    }
  });
});

describe('libraries', () => {
  it('the bundled group library parses', () => {
    expect(GROUP_LIBRARY.format).toBe('frg-library');
    expect(GROUP_LIBRARY.fields.length).toBeGreaterThan(0);
  });

  it('a saved template is centred, self-contained and re-placeable', () => {
    const doc = withBubble();
    const t = extractTemplate(doc, doc.diagram.groups[0].members, 'My bubble')!;
    expect(t.fields.map((f) => f.id)).toEqual(['pion']);
    const box = buildScene({ ...doc, diagram: t.diagram }).bbox!;
    expect(box.x + box.w / 2).toBeCloseTo(0);
    const placed = instantiate(t, { x: 300, y: 0 });
    expect(placed.groups).toHaveLength(1);
    expect(placed.groups[0].name).toBe('My bubble');
    expect(placed.nodes.map((n) => n.id)).not.toEqual(t.diagram.nodes.map((n) => n.id));
    expect(placed.labels).toHaveLength(1);
    const b2 = buildScene({ ...doc, diagram: placed }).bbox!;
    expect(b2.x + b2.w / 2).toBeCloseTo(300);
  });

  it('merging libraries adds new entries only', () => {
    const doc = withBubble();
    const t = extractTemplate(doc, doc.diagram.groups[0].members, 'x')!;
    const a = { ...emptyLibrary('a'), templates: [t], fields: t.fields };
    const merged = mergeLibrary(a, parseLibrary(JSON.stringify(a)));
    expect(merged.templates).toHaveLength(1);
    expect(merged.fields).toHaveLength(1);
    expect(() => parseLibrary('{"format":"x"}')).toThrow();
  });
});

describe('vertex types', () => {
  it('every shape renders, sizes scale with the style sheet, and a TeX label can sit inside', async () => {
    const { listVertexShapes } = await import('../styles/nodeKinds');
    const { vertexRadius } = await import('../render/scene');
    const doc = emptyDocument();
    doc.vertexTypes = listVertexShapes().map((s) => ({ id: s.id, name: s.label, shape: s.id, scale: 2, fill: 'style', stroke: 'Black', strokeWidth: 0.6, tex: 'n' }));
    doc.diagram.nodes = doc.vertexTypes.map((v, i) => ({ id: 'n' + i, kind: v.id, x: i * 40, y: 0 }));
    const scene = buildScene(doc);
    expect(scene.prims.filter(isTex)).toHaveLength(doc.vertexTypes.length);
    expect(vertexRadius(doc, 'circle')).toBe(2 * doc.style.vertexRadius);
    expect(vertexRadius(doc, 'external')).toBe(0);
    expect(scene.bbox!.h).toBeGreaterThan(2 * doc.style.vertexRadius * 2 - 1);
  });

  it('old documents without vertex types get the defaults', async () => {
    const { normalizeDocument } = await import('../export/io');
    const raw = JSON.parse(JSON.stringify(emptyDocument()));
    delete raw.vertexTypes;
    expect(normalizeDocument(raw).vertexTypes.map((v) => v.id)).toContain('fullVertex');
  });

  it('templates carry the vertex types they use', () => {
    const doc = withBubble();
    doc.vertexTypes.push({ id: 'mine', name: 'Mine', shape: 'diamond', scale: 1, fill: 'Red', stroke: 'none', strokeWidth: 0 });
    doc.diagram.nodes.find((n) => n.kind === 'fullVertex')!.kind = 'mine';
    const t = extractTemplate(doc, doc.diagram.groups[0].members, 'x')!;
    expect(t.vertexTypes!.map((v) => v.id).sort()).toEqual(['fullVertex', 'mine']);
  });
});

describe('phase 4 layout tools', () => {
  it('align, distribute, rotate and mirror', async () => {
    const { planAlign, planDistribute, applyShifts, transformSelection, rowItems } = await import('./layout');
    const doc = emptyDocument();
    for (const [i, id] of ['bubble', 'tadpole', 'box'].entries()) {
      const d = getStamp(id).build({ at: { x: i * 150, y: i * 30 }, style: doc.style, field: 'pion' });
      doc.diagram.nodes.push(...d.nodes);
      doc.diagram.edges.push(...d.edges);
      doc.diagram.groups.push(...d.groups);
    }
    doc.diagram.regions.push({ id: 'r', shape: 'rect', x: 400, y: 0, w: 40, h: 20, fill: 'LightGray', opacity: 0.5, stroke: 'none', dashed: false, radius: 3 });
    const all = [...doc.diagram.nodes.map((n) => n.id), 'r'];
    applyShifts(doc.diagram, planAlign(doc, all, 'top'));
    const tops = rowItems(doc.diagram, all).map((i) => buildScene(doc, i).bbox!.y);
    for (const t of tops) expect(t).toBeCloseTo(tops[0]);
    applyShifts(doc.diagram, planDistribute(doc, all, 'x'));
    const boxes = rowItems(doc.diagram, all).map((i) => buildScene(doc, i).bbox!).sort((a, b) => a.x - b.x);
    const gaps = boxes.slice(1).map((b, i) => b.x - (boxes[i].x + boxes[i].w));
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0]);

    const bubble = doc.diagram.groups[0];
    const before = buildScene(doc, new Set(bubble.members)).bbox!;
    transformSelection(doc.diagram, bubble.members, { kind: 'rotate', angle: Math.PI / 2 });
    const after = buildScene(doc, new Set(bubble.members)).bbox!;
    expect(after.w).toBeCloseTo(before.h, 0);
    expect(after.h).toBeCloseTo(before.w, 0);
    transformSelection(doc.diagram, ['r'], { kind: 'rotate', angle: Math.PI / 2 });
    expect(doc.diagram.regions[0].w).toBe(20);
    const loop = doc.diagram.edges.find((e) => e.loop)!;
    const a0 = loop.loop!.angle;
    transformSelection(doc.diagram, [loop.id], { kind: 'mirror', axis: 'y' });
    expect(loop.loop!.angle).toBeCloseTo(-a0);
  });

  it('regions render (rect and ellipse) with opacity in SVG and TikZ', async () => {
    const { toTikz } = await import('../export/tikz');
    const { toSvgString } = await import('../render/svg');
    const doc = emptyDocument();
    doc.diagram.regions.push({ id: 'a', shape: 'ellipse', x: 0, y: 0, w: 60, h: 30, fill: 'LightGray', opacity: 0.4, stroke: 'Black', dashed: true, radius: 0 });
    doc.diagram.regions.push({ id: 'b', shape: 'rect', x: 80, y: 0, w: 60, h: 30, fill: 'RoyalBlue', opacity: 0.3, stroke: 'none', dashed: false, radius: 6 });
    const scene = buildScene(doc);
    expect(scene.bbox!.w).toBeCloseTo(140 + doc.style.lineWidth * 0.3); // half the outline of the left one
    expect(toSvgString(scene.prims, scene.bbox!)).toContain('fill-opacity="0.4"');
    expect(toTikz(doc, { scale: 1 }).tex).toContain('fill opacity=0.3');
  });
});
