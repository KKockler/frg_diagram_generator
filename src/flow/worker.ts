// Web Worker running FunKit's WebAssembly build for the editor's Flow… dialog. It loads
// funkit.mjs from the site (next to index.html) and answers one FunKit input with its result.
// It imports no editor code, to stay small.
import type { FunkitInput } from './flow';
import { runFunkitWasm, type FunkitFactory } from './wasm';

self.onmessage = async (e: MessageEvent<{ input: FunkitInput; base: string }>) => {
  try {
    const { default: create } = (await import(/* @vite-ignore */ new URL('funkit.mjs', e.data.base).href)) as { default: FunkitFactory };
    postMessage({ ok: true, out: await runFunkitWasm(create, e.data.input) });
  } catch (err) {
    postMessage({ ok: false, error: (err as Error).message ?? String(err) });
  }
};
