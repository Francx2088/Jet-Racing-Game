# Sky Racers 🏎️ — CrazyGames build

Same game as the YouTube Playables build in the repository root. The only differences:

- `index.html` loads the CrazyGames HTML5 SDK v3 (`https://sdk.crazygames.com/crazygames-sdk-v3.js`) instead of the YouTube Playables SDK.
- `crazygames.js` replaces `playables.js`. It exposes the same bridge the game calls, so `game.js` and every other file are identical to the root build:
  - `SDK.init()` at boot, `game.loadingStart()` / `game.loadingStop()` around loading
  - `game.gameplayStart()` while a race runs, `game.gameplayStop()` in menus, results, pause and during ads
  - progress saved with `SDK.data` (CrazyGames cloud save)
  - a `midgame` ad (`ad.requestAd('midgame')`) after every race, before the results screen; the game is frozen and silent while it plays. The preroll at load is handled by CrazyGames itself.
  - `game.happytime()` when the career star total improves
  - respects `game.settings.muteAudio`

Build the upload zip: `./build.sh` → `dist/sky-racing-crazygames.zip`
