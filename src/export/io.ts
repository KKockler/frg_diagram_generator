import type { DEdge, FrgDocument } from '../model/types';
import { DEFAULT_FIELDS, DEFAULT_VERTICES, THESIS_STYLE } from '../model/defaults';
import { sourceFromSvg } from '../render/svg';
import { buildSpec, isSpec } from '../spec/spec';

export const PDF_MARK_BEGIN = 'FRGSRC:';
export const PDF_MARK_END = ':FRGSRC';

export function serializeDocument(doc: FrgDocument): string {
  return JSON.stringify(doc, null, 1);
}

/** Validate and fill in defaults for a parsed document object. */
export function normalizeDocument(raw: unknown): FrgDocument {
  const d = raw as Partial<FrgDocument>;
  if (!d || d.format !== 'frg-diagram') throw new Error('Not an fRG diagram file.');
  if (d.version !== 1) throw new Error(`Unsupported file version ${String(d.version)}.`);
  const fieldTypes = Array.isArray(d.fieldTypes) ? [...d.fieldTypes] : [];
  // Newer default fields become available in older documents too.
  for (const f of DEFAULT_FIELDS) if (!fieldTypes.some((x) => x.id === f.id)) fieldTypes.push({ ...f });
  const vertexTypes = Array.isArray(d.vertexTypes) ? [...d.vertexTypes] : [];
  for (const v of DEFAULT_VERTICES) if (!vertexTypes.some((x) => x.id === v.id)) vertexTypes.push({ ...v });
  const diagram: Partial<FrgDocument['diagram']> = d.diagram ?? {};
  return {
    format: 'frg-diagram',
    version: 1,
    style: { ...THESIS_STYLE, ...d.style },
    fieldTypes,
    vertexTypes,
    diagram: {
      nodes: diagram.nodes ?? [],
      edges: (diagram.edges ?? []).map((e: Partial<DEdge>) => ({ bend: 0, reversed: false, insertions: [], ...e }) as DEdge),
      labels: diagram.labels ?? [],
      groups: diagram.groups ?? [],
      regions: diagram.regions ?? [],
    },
  };
}

function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const b64decode = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

/** Marker block embedded in PDF XMP metadata; base64 keeps it free of XML/PDF escaping issues. */
export const pdfSourceBlock = (json: string) => PDF_MARK_BEGIN + b64encode(json) + PDF_MARK_END;

/** Open a .frg.json, a figure spec, or an SVG/PDF/TeX file previously exported by this app. */
export function parseAnyFile(name: string, bytes: Uint8Array): FrgDocument {
  const text = new TextDecoder('latin1').decode(bytes);
  if (text.startsWith('%PDF')) {
    const i = text.indexOf(PDF_MARK_BEGIN);
    const j = text.indexOf(PDF_MARK_END, i);
    if (i < 0 || j < 0) throw new Error(`${name}: PDF contains no embedded diagram source.`);
    return normalizeDocument(JSON.parse(b64decode(text.slice(i + PDF_MARK_BEGIN.length, j))));
  }
  const utf8 = new TextDecoder().decode(bytes);
  if (utf8.includes('%' + PDF_MARK_BEGIN)) {
    // TikZ export: the source block is spread over TeX comment lines.
    const joined = utf8
      .split(/\r?\n/)
      .filter((l) => l.startsWith('%'))
      .map((l) => l.slice(1))
      .join('');
    const i = joined.indexOf(PDF_MARK_BEGIN);
    const j = joined.indexOf(PDF_MARK_END, i);
    if (i >= 0 && j > i) return normalizeDocument(JSON.parse(b64decode(joined.slice(i + PDF_MARK_BEGIN.length, j))));
  }
  if (/<svg[\s>]/.test(utf8)) {
    const src = sourceFromSvg(utf8);
    if (!src) throw new Error(`${name}: SVG contains no embedded diagram source.`);
    return normalizeDocument(JSON.parse(src));
  }
  const json: unknown = JSON.parse(utf8);
  return isSpec(json) ? buildSpec(json) : normalizeDocument(json);
}
