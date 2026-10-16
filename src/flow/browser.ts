// FunKit in the browser: each flow runs in its own Web Worker, so a long run never blocks the
// editor and cancelling (or finishing) frees the WebAssembly memory.
import { funkitInput, type FlowSpec, type FunkitOutput } from './flow';
import { WASM_OUT } from './wasm';

const base = () => new URL('./', document.baseURI).href;

/** Whether this build ships FunKit (dist-wasm/ is copied next to index.html). */
export async function funkitAvailable(): Promise<boolean> {
  try {
    const r = await fetch(new URL('funkit.wasm', base()), { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}

export function runFlow(flow: FlowSpec): { result: Promise<FunkitOutput>; cancel: () => void } {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  let reject: (e: Error) => void = () => {};
  const result = new Promise<FunkitOutput>((res, rej) => {
    reject = rej;
    worker.onmessage = (e: MessageEvent<{ ok: true; out: FunkitOutput } | { ok: false; error: string }>) => {
      worker.terminate();
      if (e.data.ok) res(e.data.out);
      else rej(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      rej(new Error(e.message || 'FunKit could not be started'));
    };
  });
  worker.postMessage({ input: funkitInput(flow, WASM_OUT), base: base() });
  return {
    result,
    cancel: () => {
      worker.terminate();
      reject(new Error('cancelled'));
    },
  };
}
