import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import type { FrgDocument } from '../model/types';
import { buildScene } from '../render/scene';
import { toSvgString } from '../render/svg';
import { pdfSourceBlock, serializeDocument } from './io';

export interface ExportOptions {
  /** Output size factor (1 = one model unit per pt). */
  scale: number;
  /** Whitespace around the drawing, in model units. */
  margin: number;
  /** Restrict to these node/edge ids (e.g. the current selection). */
  only?: Set<string>;
}

function prepared(doc: FrgDocument, opts: ExportOptions) {
  const scene = buildScene(doc, opts.only);
  if (!scene.bbox) throw new Error('Nothing to export.');
  const b = scene.bbox;
  const bbox = { x: b.x - opts.margin, y: b.y - opts.margin, w: b.w + 2 * opts.margin, h: b.h + 2 * opts.margin };
  return { scene, bbox };
}

export function exportSvg(doc: FrgDocument, opts: ExportOptions): Blob {
  const { scene, bbox } = prepared(doc, opts);
  const svg = toSvgString(scene.prims, bbox, { scale: opts.scale, source: serializeDocument(doc) });
  return new Blob([svg], { type: 'image/svg+xml' });
}

export async function exportPdf(doc: FrgDocument, opts: ExportOptions): Promise<Blob> {
  const { scene, bbox } = prepared(doc, opts);
  const w = bbox.w * opts.scale;
  const h = bbox.h * opts.scale;
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden';
  holder.innerHTML = toSvgString(scene.prims, bbox).replace(/^<\?xml[^>]*>\s*/, '');
  document.body.appendChild(holder);
  try {
    const pdf = new jsPDF({ unit: 'pt', format: [w, h], orientation: w > h ? 'landscape' : 'portrait', compress: true });
    pdf.setProperties({ title: 'fRG diagram', creator: 'fRG Diagram Editor' });
    pdf.addMetadata(pdfSourceBlock(serializeDocument(doc)), 'https://frg-diagrams/ns/');
    await pdf.svg(holder.querySelector('svg')!, { x: 0, y: 0, width: w, height: h });
    return pdf.output('blob');
  } finally {
    holder.remove();
  }
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
