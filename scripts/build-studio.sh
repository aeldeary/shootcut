#!/usr/bin/env bash
# Builds one of the storytold web apps (WebAssembly) into a static folder.
#   usage: scripts/build-studio.sh <source-dir> <repo-name> <out-dir>
# Used by .github/workflows/studios.yml. The apps use either Trunk (apps/<repo>-web/Trunk.toml)
# or their own `cargo xtask web`; both end in a plain static folder.
set -euo pipefail
SRC=$(cd "$1" && pwd); REPO=$2; OUT=$3
mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)
cd "$SRC"

if [ -f "apps/$REPO-web/Trunk.toml" ]; then
  echo "== $REPO: trunk"
  curl -fsSL https://github.com/trunk-rs/trunk/releases/latest/download/trunk-x86_64-unknown-linux-gnu.tar.gz \
    | tar -xz -C "$HOME/.cargo/bin" trunk
  (cd "apps/$REPO-web" && trunk build --release)
  DIST="$SRC/dist/web"
else
  echo "== $REPO: cargo xtask web"
  V=$(grep -A1 '^name = "wasm-bindgen"$' Cargo.lock | sed -n 's/^version = "\(.*\)"/\1/p' | head -1)
  echo "wasm-bindgen $V"
  T=$(mktemp -d)
  if curl -fsSL "https://github.com/wasm-bindgen/wasm-bindgen/releases/download/$V/wasm-bindgen-$V-x86_64-unknown-linux-musl.tar.gz" | tar -xz -C "$T"; then
    cp "$T"/wasm-bindgen-*/wasm-bindgen "$HOME/.cargo/bin/"
  else
    cargo install wasm-bindgen-cli --version "$V" --locked
  fi
  cargo xtask web
  DIST=""
  for c in target/web/dist target/web-site; do
    [ -f "$c/index.html" ] && DIST="$SRC/$c" && break
  done
fi

[ -n "${DIST:-}" ] && [ -f "$DIST/index.html" ] || { echo "no index.html found after the build" >&2; exit 1; }
cp -r "$DIST"/. "$OUT"/
cp LICENSE-MIT LICENSE-APACHE "$OUT"/
[ -f NOTICE ] && cp NOTICE "$OUT/NOTICE"
[ -f ATTRIBUTION.md ] && cp ATTRIBUTION.md "$OUT/ATTRIBUTION.md"
WASM=$(find "$OUT" -maxdepth 1 -name '*.wasm' -printf '%s\n' | sort -n | tail -1)
printf '{"repo":"%s","sha":"%s","builtAt":"%s","wasmBytes":%s}\n' \
  "$REPO" "$(git rev-parse HEAD)" "$(date -u +%FT%TZ)" "${WASM:-0}" > "$OUT/build.json"
echo "done: $(du -sh "$OUT" | cut -f1)"
