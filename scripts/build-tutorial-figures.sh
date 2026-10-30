#!/bin/sh
# Renders the figures of tutorial.html (docs/tutorial/*.svg) from their specs with the CLI.
# flow.spec.json is the output of `frg flow examples/qm_pion.flow.json -o flow.spec.json`.
# The SVGs embed their source, so the tutorial's download links open in the editor.
set -e
cd "$(dirname "$0")/.."
test -f dist-cli/frg.mjs || npm run build:cli
for f in docs/tutorial/*.spec.json; do
  node dist-cli/frg.mjs build "$f" -o "${f%.spec.json}.svg"
done
# The finished example, in the editor's default style like the step figures.
node -e 'const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); delete s.style; console.log(JSON.stringify(s))' \
  examples/2pt_flow.spec.json | node dist-cli/frg.mjs build - -o docs/tutorial/2pt_flow.svg
