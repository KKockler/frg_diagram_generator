// "Flow…": the full one-loop flow of an n-point function. The checked line types are the fields,
// the legs are picked from them; FunKit (WebAssembly, in a Web Worker) computes the terms and the
// result is drawn as a figure spec and added to the drawing.
import { useEffect, useState } from 'react';
import { flowToSpec, validateFlow, type FlowSpec } from '../flow/flow';
import { defaultChoice, fieldNames, flowToForm, formToFlow, type FlowForm } from '../flow/form';
import { funkitAvailable, runFlow } from '../flow/browser';
import { SpecError, specToDocument, validateSpec } from '../spec/spec';
import type { FieldType } from '../model/types';
import { useEditor } from '../store/store';
import { insertFigure } from './actions';
import { Modal, Swatch } from './Dialogs';

const PRESETS = Object.entries(import.meta.glob<FlowSpec>('../../examples/*.flow.json', { eager: true, import: 'default' })).map(([path, flow]) => ({
  name: path.replace(/^.*\//, '').replace('.flow.json', ''),
  flow,
}));
const PRESET_NAMES: Record<string, string> = {
  qm_pion: 'Quark-meson model: pion 2-point function',
  qm_yukawa: 'Quark-meson model: q̄qπ vertex',
  phi4_4pt: 'Scalar: 4-point function',
};

// The last form is remembered in this browser only, as a convenience.
const KEY = 'frg-flow-form-v2';
function loadForm(): FlowForm {
  try {
    const f = JSON.parse(localStorage.getItem(KEY) ?? 'null') as FlowForm | null;
    if (f && typeof f.fields === 'object' && Array.isArray(f.legs)) return f;
  } catch {
    /* storage unavailable or old format: start from the first example */
  }
  return flowToForm(PRESETS.find((p) => p.name === 'qm_pion')?.flow ?? PRESETS[0].flow);
}

/** Label of a leg: the field's name, or its antifield's. */
const legName = (t: FieldType, anti: boolean) => (anti ? `anti-${t.name}` : t.name);

export function FlowDialog() {
  const set = useEditor((s) => s.set);
  const allTypes = useEditor((s) => s.doc.fieldTypes);
  const lineTypes = allTypes.filter((f) => f.id !== 'aux');
  const [form, setForm] = useState<FlowForm>(loadForm);
  const [problems, setProblems] = useState<string[]>([]);
  const [running, setRunning] = useState<null | (() => void)>(null);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    funkitAvailable().then(setAvailable);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(form));
    } catch {
      /* storage unavailable */
    }
  }, [form]);

  const update = (p: Partial<FlowForm>) => setForm((f) => ({ ...f, ...p }));
  const checked = lineTypes.filter((t) => form.fields[t.id]);
  const names = fieldNames(checked.map((t) => t.id));

  /** Check or uncheck a line type; legs of unchecked fields (or of a vanished antifield) go too. */
  function toggle(id: string, on: boolean) {
    const fields = { ...form.fields };
    if (on) fields[id] = defaultChoice(id);
    else delete fields[id];
    update({ fields, legs: form.legs.filter((l) => l.line !== id || on) });
  }
  function setChoice(id: string, p: Partial<FlowForm['fields'][string]>) {
    const c = { ...form.fields[id], ...p };
    if (!c.complex) c.grassmann = false;
    update({ fields: { ...form.fields, [id]: c }, legs: form.legs.filter((l) => l.line !== id || !l.anti || c.complex) });
  }

  async function compute() {
    let flow: FlowSpec;
    try {
      flow = validateFlow(formToFlow(form, allTypes));
    } catch (e) {
      setProblems(e instanceof SpecError ? e.problems : [(e as Error).message]);
      return;
    }
    setProblems([]);
    const run = runFlow(flow);
    setRunning(() => run.cancel);
    try {
      const out = await run.result;
      // Drawn in the document's own style; its line and vertex types are kept.
      const spec = flowToSpec(flow, out);
      spec.style = { ...useEditor.getState().doc.style };
      insertFigure(specToDocument(validateSpec(spec)));
      set({ dialog: null });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg !== 'cancelled') setProblems(e instanceof SpecError ? e.problems : [msg]);
    } finally {
      setRunning(null);
    }
  }

  const missing = (form.legs.length === 0 && 'Add at least one external leg.') || (checked.length === 0 && 'Check at least one field.') || '';

  return (
    <Modal
      title="Flow equation"
      onClose={() => {
        running?.();
        set({ dialog: null });
      }}
    >
      <p className="hint">
        The full one-loop flow ∂ₜΓ⁽ⁿ⁾ with all diagrams and prefactors, computed from the Wetterich equation by{' '}
        <a href="https://github.com/satfra/FunKit" target="_blank" rel="noreferrer">
          FunKit
        </a>{' '}
        (F. R. Sattler). It is added below your drawing.
      </p>
      {available === false && (
        <p className="flow-problems">
          This build has no FunKit (dist-wasm/funkit.wasm). Run <code>scripts/build-funkit-wasm.sh</code> and reload.
        </p>
      )}
      <label className="flow-row">
        Example
        <select value="" onChange={(e) => e.target.value && (setForm(flowToForm(PRESETS.find((p) => p.name === e.target.value)!.flow)), setProblems([]))}>
          <option value="">Load an example…</option>
          {PRESETS.map((p) => (
            <option key={p.name} value={p.name}>
              {PRESET_NAMES[p.name] ?? p.name}
            </option>
          ))}
        </select>
      </label>

      <h3>Field content</h3>
      <ul className="flow-checklist">
        {lineTypes.map((t) => {
          const c = form.fields[t.id];
          return (
            <li key={t.id} className={c ? 'on' : ''}>
              <label className="flow-field">
                <input type="checkbox" checked={!!c} onChange={(e) => toggle(t.id, e.target.checked)} />
                <Swatch field={t} width={40} />
                <span>{t.name}</span>
              </label>
              {c && (
                <span className="flow-kind">
                  <label title="Has an antifield: a charged field, drawn with arrows">
                    <input type="checkbox" checked={c.complex} onChange={(e) => setChoice(t.id, { complex: e.target.checked })} /> charged
                  </label>
                  <label title="Grassmann field">
                    <input type="checkbox" checked={c.grassmann} disabled={!c.complex} onChange={(e) => setChoice(t.id, { grassmann: e.target.checked })} /> fermion
                  </label>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <h3>External legs</h3>
      <div className="flow-legs">
        {form.legs.length === 0 && <span className="hint">none yet: add them below</span>}
        {form.legs.map((l, i) => {
          const t = lineTypes.find((x) => x.id === l.line);
          return (
            <span key={i} className="flow-chip">
              {t ? legName(t, l.anti) : l.line}
              <button onClick={() => update({ legs: form.legs.filter((_, j) => j !== i) })} aria-label="Remove leg">
                ×
              </button>
            </span>
          );
        })}
      </div>
      <div className="flow-legs">
        <span className="hint">Add:</span>
        {checked.flatMap((t) =>
          [false, ...(form.fields[t.id].complex ? [true] : [])].map((anti) => (
            <button key={t.id + anti} onClick={() => update({ legs: [...form.legs, { line: t.id, anti }] })}>
              + {legName(t, anti)}
            </button>
          )),
        )}
      </div>

      <details className="flow-advanced" open={!!form.vertices.trim()}>
        <summary>Restrict the vertices (optional)</summary>
        <p className="hint">
          Empty: every vertex that conserves each field&apos;s charge (maximal truncation). Otherwise one vertex per line, e.g.{' '}
          <code>sigma pion pion</code>, in the names{' '}
          {checked.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ', '}
              <code>{names.get(t.id)}</code>
              {form.fields[t.id].complex && (
                <>
                  , <code>{names.get(t.id)}bar</code>
                </>
              )}
            </span>
          ))}
          .
        </p>
        <textarea rows={3} value={form.vertices} onChange={(e) => update({ vertices: e.target.value })} spellCheck={false} />
      </details>

      <div className="flow-row" role="radiogroup" aria-label="Regulator">
        Regulator
        <label title="One term per regulator position, with ∂ₜR (⊗) on the line">
          <input type="radio" name="flow-regulator" checked={form.regulator !== 'tilde'} onChange={() => update({ regulator: 'insertion' })} /> ⊗ on each line
        </label>
        <label title="The diagrams without regulator, combined, behind \tilde∂ₜ (which acts on the regulator only)">
          <input type="radio" name="flow-regulator" checked={form.regulator === 'tilde'} onChange={() => update({ regulator: 'tilde' })} />{' '}
          <span className="tilde-d">∂</span>ₜ in front
        </label>
      </div>
      <label className="flow-row">
        Diagrams per row
        <input type="number" min={1} max={12} value={form.perRow} onChange={(e) => update({ perRow: Math.max(1, Math.round(Number(e.target.value)) || 1) })} />
      </label>
      {problems.length > 0 && (
        <ul className="flow-problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="flow-actions">
        {missing && <span className="hint">{missing}</span>}
        {running ? (
          <>
            <span className="hint">Running FunKit…</span>
            <button onClick={() => running()}>Cancel</button>
          </>
        ) : (
          <button className="primary" disabled={available === false || !!missing} onClick={compute}>
            Compute and insert
          </button>
        )}
      </div>
    </Modal>
  );
}
