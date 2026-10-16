// Command-line interface: build figures from specs (or re-export documents) without the browser.
// Bundled to dist-cli/frg.mjs by `npm run build:cli`.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import type { FrgDocument } from '../model/types';
import { emptyDocument, STYLE_PRESETS } from '../model/defaults';
import { GROUP_LIBRARY } from '../model/library';
import { parseAnyFile, pdfSourceBlock, serializeDocument } from '../export/io';
import { toTikz } from '../export/tikz';
import { buildScene } from '../render/scene';
import { toSvgString } from '../render/svg';
import { PRESET_ALIASES, RING, SpecError, specToDocument, stampCatalog, validateSpec } from '../spec/spec';
import { specSchema } from '../spec/schema';
import { flowToSpec, funkitInput, validateFlow, type FlowSpec, type FunkitOutput } from '../flow/flow';
import { runFunkitWasm, WASM_OUT, type FunkitFactory } from '../flow/wasm';

const HELP = `frg — build fRG diagram figures from the command line

Usage:
  frg build <input> [-o <out>]... [--scale <s>] [--margin <pt>]
      <input>  a figure spec (.json with "format": "frg-spec"), an editor document (.frg.json),
               or a PDF/SVG/TeX file exported by the editor; "-" reads stdin.
      -o       output file, format chosen by extension (repeatable):
                 .tex       standalone LaTeX document (compile with pdflatex)
                 .tikz      bare tikzpicture to \\input into a paper
                 .frg.json  editable document (open it in the editor)
                 .svg       SVG (labels typeset with MathJax)
                 .pdf       PDF via pdflatex (must be installed)
                 .png       preview image via pdflatex + pdftoppm
               Without -o the tikzpicture is written to stdout.
  frg flow <flow.json> [-o <out>]... [--funkit <path>] [--save-funkit <file>] [--scale <s>] [--margin <pt>]
      The full one-loop flow of an n-point function: the fields and external legs in
      <flow.json> go to FunKit's C++ engine, every term of its result becomes a diagram with
      its prefactor. Outputs as for build, plus .spec.json (the figure spec, also written to
      stdout without -o). --funkit is a native funkit binary (default: $FUNKIT); without one,
      FunKit runs as WebAssembly from funkit.mjs + funkit.wasm next to frg.mjs, else funkit on
      PATH. --save-funkit keeps FunKit's raw JSON result.
  frg list [--json]   pre-built diagrams with their line slots, fields, vertex types, presets
  frg schema          JSON Schema of figure specs
  frg help            this text

Examples:
  frg build figure.json -o figure.tex -o figure.png
  frg flow examples/qm_pion.flow.json -o pion_flow.png --funkit ~/FunKit/cpplib/build/funkit

See docs/SPEC.md for the spec format.`;

function fail(msg: string): never {
  process.stderr.write(msg.endsWith('\n') ? msg : msg + '\n');
  process.exit(1);
}

function readInput(path: string): FrgDocument {
  return parseAnyFile(path, new Uint8Array(path === '-' ? readFileSync(0) : readFileSync(path)));
}

function run(cmd: string, args: string[], cwd: string): void {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (r.error) fail(`${cmd} not found: install it, or write .tex/.svg instead.`);
  if (r.status !== 0) {
    const log = (r.stdout ?? '').split('\n').filter((l) => l.startsWith('!') || l.startsWith('l.'));
    fail(`${cmd} failed:\n${log.join('\n') || r.stdout || r.stderr}`);
  }
}

/** Compile the standalone TeX in a temp dir; returns the dir and the PDF path. */
function compilePdf(doc: FrgDocument, scale: number): { dir: string; pdf: string } {
  const source = serializeDocument(doc);
  let tex = toTikz(doc, { scale, standalone: true, source }).tex;
  // Keep the source in the PDF's info dictionary so the editor can re-open it (base64 is PDF-string safe).
  tex = tex.replace('\\begin{document}\n', `\\begin{document}\n\\pdfinfo{/FRGSource (${pdfSourceBlock(source)})}\n`);
  const dir = mkdtempSync(join(tmpdir(), 'frg-'));
  writeFileSync(join(dir, 'figure.tex'), tex);
  run('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', 'figure.tex'], dir);
  return { dir, pdf: join(dir, 'figure.pdf') };
}

const FORMATS = ['.tex', '.tikz', '.json', '.svg', '.pdf', '.png'];

