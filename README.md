# Sky Racing 🏎️

A 3D sky-racing browser game (three.js). Open `index.html` through any static server.

- 20 levels, each with its own track, sky, weather, flying scenery, race car and twist
- Cars are lofted race-car bodies (GT3, Le Mans prototype, rally, stock car, touring, hypercar, GT1) with painted liveries
- Controls follow the device: desktop = arrow keys (A/D); landscape phone = two arrow buttons; portrait phone = hold anywhere and slide left/right.
- Nitro comes only from the boost pads on the road; it fires by itself. Slipstreaming gives a small tow but no nitro. Rivals follow exactly the same rules for nitro, crashes and bumps.
- Progress is saved on the platform (YouTube saveData / CrazyGames SDK.data): a new player starts at Track 1, Play continues at the next unlocked track, a top-3 finish unlocks the next one, and racing Track 20 opens free track select.
- Hazards: crates, cones, sliding bars, spinners, gates and lasers.
- Files: `track.js` (track generator), `levels.js` (level data), `world.js` (sky, road, scenery), `cars.js` (car models), `game.js` (gameplay, HUD, audio), `playables.js` (YouTube Playables bridge)
- YouTube Playables: the SDK (`https://www.youtube.com/game_api/v1`) is the first script; `playables.js` handles firstFrameReady → loadData → gameReady, cloud saves via saveData (no localStorage inside YouTube), onPause/onResume (everything stops), the YouTube mute setting, sendScore (total stars), health logging, and an interstitial ad (ytgame.ads.requestInterstitialAd) after every race, before the results screen. No ad is requested at game start: YouTube handles that itself. Fonts are bundled; the game makes no other network requests.
- Build the upload zip: `./tools/build-playables.sh` → `dist/sky-racing-playables.zip`

## Builds

- **YouTube Playables** — this folder (repository root). Upload zip: `./tools/build-playables.sh`.
- **CrazyGames** — [`crazygames/`](crazygames/): the same game with the CrazyGames SDK instead of the Playables SDK. Upload zip: `./crazygames/build.sh`.
