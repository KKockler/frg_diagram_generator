import { useMemo } from 'react';
import type { DEdge, FieldType, StyleSheet } from '../model/types';
import { STAMPS } from '../model/stamps';
import { LinePath, circleCmds } from '../geometry/path';
import { edgePrims } from '../render/scene';
import { listInsertionKinds } from '../styles/nodeKinds';
import { vertexPrims } from '../render/scene';
import type { VertexType } from '../model/types';
import { useEditor, type Tool } from '../store/store';
import { allTemplates, pickField, pickInsertion, pickNodeKind } from './actions';
import { PrimPath } from './PrimPath';

const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: 'select', label: 'Select', key: 'V', hint: 'Select, move, bend (drag the ◇ handle). Shift = multi-select, Alt = no snapping.' },
  { id: 'vertex', label: 'Vertex', key: 'P', hint: 'Click empty space to place, click a line to split it, click a node to change its kind.' },
  { id: 'line', label: 'Line', key: 'L', hint: 'Drag from a node or empty space to draw a propagator. Click a vertex for a self-loop. Click a line to repaint it with the active field.' },
  { id: 'insertion', label: 'Insert', key: 'R', hint: 'Click a line to put a regulator (or other insertion) on it.' },
  { id: 'text', label: 'Text', key: 'T', hint: 'Click a line or vertex to label it (moves with it), or empty space for a free TeX term such as + or −½.' },
  { id: 'region', label: 'Box', key: 'B', hint: 'Drag to draw a shaded box (or ellipse, in the inspector) behind the diagram.' },
  { id: 'stamp', label: 'Diagram', key: 'D', hint: 'Click to place a pre-built diagram. Swap its lines with the Line tool, vertices with the Vertex tool.' },
];

const W = 56;
const H = 22;

function FieldSwatch({ field, style }: { field: FieldType; style: StyleSheet }) {
  const prims = useMemo(() => {
    const e: DEdge = { id: 's', from: 'a', to: 'b', field: field.id, bend: 0, reversed: false, insertions: [] };
    return edgePrims(e, new LinePath({ x: 6, y: H }, { x: W * 2 - 6, y: H }), field, style);
  }, [field, style]);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W * 2} ${H * 2}`}>
      {prims.map((p, i) => (
        <PrimPath key={i} prim={p} />
      ))}
    </svg>
  );
}

export function NodeSwatch({ vt, style }: { vt: VertexType | null; style: StyleSheet }) {
  const prims = useMemo(() => {
    if (!vt) return [{ d: circleCmds({ x: 0, y: 0 }, 3), fill: '#fff', stroke: '#8a93a3', width: 1.2 }];
    return vertexPrims(vt, { x: 0, y: 0 }, style);
  }, [vt, style]);
  // Fit big blobs into the swatch.
  const r = vt ? Math.max(vt.scale * style.vertexRadius * 1.25, 6) + 1 : 6;
  return (
    <svg width={22} height={22} viewBox={`${-r} ${-r} ${2 * r} ${2 * r}`}>
      {prims.map((p, i) => (
        <PrimPath key={i} prim={p} />
      ))}
    </svg>
  );
}

export function Palette() {
  const doc = useEditor((s) => s.doc);
  const tool = useEditor((s) => s.tool);
  const activeField = useEditor((s) => s.activeField);
  const activeNodeKind = useEditor((s) => s.activeNodeKind);
  const activeInsertion = useEditor((s) => s.activeInsertion);
  const activeStamp = useEditor((s) => s.activeStamp);
  const set = useEditor((s) => s.set);
  useEditor((s) => s.userLibrary); // re-render when templates change
  const hint = TOOLS.find((t) => t.id === tool)?.hint;

  return (
    <aside className="palette">
      <section>
        <h3>Tools</h3>
        <div className="tools">
          {TOOLS.map((t) => (
            <button key={t.id} className={tool === t.id ? 'active' : ''} title={`${t.hint} (${t.key})`} onClick={() => set({ tool: t.id })}>
              {t.label} <kbd>{t.key}</kbd>
            </button>
          ))}
        </div>
        <p className="hint">{hint}</p>
      </section>

      <section>
        <h3>Lines</h3>
        {doc.fieldTypes.map((f) => (
          <button key={f.id} className={`row ${activeField === f.id ? 'active' : ''}`} title="Click to draw with this field, or to re-assign the selected lines" onClick={() => pickField(f.id)}>
            <FieldSwatch field={f} style={doc.style} />
            <span>{f.name}</span>
          </button>
        ))}
      </section>

      <section>
        <h3>Vertices</h3>
        {[null, ...doc.vertexTypes].map((vt) => {
          const id = vt?.id ?? 'external';
          return (
            <button key={id} className={`row ${activeNodeKind === id ? 'active' : ''}`} title="Click to place, or to change the selected nodes" onClick={() => pickNodeKind(id)}>
              <NodeSwatch vt={vt} style={doc.style} />
              <span>{vt?.name ?? 'Endpoint'}</span>
            </button>
          );
        })}
      </section>

      <section>
        <h3>Insertions</h3>
        {listInsertionKinds().map((k) => (
          <button key={k.id} className={`row ${activeInsertion === k.id ? 'active' : ''}`} title="Adds to selected lines, changes selected insertions, or picks the Insert tool" onClick={() => pickInsertion(k.id)}>
            <span>{k.label}</span>
          </button>
        ))}
      </section>

      <section>
        <h3>Diagrams</h3>
        {STAMPS.map((s) => (
          <button key={s.id} className={`row ${tool === 'stamp' && activeStamp === s.id ? 'active' : ''}`} onClick={() => set({ tool: 'stamp', activeStamp: s.id })}>
            <span>{s.label}</span>
          </button>
        ))}
        {allTemplates().length > 0 && <h4>Library</h4>}
        {allTemplates().map((t) => (
          <button key={t.id} className={`row ${tool === 'stamp' && activeStamp === 'lib:' + t.id ? 'active' : ''}`} onClick={() => set({ tool: 'stamp', activeStamp: 'lib:' + t.id })}>
            <span>{t.name}</span>
          </button>
        ))}
        <p className="hint">Built-in diagrams use the active line type. All are placed as a group.</p>
      </section>
    </aside>
  );
}
