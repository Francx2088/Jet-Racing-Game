#!/usr/bin/env sh
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist/game/fonts dist/game/sounds
cp index.html three.min.js levels.js track.js world.js cars.js playables.js game.js dist/game/
cp fonts/*.woff2 fonts/*.txt dist/game/fonts/
cp sounds/*.mp3 dist/game/sounds/
(cd dist/game && zip -qr ../crazy-racers-playables.zip .)
echo "dist/crazy-racers-playables.zip: $(du -k dist/crazy-racers-playables.zip | cut -f1) KiB, $(find dist/game -type f | wc -l) files"
find dist/game -type f -size +512k -exec echo "  note: over 512 KiB (allowed, under 30 MiB):" {} \;
