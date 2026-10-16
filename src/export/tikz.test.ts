import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyDocument } from '../model/defaults';
import { STAMPS } from '../model/stamps';
import { toTikz } from './tikz';
import { parseAnyFile, serializeDocument } from './io';

/** One document per template, using a spread of fields so every line style is exercised. */
function templateDocs() {
  const fields = ['pion', 'sigma', 'quark', 'gluon', 'ghost', 'photon', 'scalar'];
  return STAMPS.map((s, i) => {
    const doc = emptyDocument();
    const d = s.build({ at: { x: 0, y: 0 }, style: doc.style, field: fields[i % fields.length] });
    doc.diagram = d;
    if (d.edges[0]) d.edges[0].momentum = { tex: 'p', side: -1, reversed: false };
    d.labels.push({ id: 'lhs', tex: '\\partial_t\\Gamma^{(2)} \\propto -\\frac12', x: -120, y: 0 });
    return { id: s.id, doc };
  });
}

describe('TikZ export', () => {
  it.each(templateDocs())('$id produces a tikzpicture with labels as TeX nodes', ({ doc }) => {
    const { tex } = toTikz(doc, { scale: 1 });
    expect(tex).toContain('\\begin{tikzpicture}');
    expect(tex).toContain('{$\\partial_t\\Gamma^{(2)} \\propto -\\frac12$}');
    expect(tex).not.toMatch(/NaN|Infinity/);
  });

  it('round-trips through the embedded source comment', () => {
    const { doc } = templateDocs()[3];
    const { tex } = toTikz(doc, { scale: 1, source: serializeDocument(doc) });
    expect(parseAnyFile('x.tex', new TextEncoder().encode(tex))).toEqual(doc);
  });

  // CI (and `TIKZ_OUT=dir npm test`) compiles these with pdflatex.
  it('writes standalone files when TIKZ_OUT is set', () => {
    const out = process.env.TIKZ_OUT;
    if (!out) return;
    mkdirSync(out, { recursive: true });
    for (const { id, doc } of templateDocs()) writeFileSync(join(out, `${id}.tex`), toTikz(doc, { scale: 1, standalone: true }).tex);
  });
});
