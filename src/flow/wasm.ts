// Run FunKit's C++ engine compiled to WebAssembly (dist-wasm/funkit.mjs, built by
// scripts/build-funkit-wasm.sh). Shared by the browser's Web Worker and the CLI.
import type { FunkitInput, FunkitOutput } from './flow';

/** The Emscripten module: FunKit's main() with an in-memory file system. */
export interface FunkitModule {
  FS: { writeFile(path: string, data: string): void; readFile(path: string): Uint8Array };
  callMain(args: string[]): number;
  getExceptionMessage?(e: unknown): [string, string];
}
export type FunkitFactory = (opts: {
  print?: (s: string) => void;
  printErr?: (s: string) => void;
}) => Promise<FunkitModule>;

/** Where FunKit writes its result in the module's file system. */
export const WASM_OUT = '/out.json';

/**
 * Run FunKit on one input (from funkitInput(flow, WASM_OUT)) in a fresh module instance: FunKit's
 * main() is meant to run once per process.
 */
export async function runFunkitWasm(create: FunkitFactory, input: FunkitInput): Promise<FunkitOutput> {
  const log: string[] = [];
  const m = await create({ print: (s) => log.push(s), printErr: (s) => log.push(s) });
  m.FS.writeFile('/in.json', JSON.stringify(input));
  const tail = () => (log.length ? `\n${log.slice(-20).join('\n')}` : '');
  let status: number;
  try {
    status = m.callMain(['/in.json']);
  } catch (e) {
    const [type, msg] = m.getExceptionMessage?.(e) ?? ['', e instanceof Error ? e.message : String(e)];
    if (type.includes('bad_alloc')) throw new Error('FunKit ran out of memory (WebAssembly allows at most 4 GB); use the native funkit for flows this large');
    throw new Error(`FunKit failed: ${[type, msg].filter(Boolean).join(': ')}${tail()}`);
  }
  if (status !== 0) throw new Error(`FunKit failed (exit ${status})${tail()}`);
  return JSON.parse(new TextDecoder().decode(m.FS.readFile(WASM_OUT))) as FunkitOutput;
}
