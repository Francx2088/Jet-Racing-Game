#!/usr/bin/env sh
# Builds the YouTube Playables upload: dist/sky-racers-playables.zip (index.html at the zip root).
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist/game/fonts
cp index.html three.min.js levels.js track.js world.js cars.js playables.js game.js dist/game/
cp fonts/*.woff2 fonts/*.txt dist/game/fonts/
(cd dist/game && zip -qr ../sky-racers-playables.zip .)
echo "dist/sky-racers-playables.zip: $(du -k dist/sky-racers-playables.zip | cut -f1) KiB, $(find dist/game -type f | wc -l) files"
find dist/game -type f -size +512k -exec echo "  note: over 512 KiB (allowed, under 30 MiB):" {} \;
