import { useEffect, useRef, useState } from 'react';
import type { StyleSheet } from '../model/types';
import { NAMED_COLORS, STYLE_PRESETS, newId } from '../model/defaults';
import { listInsertionKinds } from '../styles/nodeKinds';
import { useEditor } from '../store/store';
import { alignSelection, deleteSelection, distributeSelection, flipSelection, regulatorOnEachLine, saveSelectionAsTemplate, transformSel, ungroupSelection } from './actions';

function Num({ label, value, onChange, step = 1, min, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={Math.round(value * 1000) / 1000}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
      />
    </label>
  );
}

const STYLE_KEYS: [keyof StyleSheet, string][] = [
  ['lineWidth', 'Line width'],
  ['doubleSep', 'Double-line spacing'],
  ['arrowLength', 'Arrow length'],
  ['arrowWidth', 'Arrow width'],
  ['vertexRadius', 'Vertex radius'],
  ['regulatorRadius', 'Regulator ⊗ radius'],
  ['loopRadius', 'Loop radius (diagrams)'],
  ['legLength', 'Leg length (diagrams)'],
  ['fontSize', 'Label size'],
  ['termSize', 'Equation term size'],
  ['rowGap', 'Row gap'],
  ['gridSize', 'Grid'],
];

function ColorSelect({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <label className="field">
      <span>Colour</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.keys(NAMED_COLORS).map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </label>
  );
}

