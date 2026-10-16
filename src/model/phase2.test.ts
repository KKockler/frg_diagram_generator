import { describe, expect, it } from 'vitest';
import { emptyDocument } from './defaults';
import { getStamp } from './stamps';
import { deleteIds, groupOf, splitEdge } from './ops';
import { planRow, arrangeRow, regulatorSum, rowItems } from './layout';
import { buildScene } from '../render/scene';
import { isTex } from '../render/primitives';
import { typeset } from '../render/tex';
import { toSvgString } from '../render/svg';
import type { FrgDocument } from './types';

function place(doc: FrgDocument, id: string, x: number, field = 'pion') {
  const d = getStamp(id).build({ at: { x, y: 0 }, style: doc.style, field });
  doc.diagram.nodes.push(...d.nodes);
  doc.diagram.edges.push(...d.edges);
  doc.diagram.labels.push(...d.labels);
  doc.diagram.groups.push(...d.groups);
  return d;
}

describe('TeX labels', () => {
  it('typesets to inline glyph paths with a baseline-relative viewBox', () => {
    const t = typeset('\\partial_t\\Gamma^{(2)}_\\pi');
    expect(t.inner).toContain('<path');
    expect(t.inner).not.toContain('<use');
    expect(t.vb.y).toBeLessThan(0);
    expect(t.vb.w).toBeGreaterThan(0);
  });

  it('places a free label centred on its position and into SVG output', () => {
    const doc = emptyDocument();
    doc.diagram.labels.push({ id: 'l1', tex: '-\\frac12', x: 50, y: 20 });
    const scene = buildScene(doc);
    const b = scene.labelBoxes.get('l1')!;
    expect(b.x + b.w / 2).toBeCloseTo(50);
    expect(b.y + b.h / 2).toBeCloseTo(20);
    const svg = toSvgString(scene.prims, scene.bbox!);
    expect(svg).toContain(`scale(${doc.style.termSize / 1000})`);
    expect(svg).not.toContain('currentColor');
  });

  it('attached labels follow their node and are removed with it', () => {
    const doc = emptyDocument();
    const d = place(doc, 'vertex4', 0);
    const v = d.nodes.find((n) => n.kind === 'fullVertex')!;
    doc.diagram.labels.push({ id: 'lv', tex: 'x', x: 0, y: -10, attach: { node: v.id } });
    v.x = 100;
    expect(buildScene(doc).labelBoxes.get('lv')!.x).toBeGreaterThan(90);
    deleteIds(doc.diagram, new Set([v.id]));
    expect(doc.diagram.labels.find((l) => l.id === 'lv')).toBeUndefined();
  });

  it('draws a momentum arrow with its label', () => {
    const doc = emptyDocument();
    const d = place(doc, 'propagator', 0);
    d.edges[0].momentum = { tex: 'p', side: -1, reversed: false };
    expect(buildScene(doc).prims.filter(isTex)).toHaveLength(1);
  });
});

describe('groups', () => {
  it('stamps are placed as one named group', () => {
    const doc = emptyDocument();
    const d = place(doc, 'bubble', 0);
    expect(d.groups).toHaveLength(1);
    expect(d.groups[0].name).toBe('Polarisation / self-energy');
    expect(d.groups[0].members.length).toBe(d.nodes.length + d.edges.length);
  });

  it('splitting a grouped line keeps the new parts in the group', () => {
    const doc = emptyDocument();
    const d = place(doc, 'bubble', 0);
    const e = d.edges.find((x) => x.insertions.length)!;
    const n = splitEdge(doc.diagram, e.id, { x: -20, y: -20 }, 'bareVertex')!;
    const g = groupOf(doc.diagram, n.id)!;
    expect(g).toBeDefined();
    expect(g.members).not.toContain(e.id);
  });
});

describe('equation rows', () => {
  it('arranges items left to right with equal gaps and a common centre line', () => {
    const doc = emptyDocument();
    place(doc, 'bubble', 0);
    place(doc, 'tadpole', 300);
    doc.diagram.labels.push({ id: 'plus', tex: '+', x: 150, y: 40 });
    const all = [...doc.diagram.nodes, ...doc.diagram.edges, ...doc.diagram.labels].map((x) => x.id);
    expect(rowItems(doc.diagram, all)).toHaveLength(3);
    arrangeRow(doc.diagram, planRow(doc, all));
    const boxes = rowItems(doc.diagram, all)
      .map((i) => buildScene(doc, i).bbox!)
      .sort((a, b) => a.x - b.x);
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].x - (boxes[i - 1].x + boxes[i - 1].w)).toBeCloseTo(doc.style.rowGap);
      expect(boxes[i].y + boxes[i].h / 2).toBeCloseTo(boxes[0].y + boxes[0].h / 2);
    }
  });

  it('regulator sum makes room for terms to its right', () => {
    const doc = emptyDocument();
    const d = place(doc, 'bubble', 0);
    const right = place(doc, 'tadpole', 120);
    const v = right.nodes.find((n) => n.kind === 'fullVertex')!;
    const x0 = v.x;
    const before = JSON.parse(JSON.stringify(doc)) as FrgDocument;
    regulatorSum(doc.diagram, before, d.groups[0].members);
    const moved = doc.diagram.nodes.find((n) => n.id === v.id)!;
    expect(moved.x).toBeGreaterThan(x0 + 100);
  });

  it('regulator on each line produces one term per internal line', () => {
    const doc = emptyDocument();
    const d = place(doc, 'sunset', 0);
    const before = JSON.parse(JSON.stringify(doc)) as FrgDocument;
    const out = regulatorSum(doc.diagram, before, d.groups[0].members)!;
    expect(out).not.toBeNull();
    expect(doc.diagram.groups).toHaveLength(3);
    expect(doc.diagram.labels.filter((l) => l.tex === '+')).toHaveLength(2);
    // A diagram already standing to the right is pushed out of the way.
    for (const g of doc.diagram.groups) {
      const regs = doc.diagram.edges.filter((e) => g.members.includes(e.id)).flatMap((e) => e.insertions);
      expect(regs).toHaveLength(1);
    }
  });
});
