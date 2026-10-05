#!/usr/bin/env sh
# Builds the Playgama upload: dist/sky-racing-playgama.zip (index.html at the zip root).
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist/game/fonts
cp index.html playgama-bridge-config.json three.min.js levels.js track.js world.js cars.js playgama.js game.js dist/game/
cp fonts/*.woff2 fonts/*.txt dist/game/fonts/
(cd dist/game && zip -qr ../sky-racing-playgama.zip .)
echo "dist/sky-racing-playgama.zip: $(du -k dist/sky-racing-playgama.zip | cut -f1) KiB, $(find dist/game -type f | wc -l) files"
