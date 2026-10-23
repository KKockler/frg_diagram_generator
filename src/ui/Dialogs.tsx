import { useMemo, useState, type ReactNode } from 'react';
import type { ArrowMode, DEdge, FieldType, VertexType } from '../model/types';
import { NAMED_COLORS, newId, resolveColor } from '../model/defaults';
import { GROUP_LIBRARY, missingFields, missingVertexTypes } from '../model/library';
import { LinePath } from '../geometry/path';
import { edgePrims } from '../render/scene';
import { getLineStyle, listLineStyles } from '../styles/lineStyles';
import { listVertexShapes } from '../styles/nodeKinds';
import { NodeSwatch } from './Palette';
import { useEditor } from '../store/store';
import { addFieldsToDocument, deleteTemplate, exportLibrary, importLibrary } from './actions';
import { PrimPath } from './PrimPath';
import { EXAMPLES } from '../model/examples';
import funkitPin from '../../funkit.json';

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Swatch({ field, width = 90 }: { field: FieldType; width?: number }) {
  const style = useEditor((s) => s.doc.style);
  const prims = useMemo(() => {
    const e: DEdge = { id: 's', from: 'a', to: 'b', field: field.id, bend: 0, reversed: false, insertions: [] };
    return edgePrims(e, new LinePath({ x: 6, y: 16 }, { x: width * 1.4 - 6, y: 16 }), field, style);
  }, [field, style, width]);
  return (
    <svg width={width} height={22} viewBox={`0 0 ${width * 1.4} 32`}>
      {prims.map((p, i) => (
        <PrimPath key={i} prim={p} />
      ))}
    </svg>
  );
}

const ARROWS: [ArrowMode, string][] = [
  ['none', 'none'],
  ['forward', 'along the line'],
  ['opposite', 'opposite (double lines)'],
];

