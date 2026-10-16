import type { Vec } from '../model/types';
import type { Cmd } from '../geometry/path';

/** Renderer-independent drawing primitive. Colours are resolved hex strings. */
export type Prim = PathPrim | TexPrim;

export interface PathPrim {
  d: Cmd[];
  stroke?: string;
  width?: number;
  fill?: string;
  dash?: number[];
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
  /** Fill opacity (default 1). */
  opacity?: number;
}

/** Typeset TeX placed on the canvas: inner MathJax markup under translate(x, y) scale(s). */
export interface TexPrim {
  tex: { source: string; size: number; inner: string; x: number; y: number; s: number; color: string; box: BBox };
}

export const isTex = (p: Prim): p is TexPrim => 'tex' in p;

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function cubicAt(p0: Vec, c1: Vec, c2: Vec, p: Vec, t: number): Vec {
  const u = 1 - t;
  const a = u * u * u,
    b = 3 * u * u * t,
    c = 3 * u * t * t,
    d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p.x, y: a * p0.y + b * c1.y + c * c2.y + d * p.y };
}

/** Tight-ish bounding box (curves sampled), including half the stroke width. */
export function bboxOf(prims: Prim[], pad = 0): BBox | null {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  const grow = (p: Vec, r: number) => {
    x0 = Math.min(x0, p.x - r);
    y0 = Math.min(y0, p.y - r);
    x1 = Math.max(x1, p.x + r);
    y1 = Math.max(y1, p.y + r);
  };
  for (const prim of prims) {
    if (isTex(prim)) {
      const b = prim.tex.box;
      grow({ x: b.x, y: b.y }, 0);
      grow({ x: b.x + b.w, y: b.y + b.h }, 0);
      continue;
    }
    const r = prim.stroke ? (prim.width ?? 1) / 2 : 0;
    let cur: Vec = { x: 0, y: 0 };
    for (const c of prim.d) {
      if (c.op === 'M' || c.op === 'L') {
        grow(c.p, r);
        cur = c.p;
      } else if (c.op === 'C') {
        for (let i = 1; i <= 16; i++) grow(cubicAt(cur, c.c1, c.c2, c.p, i / 16), r);
        cur = c.p;
      }
    }
  }
  if (!isFinite(x0)) return null;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}

export function unionBox(a: BBox | null, b: BBox | null): BBox | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
