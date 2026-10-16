import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type { FrgDocument } from '../model/types';
import { emptyDocument } from '../model/defaults';
import { normalizeDocument, serializeDocument } from '../export/io';
import { emptyLibrary, parseLibrary, type Library } from '../model/library';

export type Tool = 'select' | 'line' | 'vertex' | 'insertion' | 'text' | 'region' | 'stamp';

export interface EditorState {
  doc: FrgDocument;
  past: FrgDocument[];
  future: FrgDocument[];
  /** Ids of selected nodes, edges and insertions. */
  selection: string[];
  tool: Tool;
  activeField: string;
  activeNodeKind: string;
  activeInsertion: string;
  activeStamp: string;
  snap: boolean;
  exportScale: number;
  exportMargin: number;
  /** Bumped to ask the inspector to focus the label text field. */
  focusLabel: number;
  /** Personal library (templates, fields), kept in browser storage and exportable. */
  userLibrary: Library;
  dialog: 'fields' | 'library' | 'flow' | 'about' | null;
  /** Bumped to ask the canvas to zoom to fit the drawing. */
  fitRequest: number;

  /** Apply a change. With record=false the change is folded into the current gesture. */
  apply(recipe: (d: Draft<FrgDocument>) => void, record?: boolean): void;
  beginGesture(): void;
  endGesture(): void;
  undo(): void;
  redo(): void;
  load(doc: FrgDocument): void;
  set(p: Partial<EditorState>): void;
}

const HISTORY = 200;
const STORAGE_KEY = 'frg-diagram-autosave';

function loadAutosave(): FrgDocument {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeDocument(JSON.parse(raw));
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  return emptyDocument();
}

const LIBRARY_KEY = 'frg-user-library';

function loadUserLibrary(): Library {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (raw) return parseLibrary(raw);
  } catch {
    /* storage unavailable or corrupt */
  }
  return emptyLibrary('My library');
}

let gestureStart: FrgDocument | null = null;

export const useEditor = create<EditorState>((set, get) => ({
  doc: loadAutosave(),
  past: [],
  future: [],
  selection: [],
  tool: 'select',
  activeField: 'quark',
  activeNodeKind: 'fullVertex',
  activeInsertion: 'regulator',
  activeStamp: 'bubble',
  snap: true,
  exportScale: 1,
  exportMargin: 2,
  focusLabel: 0,
  userLibrary: loadUserLibrary(),
  dialog: null,
  fitRequest: 1,

  apply(recipe, record = true) {
    const { doc, past } = get();
    const next = produce(doc, recipe);
    if (next === doc) return;
    if (record && !gestureStart) set({ doc: next, past: [...past, doc].slice(-HISTORY), future: [] });
    else set({ doc: next });
  },
  beginGesture() {
    gestureStart = get().doc;
  },
  endGesture() {
    const start = gestureStart;
    gestureStart = null;
    const { doc, past } = get();
    if (start && start !== doc) set({ past: [...past, start].slice(-HISTORY), future: [] });
  },
  undo() {
    const { past, doc, future } = get();
    if (!past.length) return;
    set({ doc: past[past.length - 1], past: past.slice(0, -1), future: [doc, ...future], selection: [] });
  },
  redo() {
    const { past, doc, future } = get();
    if (!future.length) return;
    set({ doc: future[0], future: future.slice(1), past: [...past, doc], selection: [] });
  },
  load(doc) {
    const { past, doc: cur } = get();
    set({ doc, past: [...past, cur].slice(-HISTORY), future: [], selection: [], fitRequest: get().fitRequest + 1 });
  },
  set: (p) => set(p),
}));

// Autosave (debounced). Browser storage is a convenience only; files are the real source.
let timer: ReturnType<typeof setTimeout> | undefined;
useEditor.subscribe((s, prev) => {
  if (s.userLibrary !== prev.userLibrary) {
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(s.userLibrary));
    } catch {
      /* ignore */
    }
  }
  if (s.doc === prev.doc) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeDocument(s.doc));
    } catch {
      /* ignore */
    }
  }, 400);
});
