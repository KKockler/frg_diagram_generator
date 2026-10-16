import type { FieldType, FrgDocument, StyleSheet, VertexType } from './types';

/**
 * Named colours. Values are xcolor's dvipsnames converted CMYK → RGB the way
 * xcolor does it, so exports match figures made with \usepackage[dvipsnames]{xcolor}.
 */
export const NAMED_COLORS: Record<string, string> = {
  Black: '#000000',
  White: '#ffffff',
  RoyalBlue: '#0080ff',
  BrickRed: '#b8140b',
  MidnightBlue: '#037f91', // dvipsnames' MidnightBlue is actually teal
  MidnightBlueSVG: '#191970', // svgnames / X11 MidnightBlue
  BurntOrange: '#ff7d00',
  Orange: '#ff6321',
  ForestGreen: '#009b00',
  Purple: '#8c24ff',
  Gray: '#808080',
  LightGray: '#c8c8c8',
};

export function resolveColor(c: string): string {
  return NAMED_COLORS[c] ?? c;
}

export const THESIS_STYLE: StyleSheet = {
  name: 'Thesis',
  lineWidth: 2,
  doubleSep: 6,
  arrowLength: 8,
  arrowWidth: 6,
  vertexRadius: 6,
  regulatorRadius: 8,
  loopRadius: 27,
  legLength: 24,
  gridSize: 5,
  vertexColor: 'MidnightBlueSVG',
  fontSize: 14,
  termSize: 22,
  rowGap: 10,
  colorMode: 'color',
  arrowOutline: 'none',
  regulatorFill: 'White',
  regulatorStroke: 'line',
};

/**
 * The look of the diagrams in Ihssen, Pawlowski, Sattler, Wink, "Towards quantitative precision
 * in functional QCD I" (arXiv:2408.08413): thin lines, grey vertices, outlined arrowheads and
 * lavender regulator insertions. Sizes are the paper's, scaled to the same loop radius as the thesis.
 */
export const FQCD_STYLE: StyleSheet = {
  name: 'fQCD',
  lineWidth: 1,
  doubleSep: 3.2,
  arrowLength: 4,
  arrowWidth: 3.4,
  vertexRadius: 5,
  regulatorRadius: 5,
  loopRadius: 27,
  legLength: 37,
  gridSize: 5,
  vertexColor: '#b3b3b3',
  fontSize: 12,
  termSize: 14,
  rowGap: 10,
  colorMode: 'color',
  arrowOutline: '#1a1a1a',
  regulatorFill: '#eecfff',
  regulatorStroke: 'Black',
};

/** Style of new documents and of specs that name no preset. */
export const DEFAULT_STYLE = FQCD_STYLE;

/** Ready-made style sheets. Applying one keeps the document's diagrams, only restyles them. */
export const STYLE_PRESETS: StyleSheet[] = [
  FQCD_STYLE,
  THESIS_STYLE,
  { ...THESIS_STYLE, name: 'Journal (black & white)', colorMode: 'black' },
  { ...THESIS_STYLE, name: 'Grayscale', colorMode: 'grayscale' },
  {
    ...THESIS_STYLE,
    name: 'Talk (bold)',
    lineWidth: 3,
    doubleSep: 8,
    arrowLength: 10,
    arrowWidth: 8,
    vertexRadius: 7.5,
    regulatorRadius: 10,
    fontSize: 16,
    termSize: 26,
  },
];

/** Map a resolved hex colour through the style sheet's colour mode. */
export function applyColorMode(hex: string, mode: StyleSheet['colorMode']): string {
  if (mode === 'color' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  // In black & white, greys (blobs, white fills) survive and pale fills (regulators) turn grey.
  if (mode === 'black' && r === g && g === b) return hex;
  if (mode === 'black' && lum < 200) return '#000000';
  const y = lum.toString(16).padStart(2, '0');
  return `#${y}${y}${y}`;
}

export const DEFAULT_FIELDS: FieldType[] = [
  // Meson, gluon and ghost lines as in arXiv:2408.08413.
  { id: 'pion', name: 'Pion', tex: '\\pi', line: 'double', color: '#00a6fb', arrows: 'opposite' },
  { id: 'sigma', name: 'Sigma', tex: '\\sigma', line: 'double', color: 'BrickRed', arrows: 'opposite' },
  { id: 'quark', name: 'Quark', tex: 'q', line: 'single', color: 'Black', arrows: 'forward' },
  { id: 'gluon', name: 'Gluon', tex: 'A', line: 'curly', color: '#ff4000', arrows: 'none', params: { amplitude: 3.4, windingLength: 5 } },
  { id: 'ghost', name: 'Ghost', tex: 'c', line: 'dashed', color: 'Black', arrows: 'forward', params: { dash: 2.8, gap: 2.6 } },
  { id: 'photon', name: 'Photon', tex: '\\gamma', line: 'wavy', color: 'Black', arrows: 'none' },
  { id: 'scalar', name: 'Scalar', tex: '\\phi', line: 'single', color: 'Black', arrows: 'none' },
  { id: 'aux', name: 'Guide (dotted)', tex: '', line: 'dotted', color: 'Black', arrows: 'none', params: { gap: 4 } },
];

export const DEFAULT_VERTICES: VertexType[] = [
  { id: 'fullVertex', name: 'Full vertex', shape: 'circle', scale: 1, fill: 'style', stroke: 'Black', strokeWidth: 0.6 },
  { id: 'squareVertex', name: 'Square vertex', shape: 'square', scale: 1, fill: 'style', stroke: 'Black', strokeWidth: 0.6 },
  { id: 'bareVertex', name: 'Bare vertex', shape: 'circle', scale: 0.5, fill: 'Black', stroke: 'none', strokeWidth: 0 },
  { id: 'blob', name: 'Blob (Γ⁽ⁿ⁾)', shape: 'circle', scale: 2.2, fill: 'LightGray', stroke: 'Black', strokeWidth: 0.6 },
  { id: 'hatched', name: 'Hatched blob (1PI)', shape: 'hatched', scale: 2, fill: 'White', stroke: 'Black', strokeWidth: 0.6 },
];

export function emptyDocument(): FrgDocument {
  return {
    format: 'frg-diagram',
    version: 1,
    style: { ...DEFAULT_STYLE },
    fieldTypes: DEFAULT_FIELDS.map((f) => ({ ...f })),
    vertexTypes: DEFAULT_VERTICES.map((v) => ({ ...v })),
    diagram: { nodes: [], edges: [], labels: [], groups: [], regions: [] },
  };
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}
