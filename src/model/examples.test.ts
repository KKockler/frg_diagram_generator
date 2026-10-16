import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXAMPLES } from './examples';
import { buildScene } from '../render/scene';
import { toTikz } from '../export/tikz';
import { serializeDocument } from '../export/io';

describe('examples', () => {
  it.each(EXAMPLES)('$id builds and renders', ({ build }) => {
    const doc = build();
    const scene = buildScene(doc);
    expect(scene.bbox!.w).toBeGreaterThan(100);
  });

  it('2pt_flow has the eleven diagrams of the thesis figure', () => {
    const doc = EXAMPLES[0].build();
    expect(doc.diagram.groups).toHaveLength(11);
    // every diagram carries exactly one regulator
    for (const g of doc.diagram.groups) expect(doc.diagram.edges.filter((e) => g.members.includes(e.id)).flatMap((e) => e.insertions)).toHaveLength(1);
  });

  // `EXAMPLES_OUT=examples npm test` refreshes the files in examples/.
  it('writes example files when EXAMPLES_OUT is set', () => {
    const out = process.env.EXAMPLES_OUT;
    if (!out) return;
    mkdirSync(out, { recursive: true });
    for (const ex of EXAMPLES) {
      const doc = ex.build();
      writeFileSync(join(out, `${ex.id}.frg.json`), serializeDocument(doc));
      writeFileSync(join(out, `${ex.id}.tex`), toTikz(doc, { scale: 1, standalone: true, source: serializeDocument(doc) }).tex);
    }
  });
});
