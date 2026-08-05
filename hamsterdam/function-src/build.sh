#!/usr/bin/env bash
# Bundle the state function to a single zero-dependency file.
#
# Drag-and-drop deploys never run `npm install`, so anything the function needs
# has to already be inside the file. That was learned the hard way.
#
#   cd hamsterdam/function-src && npm install && ./build.sh
#
# Output: ../demo-site/netlify/functions/state.mjs

set -euo pipefail
cd "$(dirname "$0")"

OUT=../demo-site/netlify/functions/state.mjs

if [ ! -d node_modules ]; then
  echo "node_modules missing — run: npm install" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

./node_modules/.bin/esbuild state.mjs \
  --bundle \
  --platform=node \
  --format=esm \
  --target=node18 \
  --legal-comments=none \
  --banner:js='// HAMSTERDAM state function — GENERATED, DO NOT EDIT.
// Built from function-src/state.mjs with esbuild. Zero dependencies: this file
// runs as-is on a drag-and-drop deploy, where npm install never happens.
// To change it, edit function-src/state.mjs and re-run function-src/build.sh.' \
  --outfile="$OUT"

# The whole point of bundling is that nothing is left to resolve at deploy time.
# Verify it rather than trust it: any bare import here means a broken function
# in a street in Amsterdam.
LEFTOVERS=$(grep -nE '^\s*(import .* from |import )["'"'"'][^."'"'"'/]|require\(["'"'"'][^./]' "$OUT" \
  | grep -v 'node:' || true)

if [ -n "$LEFTOVERS" ]; then
  echo "FAIL: bundled function still has unresolved imports:" >&2
  echo "$LEFTOVERS" >&2
  exit 1
fi

echo "OK  $OUT  ($(wc -c < "$OUT") bytes, zero dependencies)"
