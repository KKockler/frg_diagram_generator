#!/bin/sh
# Compile FunKit's C++ engine (cpplib) to WebAssembly: dist-wasm/funkit.mjs + funkit.wasm, used by
# the editor's Flow… dialog and by `frg flow` when no native funkit binary is given.
#
#   scripts/build-funkit-wasm.sh [FunKit checkout]
#
# Without an argument it fetches the commit pinned in funkit.json. It needs em++ (Emscripten);
# without it, it runs itself in the emscripten/emsdk Docker image of that version.
set -eu
cd "$(dirname "$0")/.."
pin() { sed -n "s/.*\"$1\": *\"\([^\"]*\)\".*/\1/p" funkit.json; }

if ! command -v em++ > /dev/null; then
  command -v docker > /dev/null || { echo "Needs em++ (Emscripten) or docker." >&2; exit 1; }
  src=""
  [ $# -gt 0 ] && src="-v $(cd "$1" && pwd):/funkit:ro" && set -- /funkit
  # shellcheck disable=SC2086
  exec docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD:/repo" $src -w /repo \
    "emscripten/emsdk:$(pin emsdk)" sh scripts/build-funkit-wasm.sh "$@"
fi

work=build/funkit-wasm
rm -rf "$work" && mkdir -p "$work" dist-wasm
if [ $# -gt 0 ]; then
  cp -r "$1/cpplib" "$work/cpplib"
else
  git init -q "$work/FunKit"
  git -C "$work/FunKit" fetch -q --depth 1 "$(pin repository)" "$(pin commit)"
  git -C "$work/FunKit" checkout -q FETCH_HEAD
  cp -r "$work/FunKit/cpplib" "$work/cpplib"
fi
cd "$work/cpplib"
# OpenMP only parallelises loops (#pragma omp); a browser build runs single-threaded without it.
sed -i 's|^#include <omp.h>|// #include <omp.h>: OpenMP off for WebAssembly|' source/*.cpp

em++ -std=c++20 -O2 -fexceptions -Iinclude main.cpp source/*.cpp -o ../../../dist-wasm/funkit.mjs \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createFunkit -sENVIRONMENT=web,worker,node \
  -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sFORCE_FILESYSTEM=1 \
  -sEXPORTED_RUNTIME_METHODS=callMain,FS -sEXPORT_EXCEPTION_HANDLING_HELPERS=1 \
  -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=4GB -sSTACK_SIZE=8MB
echo "wrote dist-wasm/funkit.mjs and dist-wasm/funkit.wasm"
