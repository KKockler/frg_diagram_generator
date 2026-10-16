import { useEffect, useState } from 'react';
import { useEditor, type Tool } from '../store/store';
import { Canvas } from './Canvas';
import { Inspector } from './Inspector';
import { Palette } from './Palette';
import { TypesEditor, LibraryDialog, AboutDialog } from './Dialogs';
import { FlowDialog } from './FlowDialog';
import {
  arrangeSelection,
  transformSel,
  groupSelection,
  ungroupSelection,
  deleteSelection,
  copyTikz,
  doExportTikz,
  doExportPdf,
  doExportSvg,
  duplicateSelection,
  flipSelection,
  newDocument,
  nudgeSelection,
  openDocument,
  saveDocument,
  selectAll,
} from './actions';

const TOOL_KEYS: Record<string, Tool> = { v: 'select', l: 'line', p: 'vertex', r: 'insertion', t: 'text', b: 'region', d: 'stamp' };

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, select, textarea, .modal')) return;
      if (useEditor.getState().dialog) {
        if (e.key === 'Escape') useEditor.getState().set({ dialog: null });
        return;
      }
      const s = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        s.redo();
      } else if (mod && k === 'd') {
        e.preventDefault();
        duplicateSelection();
      } else if (mod && k === 'a') {
        e.preventDefault();
        selectAll();
      } else if (mod && k === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroupSelection();
        else groupSelection();
      } else if (mod && k === 's') {
        e.preventDefault();
        saveDocument();
      } else if (mod && k === 'o') {
        e.preventDefault();
        openDocument();
      } else if (mod) {
        return;
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelection();
      } else if (e.key === 'Escape') {
        s.set({ selection: [], tool: 'select' });
      } else if (k === 'f') {
        flipSelection();
      } else if (k === 'a') {
        arrangeSelection();
      } else if (e.key === '0') {
        s.set({ fitRequest: s.fitRequest + 1 });
      } else if (e.key === '[' || e.key === ']' || e.key === '{' || e.key === '}') {
        const deg = e.shiftKey ? 90 : 15;
        transformSel({ kind: 'rotate', angle: ((e.key === ']' || e.key === '}' ? 1 : -1) * deg * Math.PI) / 180 });
      } else if (TOOL_KEYS[k]) {
        s.set({ tool: TOOL_KEYS[k] });
      } else if (e.key.startsWith('Arrow') && s.selection.length) {
        e.preventDefault();
        const g = e.shiftKey ? s.doc.style.gridSize * 4 : s.doc.style.gridSize;
        const dx = e.key === 'ArrowLeft' ? -g : e.key === 'ArrowRight' ? g : 0;
        const dy = e.key === 'ArrowUp' ? -g : e.key === 'ArrowDown' ? g : 0;
        nudgeSelection(dx, dy);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  useShortcuts();
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const snap = useEditor((s) => s.snap);
  const hasSelection = useEditor((s) => s.selection.length > 0);
  const set = useEditor((s) => s.set);
  const [selOnly, setSelOnly] = useState(false);
  const dialog = useEditor((s) => s.dialog);

  return (
    <div className="app">
      <header className="toolbar">
        <strong className="brand">fRG Diagrams</strong>
        <button onClick={newDocument}>New</button>
        <button onClick={openDocument} title="Open .frg.json, or an SVG/PDF exported by this app (Ctrl+O)">Open…</button>
        <button onClick={saveDocument} title="Save editable source (Ctrl+S)">Save</button>
        <span className="sep" />
        <button disabled={!canUndo} onClick={() => useEditor.getState().undo()}>Undo</button>
        <button disabled={!canRedo} onClick={() => useEditor.getState().redo()}>Redo</button>
        <button disabled={!hasSelection} onClick={duplicateSelection}>Duplicate</button>
        <button disabled={!hasSelection} onClick={deleteSelection}>Delete</button>
        <button disabled={!hasSelection} onClick={arrangeSelection} title="Line up the selected diagrams and TeX terms as an equation row (A)">Arrange row</button>
        <button disabled={!hasSelection} onClick={groupSelection} title="Group the selection so it moves as one unit (Ctrl+G)">Group</button>
        <label className="check">
          <input type="checkbox" checked={snap} onChange={() => set({ snap: !snap })} /> Snap
        </label>
        <span className="sep" />
        <button onClick={() => set({ dialog: 'fields' })} title="Add or edit line (field) and vertex types">Lines &amp; vertices…</button>
        <button onClick={() => set({ dialog: 'library' })} title="Group library and your own templates">Library…</button>
        <button onClick={() => set({ dialog: 'flow' })} title="Generate the full one-loop flow of an n-point function (FunKit)">Flow…</button>
        <button onClick={() => set({ dialog: 'about' })} title="About this tool, credits and references">About…</button>
        <span className="grow" />
        <label className="check" title="Export only the selected part of the canvas">
          <input type="checkbox" checked={selOnly} onChange={() => setSelOnly(!selOnly)} /> Selection only
        </label>
        <button onClick={() => doExportSvg(selOnly)}>SVG</button>
        <button onClick={() => doExportTikz(selOnly)} title="Standalone .tex (TikZ); labels are typeset by LaTeX">TikZ</button>
        <button onClick={() => copyTikz(selOnly)} title="Copy the tikzpicture to paste into a paper">Copy TikZ</button>
        <button className="primary" onClick={() => doExportPdf(selOnly)}>Export PDF</button>
      </header>
      <Palette />
      <main className="stage">
        <Canvas />
      </main>
      <Inspector />
      {dialog === 'fields' && <TypesEditor />}
      {dialog === 'library' && <LibraryDialog />}
      {dialog === 'flow' && <FlowDialog />}
      {dialog === 'about' && <AboutDialog />}
    </div>
  );
}
