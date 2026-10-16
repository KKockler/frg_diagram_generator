import type { ArrowMode, StyleSheet } from '../model/types';
import { resolveColor } from '../model/defaults';
import { localCurve, type Path } from '../geometry/path';
import { add, perp, scale, sub } from '../geometry/vec';
import type { PathPrim, Prim } from '../render/primitives';

export interface LineCtx {
  path: Path;
  /** Resolved hex colour. */
  color: string;
  style: StyleSheet;
  /** Defaults merged with the field type's overrides. */
  params: Record<string, number>;
  arrows: ArrowMode;
  /** Arrow positions as fractions of the path length. */
  arrowAt: number[];
}

export interface ParamSpec {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
}

/**
 * A line style turns a centre-line into drawing primitives.
 * To add a new style, write one of these and call registerLineStyle().
 */
export interface LineStyle {
  id: string;
  label: string;
  params: ParamSpec[];
  build(ctx: LineCtx): Prim[];
}

const registry = new Map<string, LineStyle>();

export function registerLineStyle(s: LineStyle): void {
  registry.set(s.id, s);
}
export function getLineStyle(id: string): LineStyle {
  return registry.get(id) ?? registry.get('single')!;
}
export function listLineStyles(): LineStyle[] {
  return [...registry.values()];
}

export function paramsFor(style: LineStyle, overrides?: Record<string, number>): Record<string, number> {
  const p: Record<string, number> = {};
  for (const spec of style.params) p[spec.key] = spec.default;
  return { ...p, ...overrides };
}

// ---------------------------------------------------------------------------
// helpers

/** Filled arrowhead centred at arc length s, pointing along the path (dir = ±1). */
export function arrowHead(path: Path, s: number, dir: 1 | -1, color: string, st: StyleSheet): PathPrim {
  const L = st.arrowLength;
  const W = st.arrowWidth;
  const c = path.pointAt(s);
  const t = scale(path.tangentAt(s), dir);
  const n = perp(t);
  const tip = add(c, scale(t, L / 2));
  const back = sub(c, scale(t, L / 2));
  const notch = add(back, scale(t, L * 0.25));
  const outline = st.arrowOutline && st.arrowOutline !== 'none' ? resolveColor(st.arrowOutline) : undefined;
  return {
    d: [
      { op: 'M', p: tip },
      { op: 'L', p: add(back, scale(n, W / 2)) },
      { op: 'L', p: notch },
      { op: 'L', p: sub(back, scale(n, W / 2)) },
      { op: 'Z' },
    ],
    fill: outline && color === '#000000' ? resolveColor('Gray') : color,
    stroke: outline ?? color,
    width: st.lineWidth * (outline ? 0.6 : 0.3),
    join: 'miter',
  };
}

function arrows(ctx: LineCtx, path: Path, dir: 1 | -1): PathPrim[] {
  return ctx.arrowAt.map((f) => arrowHead(path, f * path.length, dir, ctx.color, ctx.style));
}

function stroke(ctx: LineCtx, d: PathPrim['d'], extra: Partial<PathPrim> = {}): PathPrim {
  return { d, stroke: ctx.color, width: ctx.style.lineWidth, cap: 'butt', join: 'round', ...extra };
}

/** Dash pattern stretched so the path starts and ends on a full dash. */
function fittedDash(L: number, dash: number, gap: number): number[] {
  const n = Math.max(1, Math.round((L + gap) / (dash + gap)));
  const f = (L + gap) / (n * (dash + gap));
  return [dash * f, gap * f];
}

// ---------------------------------------------------------------------------
// built-in styles

registerLineStyle({
  id: 'single',
  label: 'Single',
  params: [],
  build(ctx) {
    const out = [stroke(ctx, ctx.path.toCmds())];
    if (ctx.arrows !== 'none') out.push(...arrows(ctx, ctx.path, 1));
    return out;
  },
});

