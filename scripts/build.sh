#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== [Discord Voice Notes] Starting Build ==="
cd "${ROOT_DIR}"

mkdir -p dist/plugin dist/types

echo "--> Running TypeScript strict type checking..."
./node_modules/.bin/tsc --noEmit
echo "    [OK] TypeScript typecheck passed."

echo "--> Bundling plugin with esbuild (ESM)..."
./node_modules/.bin/esbuild src/plugin/index.ts \
    --bundle \
    --outfile=dist/plugin/index.js \
    --format=esm \
    --platform=browser \
    --target=es2022 \
    --external:react \
    --external:react-dom
echo "    [OK] ESM bundle generated at dist/plugin/index.js"

echo "--> Bundling plugin with esbuild (CommonJS)..."
./node_modules/.bin/esbuild src/plugin/index.ts \
    --bundle \
    --outfile=dist/plugin/index.cjs \
    --format=cjs \
    --platform=browser \
    --target=es2022 \
    --external:react \
    --external:react-dom
echo "    [OK] CommonJS bundle generated at dist/plugin/index.cjs"

echo "--> Generating TypeScript declaration files..."
./node_modules/.bin/tsc --emitDeclarationOnly
echo "    [OK] Declarations generated at dist/types/"

echo "--> Generating build and source manifest..."
NODE_VER=$(node -v)
TSC_VER=$(./node_modules/.bin/tsc -v)
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat <<EOF > dist/source-manifest.json
{
  "name": "discord-voice-notes",
  "version": "1.0.0",
  "buildDate": "${BUILD_DATE}",
  "nodeVersion": "${NODE_VER}",
  "typescriptVersion": "${TSC_VER}",
  "upstreamReference": {
    "repository": "https://github.com/Vendicated/Vencord",
    "referenceCommit": "16ec4ea838899706019e7f472e45f055070abeb1",
    "discordApiDoc": "https://docs.discord.com/developers/resources/message"
  },
  "targetPlatforms": [
    "Debian GNU/Linux 12 (bookworm) x86_64",
    "Debian GNU/Linux 13 (trixie) x86_64",
    "Kali GNU/Linux Rolling x86_64"
  ],
  "components": [
    "dist/plugin/index.js",
    "dist/plugin/index.cjs",
    "dist/plugin/index.css",
    "dist/types"
  ]
}
EOF
echo "    [OK] Manifest created at dist/source-manifest.json"

echo "=== [Discord Voice Notes] Build Finished Successfully ==="
