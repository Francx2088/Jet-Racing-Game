#!/usr/bin/env sh
# Builds the CrazyGames upload: dist/sky-racing-crazygames.zip (index.html at the zip root).
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist/game/fonts
cp index.html three.min.js levels.js track.js world.js cars.js crazygames.js game.js dist/game/
cp fonts/*.woff2 fonts/*.txt dist/game/fonts/
(cd dist/game && zip -qr ../sky-racing-crazygames.zip .)
echo "dist/sky-racing-crazygames.zip: $(du -k dist/sky-racing-crazygames.zip | cut -f1) KiB, $(find dist/game -type f | wc -l) files"
