import type { Cmd } from '../geometry/path';
import { isTex, type BBox, type PathPrim, type Prim, type TexPrim } from './primitives';

const f = (x: number) => (Math.round(x * 1000) / 1000).toString();

export function cmdsToD(cmds: Cmd[]): string {
  return cmds
    .map((c) => {
      switch (c.op) {
        case 'M':
        case 'L':
          return `${c.op}${f(c.p.x)} ${f(c.p.y)}`;
        case 'C':
          return `C${f(c.c1.x)} ${f(c.c1.y)} ${f(c.c2.x)} ${f(c.c2.y)} ${f(c.p.x)} ${f(c.p.y)}`;
        case 'Z':
          return 'Z';
      }
    })
    .join('');
}

/** SVG presentation attributes of a primitive, as a plain object (usable by React and by string output). */
export function primAttrs(p: PathPrim): Record<string, string> {
  const a: Record<string, string> = {
    d: cmdsToD(p.d),
    fill: p.fill ?? 'none',
    stroke: p.stroke ?? 'none',
  };
  if (p.opacity !== undefined && p.opacity < 1) a['fill-opacity'] = f(p.opacity);
  if (p.stroke) {
    a['stroke-width'] = f(p.width ?? 1);
    a['stroke-linecap'] = p.cap ?? 'butt';
    a['stroke-linejoin'] = p.join ?? 'round';
    if (p.dash) a['stroke-dasharray'] = p.dash.map(f).join(' ');
  }
  return a;
}

/** Transform placing MathJax markup (1000 units/em, y down) at its canvas position. */
export const texTransform = (p: TexPrim) => `translate(${f(p.tex.x)} ${f(p.tex.y)}) scale(${f(p.tex.s)})`;

const texGroup = (p: TexPrim) => `<g transform="${texTransform(p)}">${p.tex.inner}</g>`;

const pathElement = (p: PathPrim) =>
  '<path ' +
  Object.entries(primAttrs(p))
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ') +
  '/>';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Standalone SVG document. `source` (document JSON) is embedded in <metadata>
 * so the file can be re-opened in the editor.
 */
export function toSvgString(prims: Prim[], bbox: BBox, opts: { scale?: number; source?: string } = {}): string {
  const s = opts.scale ?? 1;
  const paths = prims.map((p) => (isTex(p) ? texGroup(p) : pathElement(p))).join('\n  ');
  const meta = opts.source ? `\n  <metadata><frg:source xmlns:frg="https://frg-diagrams/ns">${esc(opts.source)}</frg:source></metadata>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${f(bbox.w * s)}pt" height="${f(bbox.h * s)}pt" viewBox="${f(bbox.x)} ${f(bbox.y)} ${f(bbox.w)} ${f(bbox.h)}">${meta}
  ${paths}
</svg>
`;
}

/** Extract embedded document JSON from an SVG produced by toSvgString. */
export function sourceFromSvg(svg: string): string | null {
  const m = svg.match(/<frg:source[^>]*>([\s\S]*?)<\/frg:source>/);
  if (!m) return null;
  return m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