function LabelPanel({ id }: { id: string }) {
  const doc = useEditor((s) => s.doc);
  const apply = useEditor((s) => s.apply);
  const focusLabel = useEditor((s) => s.focusLabel);
  const ref = useRef<HTMLTextAreaElement>(null);
  const l = doc.diagram.labels.find((x) => x.id === id)!;
  useEffect(() => {
    if (focusLabel && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [focusLabel, id]);
  const upd = (f: (x: typeof l) => void) =>
    apply((d) => {
      const x = d.diagram.labels.find((y) => y.id === id);
      if (x) f(x);
    });
  return (
    <aside className="inspector">
      <h3>Label</h3>
      <label className="stack">
        <span>TeX (math mode)</span>
        <textarea
          ref={ref}
          rows={2}
          value={l.tex}
          spellCheck={false}
          onChange={(e) => upd((x) => void (x.tex = e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
        />
      </label>
      <p className="hint">e.g. <code>\partial_t\Gamma^{'{(2)}'}_\pi \propto</code>, <code>-\frac12</code>, <code>+</code>. Enter to finish.</p>
      <Num label="Size" value={l.size ?? (l.attach ? doc.style.fontSize : doc.style.termSize)} step={1} min={2} onChange={(v) => upd((x) => void (x.size = v))} />
      <ColorSelect value={l.color ?? 'Black'} onChange={(c) => upd((x) => void (x.color = c))} />
      <p className="hint">{l.attach ? `Attached to a ${'node' in l.attach ? 'vertex' : 'line'}: moves with it.` : 'Free label.'}</p>
      {l.attach && (
        <button
          onClick={() =>
            apply((d) => {
              // Detach in place: keep the current position as a free position.
              const x = d.diagram.labels.find((y) => y.id === id)!;
              const n = 'node' in x.attach! ? d.diagram.nodes.find((q) => q.id === (x.attach as { node: string }).node) : undefined;
              if (n) {
                x.x += n.x;
                x.y += n.y;
              }
              x.attach = undefined;
            })
          }
        >
          Detach
        </button>
      )}
      <hr />
      <button className="danger" onClick={deleteSelection}>Delete label</button>
    </aside>
  );
}

function ArrangeTools({ many }: { many: boolean }) {
  const deg = Math.PI / 180;
  return (
    <>
      <h3>Arrange</h3>
      {many && (
        <>
          <div className="tool-grid">
            <button title="Align left edges" onClick={() => alignSelection('left')}>⇤ left</button>
            <button title="Align horizontal centres" onClick={() => alignSelection('hcenter')}>↔ centre</button>
            <button title="Align right edges" onClick={() => alignSelection('right')}>right ⇥</button>
            <button title="Align top edges" onClick={() => alignSelection('top')}>⤒ top</button>
            <button title="Align vertical centres" onClick={() => alignSelection('vcenter')}>↕ middle</button>
            <button title="Align bottom edges" onClick={() => alignSelection('bottom')}>⤓ bottom</button>
          </div>
          <div className="tool-grid two">
            <button title="Equal horizontal gaps (3+ items)" onClick={() => distributeSelection('x')}>Distribute ↔</button>
            <button title="Equal vertical gaps (3+ items)" onClick={() => distributeSelection('y')}>Distribute ↕</button>
          </div>
        </>
      )}
      <div className="tool-grid">
        <button title="Rotate 90° anticlockwise (Shift+[)" onClick={() => transformSel({ kind: 'rotate', angle: -90 * deg })}>⟲ 90°</button>
        <button title="Rotate 15° anticlockwise ([)" onClick={() => transformSel({ kind: 'rotate', angle: -15 * deg })}>⟲ 15°</button>
        <button title="Rotate 15° clockwise (])" onClick={() => transformSel({ kind: 'rotate', angle: 15 * deg })}>⟳ 15°</button>
        <button title="Rotate 90° clockwise (Shift+])" onClick={() => transformSel({ kind: 'rotate', angle: 90 * deg })}>⟳ 90°</button>
        <button title="Mirror left–right" onClick={() => transformSel({ kind: 'mirror', axis: 'x' })}>Mirror ↔</button>
        <button title="Mirror top–bottom" onClick={() => transformSel({ kind: 'mirror', axis: 'y' })}>Mirror ↕</button>
      </div>
    </>
  );
}

function RegionPanel({ id }: { id: string }) {
  const doc = useEditor((s) => s.doc);
  const apply = useEditor((s) => s.apply);
  const r = doc.diagram.regions.find((x) => x.id === id)!;
  const upd = (f: (x: typeof r) => void) =>
    apply((d) => {
      const x = d.diagram.regions.find((y) => y.id === id);
      if (x) f(x);
    });
  const colours = Object.keys(NAMED_COLORS);
  return (
    <aside className="inspector">
      <h3>Region</h3>
      <label className="field">
        <span>Shape</span>
        <select value={r.shape} onChange={(e) => upd((x) => void (x.shape = e.target.value as typeof r.shape))}>
          <option value="rect">Box</option>
          <option value="ellipse">Ellipse</option>
        </select>
      </label>
      <label className="field">
        <span>Fill</span>
        <select value={r.fill} onChange={(e) => upd((x) => void (x.fill = e.target.value))}>
          <option value="none">none</option>
          {colours.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Opacity</span>
        <input type="range" min={0.05} max={1} step={0.05} value={r.opacity} onChange={(e) => upd((x) => void (x.opacity = parseFloat(e.target.value)))} />
      </label>
      <label className="field">
        <span>Outline</span>
        <select value={r.stroke} onChange={(e) => upd((x) => void (x.stroke = e.target.value))}>
          <option value="none">none</option>
          {colours.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={r.dashed} onChange={() => upd((x) => void (x.dashed = !x.dashed))} /> Dashed outline
      </label>
      {r.shape === 'rect' && <Num label="Corner radius" value={r.radius} min={0} onChange={(v) => upd((x) => void (x.radius = v))} />}
      <Num label="Width" value={r.w} min={4} onChange={(v) => upd((x) => void (x.w = v))} />
      <Num label="Height" value={r.h} min={4} onChange={(v) => upd((x) => void (x.h = v))} />
      <p className="hint">Drag the corner handle to resize. Regions are drawn behind lines and vertices.</p>
      <hr />
      <button className="danger" onClick={deleteSelection}>Delete region</button>
    </aside>
  );
}

function SaveTemplate({ defaultName }: { defaultName: string }) {
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  return (
    <>
      <h3>Template</h3>
      <div className="ins-row">
        <input type="text" placeholder={defaultName} value={name} onChange={(e) => (setName(e.target.value), setSaved(false))} aria-label="Template name" />
        <button
          onClick={() => {
            saveSelectionAsTemplate(name || defaultName);
            setSaved(true);
          }}
        >
          Save as template
        </button>
      </div>
      {saved && <p className="hint">Saved to My library: it is now listed under Diagrams.</p>}
    </>
  );
}

export function Inspector() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const apply = useEditor((s) => s.apply);
  const set = useEditor((s) => s.set);
  const exportScale = useEditor((s) => s.exportScale);
  const exportMargin = useEditor((s) => s.exportMargin);
  const ids = new Set(selection);
  const D = doc.diagram;
  const nodes = D.nodes.filter((n) => ids.has(n.id));
  const edges = D.edges.filter((e) => ids.has(e.id));
  const labels = D.labels.filter((l) => ids.has(l.id));
  const insertions = D.edges.flatMap((e) => e.insertions.filter((i) => ids.has(i.id)).map((i) => ({ e, i })));
  const group = D.groups.find((g) => g.members.length === selection.length && g.members.every((m) => ids.has(m)));

  if (!selection.length) {
    return (
      <aside className="inspector">
        <h3>Style sheet</h3>
        <p className="hint">Shared by all diagrams in this document, so they stay consistent.</p>
        <label className="field">
          <span>Preset</span>
          <select
            value=""
            onChange={(e) => {
              const p = STYLE_PRESETS.find((x) => x.name === e.target.value);
              if (p) apply((d) => void (d.style = { ...p }));
            }}
          >
            <option value="">{doc.style.name} …</option>
            {STYLE_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Colours</span>
          <select value={doc.style.colorMode ?? 'color'} onChange={(e) => apply((d) => void (d.style.colorMode = e.target.value as StyleSheet['colorMode']))}>
            <option value="color">colour</option>
            <option value="grayscale">grayscale</option>
            <option value="black">black &amp; white</option>
          </select>
        </label>
        {STYLE_KEYS.map(([k, label]) => (
          <Num key={k} label={label} value={doc.style[k] as number} step={0.5} min={0} onChange={(v) => apply((d) => void ((d.style[k] as number) = v))} />
        ))}
        <h3>Export</h3>
        <Num label="Scale" value={exportScale} step={0.1} min={0.05} onChange={(v) => set({ exportScale: v })} />
        <Num label="Margin (pt)" value={exportMargin} step={1} min={0} onChange={(v) => set({ exportMargin: v })} />
        <h3>Shortcuts</h3>
        <ul className="shortcuts">
          <li><kbd>V</kbd> <kbd>L</kbd> <kbd>P</kbd> <kbd>R</kbd> <kbd>T</kbd> <kbd>B</kbd> <kbd>D</kbd> tools</li>
          <li><kbd>A</kbd> arrange selection as a row</li>
          <li><kbd>[</kbd> <kbd>]</kbd> rotate 15° (<kbd>Shift</kbd>: 90°)</li>
          <li><kbd>Ctrl</kbd>+<kbd>G</kbd> group · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> ungroup</li>
          <li>Double-click: pick one element inside a group</li>
          <li><kbd>Del</kbd> delete · <kbd>F</kbd> flip arrows</li>
          <li><kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate · <kbd>Ctrl</kbd>+<kbd>A</kbd> all</li>
          <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> undo / redo</li>
          <li>Arrow keys nudge · <kbd>Alt</kbd> disables snapping</li>
          <li>Wheel zoom · <kbd>0</kbd> zoom to fit · <kbd>Space</kbd>/middle-drag pan</li>
          <li>Drop an endpoint onto a vertex to connect it</li>
        </ul>
      </aside>
    );
  }

  if (labels.length === 1 && selection.length === 1) return <LabelPanel id={labels[0].id} />;
  const regions = D.regions.filter((r) => ids.has(r.id));
  if (regions.length === 1 && selection.length === 1) return <RegionPanel id={regions[0].id} />;

  if (insertions.length === 1 && selection.length === 1) {
    const { e, i } = insertions[0];
    const upd = (f: (ins: (typeof e.insertions)[number]) => void) =>
      apply((d) => {
        const ins = d.diagram.edges.find((x) => x.id === e.id)?.insertions.find((x) => x.id === i.id);
        if (ins) f(ins);
      });
    return (
      <aside className="inspector">
        <h3>Insertion</h3>
        <label className="field">
          <span>Kind</span>
          <select value={i.kind} onChange={(ev) => upd((ins) => void (ins.kind = ev.target.value))}>
            {listInsertionKinds().map((k) => (
              <option key={k.id} value={k.id}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Position along line</span>
          <input type="range" min={0.02} max={0.98} step={0.01} value={i.t} onChange={(ev) => upd((ins) => void (ins.t = parseFloat(ev.target.value)))} />
        </label>
        <p className="hint">Drag it onto another line to move it there.</p>
        <button onClick={deleteSelection}>Remove insertion</button>
      </aside>
    );
  }

  if (edges.length === 1 && selection.length === 1) {
    const e = edges[0];
    const upd = (f: (x: typeof e) => void) =>
      apply((d) => {
        const x = d.diagram.edges.find((y) => y.id === e.id);
        if (x) f(x);
      });
    return (
      <aside className="inspector">
        <h3>Propagator</h3>
        <label className="field">
          <span>Field</span>
          <select value={e.field} onChange={(ev) => upd((x) => void (x.field = ev.target.value))}>
            {doc.fieldTypes.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={e.reversed} onChange={() => flipSelection()} /> Reverse direction <kbd>F</kbd>
        </label>
        {e.loop ? (
          <>
            <Num label="Loop radius" value={e.loop.radius} min={3} onChange={(v) => upd((x) => void (x.loop!.radius = v))} />
            <Num label="Loop angle (°)" value={(e.loop.angle * 180) / Math.PI} step={15} onChange={(v) => upd((x) => void (x.loop!.angle = (v * Math.PI) / 180))} />
          </>
        ) : (
          <>
            <Num label="Bend" value={e.bend} onChange={(v) => upd((x) => void (x.bend = v))} />
            <button onClick={() => upd((x) => void (x.bend = 0))}>Straighten</button>
          </>
        )}
        <h3>Insertions</h3>
        {e.insertions.length === 0 && <p className="hint">None.</p>}
        {e.insertions.map((i) => (
          <div key={i.id} className="ins-row">
            <select value={i.kind} onChange={(ev) => upd((x) => void (x.insertions.find((y) => y.id === i.id)!.kind = ev.target.value))}>
              {listInsertionKinds().map((k) => (
                <option key={k.id} value={k.id}>{k.label}</option>
              ))}
            </select>
            <input type="range" min={0.02} max={0.98} step={0.01} value={i.t} onChange={(ev) => upd((x) => void (x.insertions.find((y) => y.id === i.id)!.t = parseFloat(ev.target.value)))} />
            <button title="Remove" onClick={() => upd((x) => void (x.insertions = x.insertions.filter((y) => y.id !== i.id)))}>×</button>
          </div>
        ))}
        <button onClick={() => upd((x) => void x.insertions.push({ id: newId('i'), kind: 'regulator', t: 0.5 }))}>+ Regulator ⊗</button>
        <h3>Momentum</h3>
        <label className="check">
          <input type="checkbox" checked={!!e.momentum} onChange={() => upd((x) => void (x.momentum = x.momentum ? undefined : { tex: 'p', side: -1, reversed: false }))} /> Momentum arrow
        </label>
        {e.momentum && (
          <>
            <label className="field">
              <span>Label (TeX)</span>
              <input type="text" value={e.momentum.tex} spellCheck={false} onChange={(ev) => upd((x) => void (x.momentum!.tex = ev.target.value))} />
            </label>
            <div className="ins-row">
              <button onClick={() => upd((x) => void (x.momentum!.side = x.momentum!.side === 1 ? -1 : 1))}>Other side</button>
              <button onClick={() => upd((x) => void (x.momentum!.reversed = !x.momentum!.reversed))}>Flip arrow</button>
            </div>
          </>
        )}
        <hr />
        <button className="danger" onClick={deleteSelection}>Delete line</button>
      </aside>
    );
  }

  if (nodes.length === 1 && selection.length === 1) {
    const n = nodes[0];
    const upd = (f: (x: typeof n) => void) =>
      apply((d) => {
        const x = d.diagram.nodes.find((y) => y.id === n.id);
        if (x) f(x);
      });
    return (
      <aside className="inspector">
        <h3>Node</h3>
        <label className="field">
          <span>Kind</span>
          <select value={n.kind} onChange={(ev) => upd((x) => void (x.kind = ev.target.value))}>
            <option value="external">Endpoint</option>
            {doc.vertexTypes.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </label>
        <Num label="x" value={n.x} onChange={(v) => upd((x) => void (x.x = v))} />
        <Num label="y" value={n.y} onChange={(v) => upd((x) => void (x.y = v))} />
        <hr />
        <button className="danger" onClick={deleteSelection}>Delete node</button>
      </aside>
    );
  }

  const hasRegulatorTarget = edges.length > 0;
  return (
    <aside className="inspector">
      <h3>{group ? group.name : 'Selection'}</h3>
      <p>
        {nodes.filter((n) => n.kind !== 'external').length} vertices, {edges.length} line(s)
        {labels.length ? `, ${labels.length} label(s)` : ''}
      </p>
      {group ? (
        <p className="hint">
          A pre-built or grouped diagram: it moves as one unit and its geometry stays fixed. Swap parts with the drawing tools: <b>Line</b> tool + click a line, <b>Vertex</b> tool + click a vertex, drag ⊗ to another line. Double-click to pick a single element.
        </p>
      ) : (
        <p className="hint">Click a line type in the palette to re-assign all selected lines; click a vertex type to change all selected nodes.</p>
      )}
      {hasRegulatorTarget && (
        <button onClick={regulatorOnEachLine} title="Make copies with the regulator on each internal line in turn, joined by +">
          ⊗ on each line → sum
        </button>
      )}
      {edges.length > 0 && <button onClick={flipSelection}>Reverse selected lines</button>}
      {group && <button onClick={ungroupSelection}>Ungroup (edit geometry)</button>}
      <ArrangeTools many={!group} />
      <SaveTemplate defaultName={group?.name ?? 'My diagram'} />
      <hr />
      <button className="danger" onClick={deleteSelection}>Delete selection</button>
    </aside>
  );
}