function FieldRow({ f, used }: { f: FieldType; used: number }) {
  const apply = useEditor((s) => s.apply);
  const upd = (fn: (x: FieldType) => void) =>
    apply((d) => {
      const x = d.fieldTypes.find((y) => y.id === f.id);
      if (x) fn(x);
    });
  const ls = getLineStyle(f.line);
  const named = f.color in NAMED_COLORS;
  return (
    <div className="field-card">
      <div className="field-card-head">
        <Swatch field={f} />
        <input className="name" value={f.name} onChange={(e) => upd((x) => void (x.name = e.target.value))} aria-label="Name" />
        <span className="hint">{used ? `${used} line(s)` : 'unused'}</span>
        <button
          className="danger"
          title="Delete this field type"
          onClick={() => {
            if (used && !confirm(`${used} line(s) use "${f.name}". Delete anyway? They will be drawn grey.`)) return;
            apply((d) => void (d.fieldTypes = d.fieldTypes.filter((x) => x.id !== f.id)));
          }}
        >
          Delete
        </button>
      </div>
      <div className="field-grid">
        <label>
          Symbol (TeX)
          <input value={f.tex} spellCheck={false} onChange={(e) => upd((x) => void (x.tex = e.target.value))} />
        </label>
        <label>
          Line
          <select
            value={f.line}
            onChange={(e) =>
              upd((x) => {
                x.line = e.target.value;
                x.params = undefined;
              })
            }
          >
            {listLineStyles().map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <label>
          Arrows
          <select value={f.arrows} onChange={(e) => upd((x) => void (x.arrows = e.target.value as ArrowMode))}>
            {ARROWS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label>
          Colour
          <span className="color-pick">
            <select value={named ? f.color : '__custom'} onChange={(e) => upd((x) => void (x.color = e.target.value === '__custom' ? resolveColor(x.color) : e.target.value))}>
              {Object.keys(NAMED_COLORS).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="__custom">Custom…</option>
            </select>
            <input type="color" value={resolveColor(f.color)} onChange={(e) => upd((x) => void (x.color = e.target.value))} aria-label="Custom colour" />
          </span>
        </label>
        {ls.params.map((p) => (
          <label key={p.key}>
            {p.label}
            <input
              type="number"
              step={p.step}
              min={p.min}
              max={p.max}
              value={f.params?.[p.key] ?? p.default}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) upd((x) => void (x.params = { ...x.params, [p.key]: v }));
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

/** Colour picker with named colours, a custom colour and optional special values ("style", "none"). */
function ColorField({ label, value, special, onChange }: { label: string; value: string; special: [string, string][]; onChange: (c: string) => void }) {
  const isSpecial = special.some(([v]) => v === value);
  const named = value in NAMED_COLORS;
  return (
    <label>
      {label}
      <span className="color-pick">
        <select value={isSpecial || named ? value : '__custom'} onChange={(e) => onChange(e.target.value === '__custom' ? resolveColor(named ? value : '#000000') : e.target.value)}>
          {special.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
          {Object.keys(NAMED_COLORS).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          <option value="__custom">Custom…</option>
        </select>
        {!isSpecial && <input type="color" value={resolveColor(value)} onChange={(e) => onChange(e.target.value)} aria-label={`Custom ${label}`} />}
      </span>
    </label>
  );
}

function VertexRow({ v, used }: { v: VertexType; used: number }) {
  const apply = useEditor((s) => s.apply);
  const style = useEditor((s) => s.doc.style);
  const upd = (fn: (x: VertexType) => void) =>
    apply((d) => {
      const x = d.vertexTypes.find((y) => y.id === v.id);
      if (x) fn(x);
    });
  const num = (label: string, value: number, step: number, fn: (x: VertexType, n: number) => void) => (
    <label>
      {label}
      <input
        type="number"
        step={step}
        min={0}
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) upd((x) => fn(x, n));
        }}
      />
    </label>
  );
  return (
    <div className="field-card">
      <div className="field-card-head">
        <NodeSwatch vt={v} style={style} />
        <input className="name" value={v.name} onChange={(e) => upd((x) => void (x.name = e.target.value))} aria-label="Name" />
        <span className="hint">{used ? `${used} vertex/vertices` : 'unused'}</span>
        <button
          className="danger"
          onClick={() => {
            if (used && !confirm(`${used} vertices use "${v.name}". Delete anyway? They will be drawn grey.`)) return;
            apply((d) => void (d.vertexTypes = d.vertexTypes.filter((x) => x.id !== v.id)));
          }}
        >
          Delete
        </button>
      </div>
      <div className="field-grid">
        <label>
          Shape
          <select value={v.shape} onChange={(e) => upd((x) => void (x.shape = e.target.value))}>
            {listVertexShapes().map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        {num('Size (× vertex radius)', v.scale, 0.1, (x, n) => void (x.scale = n))}
        <ColorField label="Fill" value={v.fill} special={[['style', 'Style sheet colour'], ['none', 'None (hollow)']]} onChange={(c) => upd((x) => void (x.fill = c))} />
        <ColorField label="Outline" value={v.stroke} special={[['none', 'None']]} onChange={(c) => upd((x) => void (x.stroke = c))} />
        {num('Outline width (× line width)', v.strokeWidth, 0.1, (x, n) => void (x.strokeWidth = n))}
        <label>
          Text inside (TeX)
          <input value={v.tex ?? ''} spellCheck={false} placeholder="e.g. n" onChange={(e) => upd((x) => void (x.tex = e.target.value || undefined))} />
        </label>
      </div>
    </div>
  );
}

export function TypesEditor() {
  const doc = useEditor((s) => s.doc);
  const apply = useEditor((s) => s.apply);
  const set = useEditor((s) => s.set);
  const [tab, setTab] = useState<'lines' | 'vertices'>('lines');
  const usage = new Map<string, number>();
  for (const e of doc.diagram.edges) usage.set(e.field, (usage.get(e.field) ?? 0) + 1);
  for (const n of doc.diagram.nodes) usage.set('v:' + n.kind, (usage.get('v:' + n.kind) ?? 0) + 1);
  return (
    <Modal title="Lines & vertices in this document" onClose={() => set({ dialog: null })}>
      <div className="tabs">
        <button className={tab === 'lines' ? 'active' : ''} onClick={() => setTab('lines')}>Lines (fields)</button>
        <button className={tab === 'vertices' ? 'active' : ''} onClick={() => setTab('vertices')}>Vertices</button>
      </div>
      <p className="hint">
        Changes apply to everything of that type. Types are saved with the document; share them via <b>Library… → Export my library</b>.
      </p>
      {tab === 'lines' ? (
        <>
          {doc.fieldTypes.map((f) => (
            <FieldRow key={f.id} f={f} used={usage.get(f.id) ?? 0} />
          ))}
          <button
            className="primary"
            onClick={() => apply((d) => void d.fieldTypes.push({ id: newId('f'), name: 'New field', tex: '\\phi', line: 'single', color: 'Black', arrows: 'none' }))}
          >
            + Add field type
          </button>
        </>
      ) : (
        <>
          {doc.vertexTypes.map((v) => (
            <VertexRow key={v.id} v={v} used={usage.get('v:' + v.id) ?? 0} />
          ))}
          <button
            className="primary"
            onClick={() => apply((d) => void d.vertexTypes.push({ id: newId('v'), name: 'New vertex', shape: 'circle', scale: 1, fill: 'style', stroke: 'Black', strokeWidth: 0.6 }))}
          >
            + Add vertex type
          </button>
        </>
      )}
    </Modal>
  );
}

export function LibraryDialog() {
  const doc = useEditor((s) => s.doc);
  const userLibrary = useEditor((s) => s.userLibrary);
  const set = useEditor((s) => s.set);
  const [, force] = useState(0);
  const groupMissing = missingFields(doc, GROUP_LIBRARY.fields);
  const userMissing = missingFields(doc, userLibrary.fields);
  const fieldList = (fields: FieldType[], missing: FieldType[]) => (
    <ul className="lib-list">
      {fields.map((f) => (
        <li key={f.id}>
          <Swatch field={f} width={60} />
          <span>{f.name}</span>
          {missing.includes(f) ? <button onClick={() => (addFieldsToDocument([f]), force((x) => x + 1))}>Add to document</button> : <span className="hint">in document</span>}
        </li>
      ))}
    </ul>
  );
  return (
    <Modal title="Libraries" onClose={() => set({ dialog: null })}>
      <section>
        <h3>Examples</h3>
        <p className="hint">Built from the pre-built diagrams; open one to see how a figure is put together. (Undo brings your drawing back.)</p>
        <ul className="lib-list">
          {EXAMPLES.map((ex) => (
            <li key={ex.id}>
              <span>{ex.name}</span>
              <button
                onClick={() => {
                  useEditor.getState().load(ex.build());
                  set({ dialog: null });
                }}
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>{GROUP_LIBRARY.name} (ships with the app)</h3>
        <p className="hint">Maintained in the repository under <code>library/group.frglib.json</code>; extend it with a merge request.</p>
        {GROUP_LIBRARY.fields.length ? fieldList(GROUP_LIBRARY.fields, groupMissing) : <p className="hint">No field types.</p>}
        {(groupMissing.length > 1 || missingVertexTypes(doc, GROUP_LIBRARY.vertexTypes).length > 0) && (
          <button onClick={() => addFieldsToDocument(groupMissing, GROUP_LIBRARY.vertexTypes)}>Add all to document</button>
        )}
        {GROUP_LIBRARY.vertexTypes.length > 0 && (
          <ul className="lib-list">
            {GROUP_LIBRARY.vertexTypes.map((v) => (
              <li key={v.id}>
                <NodeSwatch vt={v} style={doc.style} />
                <span>{v.name}</span>
                {missingVertexTypes(doc, [v]).length ? <button onClick={() => addFieldsToDocument([], [v])}>Add to document</button> : <span className="hint">in document</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="hint">{GROUP_LIBRARY.templates.length} template(s), listed under Diagrams in the palette.</p>
      </section>
      <section>
        <h3>My library (this browser)</h3>
        <p className="hint">Save diagrams with <b>Save as template</b> (select a diagram first). Export the library to back it up or share it.</p>
        {userLibrary.templates.length === 0 && <p className="hint">No templates yet.</p>}
        <ul className="lib-list">
          {userLibrary.templates.map((t) => (
            <li key={t.id}>
              <span>{t.name}</span>
              <button className="danger" onClick={() => deleteTemplate(t.id)}>Delete</button>
            </li>
          ))}
        </ul>
        {userLibrary.fields.length > 0 && fieldList(userLibrary.fields, userMissing)}
        <div className="row-buttons">
          <button onClick={importLibrary}>Import library…</button>
          <button onClick={exportLibrary}>Export my library</button>
        </div>
      </section>
    </Modal>
  );
}

export function AboutDialog() {
  const set = useEditor((s) => s.set);
  return (
    <Modal title="About" onClose={() => set({ dialog: null })}>
      <section className="about">
        <p>
          A browser editor for the diagrams in fRG papers. The <code>frg</code> command (<a href="frg.mjs">frg.mjs</a>, Node ≥ 20) builds figures from JSON
          specs, and <code>frg flow</code> draws whole flow equations. Instructions for the command line and for AI assistants:{' '}
          <a href="llms.txt">llms.txt</a>.
        </p>
        <h3>How this was made</h3>
        <p>
          Developed with <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer">Claude Code</a>, Anthropic&apos;s AI coding assistant,
          which wrote most of the code and documentation. Konrad Kockler specified the requirements and fRG conventions, reviewed and tested the
          output, and maintains the project.
        </p>
        <h3>Credits</h3>
        <p>
          The flow equations of <code>frg flow</code> are derived by{' '}
          <a href="https://github.com/satfra/FunKit" target="_blank" rel="noreferrer">
            FunKit
          </a>
          , a computer algebra toolkit for functional approaches by <strong>Franz R. Sattler</strong> (Universität Bielefeld), used with his
          permission. Its C++ engine takes the functional derivatives of the Wetterich equation, expands them over the fields and finds the distinct
          diagrams with their prefactors; this tool only draws the result. If you use the generated flow equations in your work, please cite FunKit:
        </p>
        <blockquote>
          F. R. Sattler, <em>FunKit: A computer algebra toolkit for functional approaches</em>,{' '}
          <a href="https://arxiv.org/abs/2605.28935" target="_blank" rel="noreferrer">
            arXiv:2605.28935
          </a>{' '}
          (2026).
        </blockquote>
        <p className="hint">
          FunKit is licensed under the GPL-3.0-or-later. The editor&apos;s <strong>Flow…</strong> runs it as WebAssembly (funkit.wasm), compiled
          from{' '}
          <a href={`${funkitPin.repository}/tree/${funkitPin.commit}`} target="_blank" rel="noreferrer">
            commit {funkitPin.commit.slice(0, 7)}
          </a>{' '}
          of its source by <code>scripts/build-funkit-wasm.sh</code>.
        </p>
      </section>
    </Modal>
  );
}
