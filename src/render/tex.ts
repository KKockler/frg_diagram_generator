// TeX → vector paths via MathJax (SVG output, glyphs inlined as <path>s).
// Works in the browser and in Node (liteAdaptor), so it is unit-testable.
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js';
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import 'mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js';

/** Typeset TeX. Coordinates are MathJax's: 1000 units per em, y down, baseline at y = 0. */
export interface TexBox {
  /** Inner SVG markup; colours are "currentColor". */
  inner: string;
  vb: { x: number; y: number; w: number; h: number };
}

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const mjDoc = mathjax.document('', {
  InputJax: new TeX({ packages: ['base', 'ams', 'newcommand', 'boldsymbol', 'noundefined'] }),
  OutputJax: new SVG({ fontCache: 'none' }),
});

const cache = new Map<string, TexBox>();

export function typeset(tex: string): TexBox {
  const hit = cache.get(tex);
  if (hit) return hit;
  let box: TexBox;
  try {
    const container = mjDoc.convert(tex, { display: false });
    const svg = adaptor.firstChild(container) as never;
    const [x, y, w, h] = String(adaptor.getAttribute(svg, 'viewBox')).split(/\s+/).map(Number);
    box = { inner: adaptor.innerHTML(svg), vb: { x, y, w, h } };
  } catch {
    box = { inner: '', vb: { x: 0, y: -500, w: 500, h: 700 } };
  }
  // Each call builds a new tree; drop MathJax's internal list so memory stays flat.
  mjDoc.clear();
  if (cache.size > 2000) cache.clear();
  cache.set(tex, box);
  return box;
}
