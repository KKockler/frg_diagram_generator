import { describe, expect, it } from 'vitest';
import { arcThrough, ArcPath, LinePath, selfLoop } from './path';
import { dist } from './vec';

const close = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-6) => expect(dist(a, b)).toBeLessThan(eps);

describe('arcThrough', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 20, y: 0 };

  it('is a straight line for bend 0', () => {
    const p = arcThrough(a, b, 0);
    expect(p).toBeInstanceOf(LinePath);
    expect(p.length).toBeCloseTo(20);
  });

  it('hits both endpoints and the bulge point', () => {
    for (const bend of [-15, -10, -3, 4, 10, 25]) {
      const p = arcThrough(a, b, bend);
      close(p.pointAt(0), a);
      close(p.pointAt(p.length), b);
      // perp((1,0)) = (0,1): positive bend bulges towards +y
      close(p.pointAt(p.length / 2), { x: 10, y: bend });
    }
  });

  it('gives a semicircle for bend = chord/2', () => {
    const p = arcThrough(a, b, 10) as ArcPath;
    expect(p.r).toBeCloseTo(10);
    expect(p.length).toBeCloseTo(Math.PI * 10);
  });
});

describe('offsets', () => {
  it('shifts lines along the left normal', () => {
    const p = new LinePath({ x: 0, y: 0 }, { x: 10, y: 0 }).offset(3);
    close(p.pointAt(0), { x: 0, y: 3 });
  });

  it('keeps arcs concentric and the offset consistent with the normal', () => {
    for (const bend of [-8, 8]) {
      const p = arcThrough({ x: 0, y: 0 }, { x: 20, y: 0 }, bend);
      const q = p.offset(2);
      const s = p.length / 2;
      const expected = { x: p.pointAt(s).x - 2 * p.tangentAt(s).y, y: p.pointAt(s).y + 2 * p.tangentAt(s).x };
      close(q.pointAt(q.length / 2), expected);
    }
  });
});

describe('selfLoop', () => {
  it('starts and ends at the node and reaches 2r away', () => {
    const n = { x: 5, y: 5 };
    const p = selfLoop(n, 10, -Math.PI / 2);
    close(p.pointAt(0), n);
    close(p.pointAt(p.length), n);
    close(p.pointAt(p.length / 2), { x: 5, y: -15 });
  });
});

describe('toCmds', () => {
  it('approximates arcs with Béziers ending at the path end', () => {
    const p = arcThrough({ x: 0, y: 0 }, { x: 30, y: 0 }, -20);
    const cmds = p.toCmds();
    const last = cmds[cmds.length - 1];
    expect(last.op).toBe('C');
    if (last.op === 'C') close(last.p, p.pointAt(p.length), 1e-9);
  });

  it('reverse() swaps the endpoints', () => {
    const p = arcThrough({ x: 0, y: 0 }, { x: 30, y: 0 }, 7);
    const r = p.reverse();
    close(r.pointAt(0), p.pointAt(p.length));
    close(r.pointAt(r.length), p.pointAt(0));
  });
});
