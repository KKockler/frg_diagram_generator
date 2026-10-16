import type { Vec } from '../model/types';

export const v = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const normalize = (a: Vec): Vec => {
  const l = len(a);
  return l === 0 ? { x: 1, y: 0 } : { x: a.x / l, y: a.y / l };
};
/** Rotate by +90°; the "left" normal of a direction (in y-down screen space it points to the visual right-hand side). */
export const perp = (a: Vec): Vec => ({ x: -a.y, y: a.x });
export const fromAngle = (phi: number, r = 1): Vec => ({ x: r * Math.cos(phi), y: r * Math.sin(phi) });
export const angleOf = (a: Vec): number => Math.atan2(a.y, a.x);

/** Map an angle into [0, 2π). */
export const mod2pi = (a: number): number => {
  const t = a % (2 * Math.PI);
  return t < 0 ? t + 2 * Math.PI : t;
};
