# Sky Racers 🏎️ — Playgama build

Same game as the YouTube Playables build in the repository root. The only differences:

- `index.html` loads the Playgama Bridge SDK from its official CDN (`https://bridge.playgama.com/v2/stable/playgama-bridge.js`) instead of the YouTube Playables SDK.
- `playgama-bridge-config.json` sits next to `index.html` (no ad on start, 60 s minimum between interstitials).
- `playgama.js` replaces `playables.js`. It exposes the same bridge the game calls, so `game.js` and every other file are identical to the root build:
  - `bridge.initialize()` at boot, `platform.sendMessage('game_ready')` once the menu is interactive
  - `gameplay_started` while a race runs, `gameplay_stopped` in menus, results, pause and during ads
  - progress saved with `bridge.storage` (no direct localStorage use)
  - an interstitial (`advertisement.showInterstitial()`) after every race, before the results screen; the game is frozen and silent until the ad is closed or fails. Nothing is shown at game start.
  - `pause_state_changed` / `visibility_state_changed` freeze the game and its audio
  - respects `platform.isAudioEnabled` and `audio_state_changed`

Build the upload zip: `./build.sh` → `dist/sky-racing-playgama.zip`
