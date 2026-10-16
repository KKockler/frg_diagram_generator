import type { Vec } from '../model/types';
import { add, angleOf, dist, fromAngle, lerp, mod2pi, normalize, perp, scale, sub } from './vec';

/**
 * Path commands understood by every renderer (SVG, PDF, TikZ).
 * Only straight segments and cubic Béziers, so each backend stays trivial.
 */
export type Cmd =
  | { op: 'M'; p: Vec }
  | { op: 'L'; p: Vec }
  | { op: 'C'; c1: Vec; c2: Vec; p: Vec }
  | { op: 'Z' };

/**
 * A centre-line parametrised by arc length s ∈ [0, length].
 * Lines and circular arcs are closed under offsetting, which makes double lines exact.
 */
export interface Path {
  readonly length: number;
  pointAt(s: number): Vec;
  /** Unit tangent in the direction of increasing s. */
  tangentAt(s: number): Vec;
  /** Parallel path shifted by d along the left normal perp(tangent). */
  offset(d: number): Path;
  reverse(): Path;
  toCmds(): Cmd[];
}

export class LinePath implements Path {
  readonly length: number;
  constructor(
    readonly a: Vec,
    readonly b: Vec,
  ) {
    this.length = dist(a, b);
  }
  pointAt(s: number): Vec {
    return this.length === 0 ? this.a : lerp(this.a, this.b, s / this.length);
  }
  tangentAt(): Vec {
    return normalize(sub(this.b, this.a));
  }
  offset(d: number): Path {
    const n = scale(perp(this.tangentAt()), d);
    return new LinePath(add(this.a, n), add(this.b, n));
  }
  reverse(): Path {
    return new LinePath(this.b, this.a);
  }
  toCmds(): Cmd[] {
    return [
      { op: 'M', p: this.a },
      { op: 'L', p: this.b },
    ];
  }
}

export class ArcPath implements Path {
  readonly length: number;
  /**
   * @param c centre, @param r radius, @param a0 start angle,
   * @param sweep signed angle swept (positive = increasing angle).
   */
  constructor(
    readonly c: Vec,
    readonly r: number,
    readonly a0: number,
    readonly sweep: number,
  ) {
    this.length = Math.abs(sweep) * r;
  }
  angleAt(s: number): number {
    return this.a0 + (this.length === 0 ? 0 : (s / this.length) * this.sweep);
  }
  pointAt(s: number): Vec {
    return add(this.c, fromAngle(this.angleAt(s), this.r));
  }
  tangentAt(s: number): Vec {
    const phi = this.angleAt(s);
    const t = { x: -Math.sin(phi), y: Math.cos(phi) };
    return this.sweep >= 0 ? t : scale(t, -1);
  }
  offset(d: number): Path {
    // perp(tangent) points towards the centre for sweep > 0.
    const r = this.sweep >= 0 ? this.r - d : this.r + d;
    return new ArcPath(this.c, Math.max(r, 0), this.a0, this.sweep);
  }
  reverse(): Path {
    return new ArcPath(this.c, this.r, this.a0 + this.sweep, -this.sweep);
  }
  toCmds(): Cmd[] {
    const n = Math.max(1, Math.ceil(Math.abs(this.sweep) / (Math.PI / 2) - 1e-9));
    const step = this.sweep / n;
    const k = (4 / 3) * Math.tan(step / 4);
    const cmds: Cmd[] = [{ op: 'M', p: this.pointAt(0) }];
    for (let i = 0; i < n; i++) {
      const phi0 = this.a0 + i * step;
      const phi1 = phi0 + step;
      const p0 = add(this.c, fromAngle(phi0, this.r));
      const p1 = add(this.c, fromAngle(phi1, this.r));
      const t0 = { x: -Math.sin(phi0), y: Math.cos(phi0) };
      const t1 = { x: -Math.sin(phi1), y: Math.cos(phi1) };
      cmds.push({
        op: 'C',
        c1: add(p0, scale(t0, k * this.r)),
        c2: sub(p1, scale(t1, k * this.r)),
        p: p1,
      });
    }
    return cmds;
  }
}

/**
 * Circular arc from a to b whose midpoint is displaced by `bend` along perp(b - a).
 * bend = 0 gives a straight line.
 */
export function arcThrough(a: Vec, b: Vec, bend: number): Path {
  const chord = dist(a, b);
  if (Math.abs(bend) < 1e-6 || chord < 1e-9) return new LinePath(a, b);
  const m = lerp(a, b, 0.5);
  const n = perp(normalize(sub(b, a)));
  const r = (chord * chord) / 4 / (2 * Math.abs(bend)) + Math.abs(bend) / 2;
  const top = add(m, scale(n, bend));
  const c = add(m, scale(n, bend - Math.sign(bend) * r));
  const angA = angleOf(sub(a, c));
  const angB = angleOf(sub(b, c));
  const angP = angleOf(sub(top, c));
  const dAB = mod2pi(angB - angA);
  const dAP = mod2pi(angP - angA);
  const sweep = dAP < dAB ? dAB : dAB - 2 * Math.PI;
  return new ArcPath(c, r, angA, sweep);
}

/** Full circle starting and ending at node position p, centred at p + radius·(cos angle, sin angle). */
export function selfLoop(p: Vec, radius: number, angle: number): Path {
  const c = add(p, fromAngle(angle, radius));
  return new ArcPath(c, radius, angle + Math.PI, 2 * Math.PI);
}

/** Smooth curve through the given points (Catmull–Rom converted to cubic Béziers). */
export function smoothThrough(pts: Vec[]): Cmd[] {
  if (pts.length === 0) return [];
  const cmds: Cmd[] = [{ op: 'M', p: pts[0] }];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    cmds.push({
      op: 'C',
      c1: add(p1, scale(sub(p2, p0), 1 / 6)),
      c2: sub(p2, scale(sub(p3, p1), 1 / 6)),
      p: p2,
    });
  }
  return cmds;
}

/**
 * Point at local coordinates (u along the path, w along the left normal).
 * Outside [0, length] the path is extended along its end tangents.
 */
export function localToWorld(path: Path, u: number, w: number): Vec {
  const s = Math.min(Math.max(u, 0), path.length);
  const t = path.tangentAt(s);
  const base = add(path.pointAt(s), scale(t, u - s));
  return add(base, scale(perp(t), w));
}

/** Sample the local curve (u(φ), w(φ)) for φ ∈ [φ0, φ1] and return a smooth path. */
export function localCurve(
  path: Path,
  f: (phi: number) => { u: number; w: number },
  phi0: number,
  phi1: number,
  samples: number,
): Cmd[] {
  const pts: Vec[] = [];
  for (let i = 0; i <= samples; i++) {
    const { u, w } = f(phi0 + ((phi1 - phi0) * i) / samples);
    pts.push(localToWorld(path, u, w));
  }
  return smoothThrough(pts);
}

export function circleCmds(c: Vec, r: number): Cmd[] {
  return [...new ArcPath(c, r, 0, 2 * Math.PI).toCmds(), { op: 'Z' }];
}