function write(doc: FrgDocument, out: string, scale: number, margin: number): void {
  const lower = out.toLowerCase();
  const source = serializeDocument(doc);
  if (lower.endsWith('.json')) writeFileSync(out, source);
  else if (lower.endsWith('.tex')) writeFileSync(out, toTikz(doc, { scale, standalone: true, source }).tex);
  else if (lower.endsWith('.tikz')) writeFileSync(out, toTikz(doc, { scale, source }).tex);
  else if (lower.endsWith('.svg')) {
    const scene = buildScene(doc);
    if (!scene.bbox) fail('Nothing to export: the figure is empty.');
    const b = scene.bbox;
    const bbox = { x: b.x - margin, y: b.y - margin, w: b.w + 2 * margin, h: b.h + 2 * margin };
    writeFileSync(out, toSvgString(scene.prims, bbox, { scale, source }));
  } else if (lower.endsWith('.pdf') || lower.endsWith('.png')) {
    const { dir, pdf } = compilePdf(doc, scale);
    try {
      if (lower.endsWith('.pdf')) copyFileSync(pdf, out);
      else {
        run('pdftoppm', ['-png', '-r', '200', '-singlefile', pdf, join(dir, 'figure')], dir);
        copyFileSync(join(dir, 'figure.png'), out);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

/** Arguments of build and flow: the input, -o outputs, --scale, --margin and the given extra options. */
function parseArgs(cmd: string, args: string[], extra: string[] = []) {
  const outs: string[] = [];
  const opts: Record<string, string> = {};
  let input: string | undefined;
  let scale = 1;
  let margin = 2;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-o' || a === '--out') outs.push(args[++i] ?? fail('-o needs a file name'));
    else if (a === '--scale') scale = Number(args[++i]);
    else if (a === '--margin') margin = Number(args[++i]);
    else if (extra.includes(a)) opts[a] = args[++i] ?? fail(`${a} needs a value`);
    else if (a.startsWith('-') && a !== '-') fail(`Unknown option ${a}\n\n${HELP}`);
    else if (input === undefined) input = a;
    else fail(`Unexpected argument ${a}`);
  }
  if (input === undefined) fail(`frg ${cmd}: no input file\n\n${HELP}`);
  if (!(scale > 0)) fail('--scale must be a positive number');
  for (const out of outs)
    if (!FORMATS.some((f) => out.toLowerCase().endsWith(f))) fail(`${out}: unknown output format (use .tex, .tikz, .frg.json, .svg, .pdf or .png)`);
  return { input, outs, scale, margin, opts };
}

function build(args: string[]): void {
  const { input, outs, scale, margin } = parseArgs('build', args);

  let doc: FrgDocument;
  try {
    doc = readInput(input);
  } catch (e) {
    if (e instanceof SpecError) fail(`${input}: invalid spec\n${e.problems.map((p) => `  ${p}`).join('\n')}`);
    fail(`${input}: ${(e as Error).message}`);
  }
  if (!outs.length) {
    process.stdout.write(toTikz(doc, { scale }).tex);
    return;
  }
  for (const out of outs) {
    write(doc, out, scale, margin);
    process.stderr.write(`wrote ${resolve(out)}\n`);
  }
}

/** Run FunKit's C++ engine on the flow in a temp dir and read its JSON result. */
function runFunkit(flow: FlowSpec, bin: string, save?: string): FunkitOutput {
  const dir = mkdtempSync(join(tmpdir(), 'frg-funkit-'));
  try {
    const out = join(dir, 'out.json');
    writeFileSync(join(dir, 'in.json'), JSON.stringify(funkitInput(flow, out), null, 1));
    const r = spawnSync(bin, ['in.json'], { cwd: dir, encoding: 'utf8' });
    if (r.error)
      fail(
        `cannot run FunKit (${bin}): ${r.error.message}\n` +
          'Download funkit.mjs and funkit.wasm from the editor\'s site into the directory of frg.mjs, or build\n' +
          'its C++ engine (in FunKit/cpplib: mkdir build && cd build && cmake .. && make funkit) and pass the\n' +
          'binary with --funkit <path> or set FUNKIT.',
      );
    if (r.status !== 0) fail(`FunKit failed (exit ${r.status}):\n${(r.stderr || r.stdout).trim().split('\n').slice(-20).join('\n')}`);
    if (save) copyFileSync(out, save);
    return JSON.parse(readFileSync(out, 'utf8')) as FunkitOutput;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** FunKit's result for a flow: a native binary if given, else the WebAssembly build, else funkit on PATH. */
async function computeFlow(flow: FlowSpec, opts: Record<string, string>): Promise<FunkitOutput> {
  const save = opts['--save-funkit'];
  const bin = opts['--funkit'] ?? process.env.FUNKIT;
  if (bin) return runFunkit(flow, bin, save);
  const here = dirname(fileURLToPath(import.meta.url));
  // Next to frg.mjs as on the editor's site, or in a clone's dist-wasm/.
  const wasm = [join(here, 'funkit.mjs'), join(here, '../dist-wasm/funkit.mjs')].find((p) => existsSync(p));
  if (!wasm) return runFunkit(flow, 'funkit', save);
  const { default: create } = (await import(/* @vite-ignore */ pathToFileURL(wasm).href)) as { default: FunkitFactory };
  let out: FunkitOutput;
  try {
    out = await runFunkitWasm(create, funkitInput(flow, WASM_OUT));
  } catch (e) {
    fail((e as Error).message);
  }
  if (save) writeFileSync(save, JSON.stringify(out, null, 1) + '\n');
  return out;
}

async function flow(args: string[]): Promise<void> {
  const { input, outs, scale, margin, opts } = parseArgs('flow', args, ['--funkit', '--save-funkit']);
  const problems = (what: string, e: unknown): never => {
    if (e instanceof SpecError) fail(`${input}: ${what}\n${e.problems.map((p) => `  ${p}`).join('\n')}`);
    fail(`${input}: ${(e as Error).message}`);
  };
  let f: FlowSpec;
  try {
    f = validateFlow(JSON.parse(readFileSync(input === '-' ? 0 : input, 'utf8')));
  } catch (e) {
    return problems('invalid flow', e);
  }
  const result = await computeFlow(f, opts);
  let spec;
  let doc: FrgDocument;
  try {
    spec = flowToSpec(f, result);
    doc = specToDocument(validateSpec(spec));
  } catch (e) {
    return problems('cannot draw the flow', e);
  }
  const specText = JSON.stringify(spec, null, 2) + '\n';
  if (!outs.length) {
    process.stdout.write(specText);
    return;
  }
  for (const out of outs) {
    if (out.toLowerCase().endsWith('.spec.json')) writeFileSync(out, specText);
    else write(doc, out, scale, margin);
    process.stderr.write(`wrote ${resolve(out)}\n`);
  }
}

function listCatalog(json: boolean): void {
  const doc = emptyDocument();
  const fields = [...doc.fieldTypes, ...GROUP_LIBRARY.fields.filter((f) => !doc.fieldTypes.some((x) => x.id === f.id))];
  const vertices = [...doc.vertexTypes, ...GROUP_LIBRARY.vertexTypes.filter((v) => !doc.vertexTypes.some((x) => x.id === v.id))];
  const cat = {
    diagrams: stampCatalog(),
    fields: fields.map((f) => ({ id: f.id, name: f.name, tex: f.tex, line: f.line, color: f.color, arrows: f.arrows })),
    vertexTypes: vertices.map((v) => ({ id: v.id, name: v.name, shape: v.shape })),
    stylePresets: STYLE_PRESETS.map((s) => s.name),
  };
  if (json) {
    process.stdout.write(JSON.stringify(cat, null, 2) + '\n');
    return;
  }
  const pad = (s: string, n: number) => s.padEnd(n);
  const lines = ['Diagrams (id, line slots, default regulator):'];
  for (const d of cat.diagrams) lines.push(`  ${pad(d.id, 14)} ${pad(d.slots.join(', ') || '—', 26)} ${pad(d.regulator ?? '—', 7)} ${d.label}`);
  lines.push(`  ${pad(RING.id, 14)} ${pad('0, 1, … (line i: vertex i → i+1)', 26)} ${pad('0', 7)} ${RING.label}; set "vertices"`);
  lines.push('', 'Fields (id, TeX, line, colour, arrows):');
  for (const f of cat.fields) lines.push(`  ${pad(f.id, 10)} ${pad(f.tex || '—', 8)} ${pad(f.line, 7)} ${pad(f.color, 12)} ${pad(f.arrows, 9)} ${f.name}`);
  lines.push('', 'Vertex types (id, shape):');
  for (const v of cat.vertexTypes) lines.push(`  ${pad(v.id, 13)} ${pad(v.shape, 9)} ${v.name}`);
  lines.push('', `Style presets: ${Object.keys(PRESET_ALIASES).join(', ')} (default: fqcd)`);
  process.stdout.write(lines.join('\n') + '\n');
}

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'build':
    build(rest);
    break;
  case 'flow':
    await flow(rest);
    break;
  case 'list':
    listCatalog(rest.includes('--json'));
    break;
  case 'schema':
    process.stdout.write(JSON.stringify(specSchema(), null, 2) + '\n');
    break;
  case undefined:
  case 'help':
  case '--help':
  case '-h':
    process.stdout.write(HELP + '\n');
    break;
  default:
    fail(`Unknown command ${cmd}\n\n${HELP}`);
}
