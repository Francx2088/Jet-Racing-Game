#!/usr/bin/env sh
# Builds the CrazyGames upload: dist/crazy-racers-crazygames.zip (index.html at the zip root).
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist/game/fonts dist/game/sounds
cp index.html three.min.js levels.js track.js world.js cars.js crazygames.js game.js dist/game/
cp fonts/*.woff2 fonts/*.txt dist/game/fonts/
cp sounds/*.mp3 dist/game/sounds/
(cd dist/game && zip -qr ../crazy-racers-crazygames.zip .)
echo "dist/crazy-racers-crazygames.zip: $(du -k dist/crazy-racers-crazygames.zip | cut -f1) KiB, $(find dist/game -type f | wc -l) files"
