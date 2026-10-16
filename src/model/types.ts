// Document model. All coordinates are in pt, y pointing down (SVG convention).

export interface Vec {
  x: number;
  y: number;
}

/** How arrows are drawn on a field's line. */
export type ArrowMode = 'none' | 'forward' | 'opposite';

/** A particle / field type, e.g. pion, quark, gluon. Purely declarative. */
export interface FieldType {
  id: string;
  name: string;
  /** TeX symbol, used for labels and the legend (e.g. "\\pi"). */
  tex: string;
  /** Id of a registered line style (see styles/lineStyles.ts). */
  line: string;
  /** Colour name from the palette (e.g. "RoyalBlue") or a hex string. */
  color: string;
  arrows: ArrowMode;
  /** Style-specific parameters overriding the line style's defaults. */
  params?: Record<string, number>;
}

/** A vertex type, e.g. full vertex, bare vertex, Γ⁽ⁿ⁾ blob. Purely declarative, like FieldType. */
export interface VertexType {
  id: string;
  name: string;
  /** Id of a registered vertex shape (see styles/nodeKinds.ts). */
  shape: string;
  /** Size relative to the style sheet's vertexRadius. */
  scale: number;
  /** Fill colour; "style" = the style sheet's vertex colour, "none" = hollow. */
  fill: string;
  /** Outline colour, or "none". */
  stroke: string;
  /** Outline width relative to the style sheet's line width. */
  strokeWidth: number;
  /** Optional TeX drawn inside the vertex (e.g. "n" for Γ⁽ⁿ⁾). */
  tex?: string;
}

/** Global sizes, shared by every diagram in a document so they stay consistent. */
export interface StyleSheet {
  name: string;
  lineWidth: number;
  /** Distance between the two strokes of a double line. */
  doubleSep: number;
  arrowLength: number;
  arrowWidth: number;
  /** Base vertex radius; vertex types scale relative to it. */
  vertexRadius: number;
  regulatorRadius: number;
  loopRadius: number;
  legLength: number;
  gridSize: number;
  /** Default vertex fill (used by vertex types whose fill is "style"). */
  vertexColor: string;
  /** Default size of labels on lines/vertices (TeX font size, in model units = pt at scale 1). */
  fontSize: number;
  /** Default size of free TeX terms (+, −½, left-hand sides of equations). */
  termSize: number;
  /** Horizontal gap between terms when arranging a row. */
  rowGap: number;
  /** 'grayscale' / 'black' re-colour the whole output, e.g. for journals printing in black and white. */
  colorMode: 'color' | 'grayscale' | 'black';
  /** Outline colour of arrowheads, or "none". Outlined heads on black lines are filled grey. */
  arrowOutline: string;
  /** Fill of regulator insertions, or "none". */
  regulatorFill: string;
  /** Outline of regulator insertions; "line" = the colour of the line it sits on. */
  regulatorStroke: string;
}

export interface DNode {
  id: string;
  x: number;
  y: number;
  /** Id of a vertex type in the document, or "external" for an invisible line end. */
  kind: string;
}

export interface Insertion {
  id: string;
  /** Id of a registered insertion kind, e.g. "regulator". */
  kind: string;
  /** Position along the edge, 0 = start, 1 = end. */
  t: number;
}

export interface SelfLoop {
  radius: number;
  /** Direction (radians) from the node to the loop centre. */
  angle: number;
}

export interface DEdge {
  id: string;
  from: string;
  to: string;
  field: string;
  /** Signed sagitta of the arc; 0 = straight line. Ignored for self-loops. */
  bend: number;
  /** Present iff from === to. */
  loop?: SelfLoop;
  /** Flip the direction of arrows (charge flow). */
  reversed: boolean;
  insertions: Insertion[];
  /** Optional momentum arrow drawn beside the line. */
  momentum?: MomentumArrow;
}

export interface MomentumArrow {
  tex: string;
  /** +1 = left of the drawing direction (perp side), −1 = the other side. */
  side: 1 | -1;
  /** Arrow points against the line direction. */
  reversed: boolean;
}

/** Where a label hangs: free on the canvas, or relative to a node / a point on an edge. */
export type LabelAttach = { node: string } | { edge: string; t: number };

export interface Label {
  id: string;
  tex: string;
  /** Free position, or offset from the attachment point. */
  x: number;
  y: number;
  attach?: LabelAttach;
  /** Font size; defaults to the style sheet's fontSize. */
  size?: number;
  color?: string;
}

/**
 * Members (node, edge and label ids) are selected and moved as one unit.
 * Placed pre-built diagrams are groups, so their geometry stays canonical.
 */
export interface Group {
  id: string;
  name: string;
  members: string[];
}

/** A shaded box or ellipse drawn behind everything (e.g. to highlight part of a diagram). */
export interface Region {
  id: string;
  shape: 'rect' | 'ellipse';
  /** Top-left corner and size. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Fill colour or "none". */
  fill: string;
  /** Fill opacity 0…1. */
  opacity: number;
  /** Outline colour or "none". */
  stroke: string;
  dashed: boolean;
  /** Corner radius of rectangles. */
  radius: number;
}

export interface Diagram {
  nodes: DNode[];
  edges: DEdge[];
  labels: Label[];
  groups: Group[];
  regions: Region[];
}

export interface FrgDocument {
  format: 'frg-diagram';
  version: 1;
  style: StyleSheet;
  fieldTypes: FieldType[];
  vertexTypes: VertexType[];
  diagram: Diagram;
}
