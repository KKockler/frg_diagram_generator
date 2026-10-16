import { memo } from 'react';
import { isTex, type Prim } from '../render/primitives';
import { cmdsToD, texTransform } from '../render/svg';

/** One drawing primitive as a React SVG element. */
export const PrimPath = memo(function PrimPath({ prim: p }: { prim: Prim }) {
  if (isTex(p)) return <g transform={texTransform(p)} pointerEvents="none" dangerouslySetInnerHTML={{ __html: p.tex.inner }} />;
  return (
    <path
      d={cmdsToD(p.d)}
      fill={p.fill ?? 'none'}
      stroke={p.stroke ?? 'none'}
      strokeWidth={p.stroke ? (p.width ?? 1) : undefined}
      strokeLinecap={p.stroke ? (p.cap ?? 'butt') : undefined}
      strokeLinejoin={p.stroke ? (p.join ?? 'round') : undefined}
      strokeDasharray={p.dash?.join(' ')}
      fillOpacity={p.opacity}
      pointerEvents="none"
    />
  );
});