registerLineStyle({
  id: 'double',
  label: 'Double',
  params: [{ key: 'sep', label: 'Separation (0 = style sheet)', default: 0, min: 0, max: 20, step: 0.5 }],
  build(ctx) {
    const sep = ctx.params.sep || ctx.style.doubleSep;
    const upper = ctx.path.offset(-sep / 2);
    const lower = ctx.path.offset(sep / 2);
    const out = [stroke(ctx, upper.toCmds()), stroke(ctx, lower.toCmds())];
    if (ctx.arrows === 'forward') {
      out.push(...arrows(ctx, upper, 1), ...arrows(ctx, lower, 1));
    } else if (ctx.arrows === 'opposite') {
      out.push(...arrows(ctx, upper, 1), ...arrows(ctx, lower, -1));
    }
    return out;
  },
});

registerLineStyle({
  id: 'dashed',
  label: 'Dashed',
  params: [
    { key: 'dash', label: 'Dash length', default: 6, min: 1, max: 30, step: 0.5 },
    { key: 'gap', label: 'Gap', default: 4, min: 1, max: 30, step: 0.5 },
  ],
  build(ctx) {
    const dash = fittedDash(ctx.path.length, ctx.params.dash, ctx.params.gap);
    const out = [stroke(ctx, ctx.path.toCmds(), { dash })];
    if (ctx.arrows !== 'none') out.push(...arrows(ctx, ctx.path, 1));
    return out;
  },
});

registerLineStyle({
  id: 'dotted',
  label: 'Dotted',
  params: [{ key: 'gap', label: 'Dot spacing', default: 5, min: 2, max: 30, step: 0.5 }],
  build(ctx) {
    const L = ctx.path.length;
    const n = Math.max(1, Math.round(L / ctx.params.gap));
    const out = [stroke(ctx, ctx.path.toCmds(), { dash: [0, L / n], cap: 'round' })];
    if (ctx.arrows !== 'none') out.push(...arrows(ctx, ctx.path, 1));
    return out;
  },
});

registerLineStyle({
  id: 'wavy',
  label: 'Wavy (photon)',
  params: [
    { key: 'amplitude', label: 'Amplitude', default: 3, min: 0.5, max: 15, step: 0.5 },
    { key: 'wavelength', label: 'Wavelength', default: 10, min: 2, max: 40, step: 0.5 },
  ],
  build(ctx) {
    const L = ctx.path.length;
    const halfWaves = Math.max(2, Math.round((2 * L) / ctx.params.wavelength));
    const A = ctx.params.amplitude;
    const d = localCurve(ctx.path, (phi) => ({ u: (phi / (Math.PI * halfWaves)) * L, w: A * Math.sin(phi) }), 0, Math.PI * halfWaves, halfWaves * 8);
    const out = [stroke(ctx, d)];
    if (ctx.arrows !== 'none') out.push(...arrows(ctx, ctx.path, 1));
    return out;
  },
});

registerLineStyle({
  id: 'curly',
  label: 'Curly (gluon)',
  params: [
    { key: 'amplitude', label: 'Amplitude', default: 4.5, min: 1, max: 15, step: 0.5 },
    { key: 'windingLength', label: 'Winding length', default: 7, min: 2, max: 30, step: 0.5 },
    { key: 'aspect', label: 'Loop aspect', default: 0.9, min: 0.1, max: 3, step: 0.05 },
  ],
  build(ctx) {
    // Projected helix: u = kφ + b(cos φ − 1), w = A sin φ. Loops form where u' < 0.
    const L = ctx.path.length;
    const N = Math.max(1, Math.round(L / ctx.params.windingLength));
    const k = L / (2 * Math.PI * N);
    const A = ctx.params.amplitude;
    const b = A * ctx.params.aspect;
    const d = localCurve(ctx.path, (phi) => ({ u: k * phi + b * (Math.cos(phi) - 1), w: -A * Math.sin(phi) }), 0, 2 * Math.PI * N, N * 16);
    const out = [stroke(ctx, d)];
    if (ctx.arrows !== 'none') out.push(...arrows(ctx, ctx.path, 1));
    return out;
  },
});
