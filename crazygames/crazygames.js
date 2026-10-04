/* Sky Racing - CrazyGames bridge (HTML5 SDK v3).
   Drop-in replacement for the YouTube Playables bridge: it exposes the same window.SkyPlayables
   interface the game already calls, so game.js is identical in both builds.
     boot           -> SDK.init(), game.loadingStart()
     gameReady      -> game.loadingStop()
     load / save    -> SDK.data (CrazyGames cloud save, localStorage outside CrazyGames)
     race running   -> game.gameplayStart(); menus, results, pause, ads -> game.gameplayStop()
     after a race   -> ad.requestAd('midgame') (the game is frozen and silent while it plays)
     better result  -> game.happytime()
     mute setting   -> game.settings.muteAudio + addSettingsChangeListener
   Outside CrazyGames (environment 'disabled' or no SDK) every call falls back to harmless local behaviour. */
(function (root) {
  'use strict';
  const KEY = 'skyracing.v2';
  const pauseCbs = [], resumeCbs = [], audioCbs = [];
  let sdk = null, lastSaved = null, lastScore = -1, muted = false;

  const withTimeout = (p, ms) => new Promise(res => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; res(null); } }, ms);
    Promise.resolve(p).then(v => { if (!done) { done = true; clearTimeout(t); res(v); } }, () => { if (!done) { done = true; clearTimeout(t); res(null); } });
  });

  // SDK.init() must finish before anything else touches the SDK
  const ready = (async () => {
    const S = root.CrazyGames && root.CrazyGames.SDK;
    if (!S) return null;
    try { await withTimeout(S.init(), 5000); } catch (e) { return null; }
    if (S.environment === 'disabled') return null;
    sdk = S;
    try { sdk.game.loadingStart(); } catch (e) { /* ignore */ }
    try {
      muted = !!(sdk.game.settings && sdk.game.settings.muteAudio);
      if (muted) audioCbs.forEach(f => f(false));
      sdk.game.addSettingsChangeListener(s => { muted = !!(s && s.muteAudio); audioCbs.forEach(f => f(!muted)); });
    } catch (e) { /* settings not available */ }
    return sdk;
  })();

  const P = {
    inYouTube: false,                       // kept for interface compatibility with the Playables build
    inCrazyGames: false,

    firstFrameReady() { /* loading screen already announced by loadingStart() */ },
    gameReady() { ready.then(s => { if (s) try { s.game.loadingStop(); } catch (e) { /* ignore */ } }); },

    /** Resolves to the saved string ('' when there is none). Never hangs. */
    load() {
      return withTimeout(ready, 6000).then(s => {
        if (s && s.data) { try { return s.data.getItem(KEY) || ''; } catch (e) { return ''; } }
        try { return root.localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
      }).then(v => (typeof v === 'string' ? v : ''));
    },
    save(str) {
      if (typeof str !== 'string' || str === lastSaved) return Promise.resolve();
      lastSaved = str;
      return ready.then(s => {
        if (s && s.data) { try { s.data.setItem(KEY, str); } catch (e) { lastSaved = null; } return; }
        try { root.localStorage.setItem(KEY, str); } catch (e) { /* ignore */ }
      });
    },

    /** Called with the career star total; a new best is a "happy time" moment on CrazyGames. */
    sendScore(value) {
      value = Math.max(0, Math.floor(value));
      if (value <= lastScore) return;
      lastScore = value;
      ready.then(s => { if (s) try { s.game.happytime(); } catch (e) { /* ignore */ } });
    },
    setKnownScore(v) { lastScore = Math.max(lastScore, Math.floor(v || 0)); },

    audioEnabled() { return !muted; },
    onAudioChange(cb) { audioCbs.push(cb); },
    onPause(cb) { pauseCbs.push(cb); },     // CrazyGames has no platform pause; the game's own pause still works
    onResume(cb) { resumeCbs.push(cb); },

    /** Midgame (interstitial) ad at a natural break: the end of a race. CrazyGames handles the
        preroll and ad frequency itself. Always resolves, ad or no ad. */
    interstitial() {
      return ready.then(s => {
        if (!s) return false;
        return withTimeout(new Promise(res => {
          try {
            s.ad.requestAd('midgame', { adStarted: () => {}, adFinished: () => res(true), adError: () => res(false) });
          } catch (e) { res(false); }
        }), 60000).then(v => !!v);
      });
    },

    language() { return Promise.resolve(navigator.language || 'en'); },
    logError() {}, logWarning() {}
  };
  ready.then(s => { P.inCrazyGames = !!s; });

  // gameplayStart / gameplayStop follow the race itself: on while a race is running,
  // off in menus, on the results screen, in the pause menu and while an ad plays.
  let playing = false;
  setInterval(() => {
    if (!sdk) return;
    const st = root.SkyGame && root.SkyGame.state;
    const now = !!st && (st.mode === 'countdown' || st.mode === 'race') && !st.paused && !st.adPause && !st.sysPaused && !document.hidden;
    if (now === playing) return;
    playing = now;
    try { if (now) sdk.game.gameplayStart(); else sdk.game.gameplayStop(); } catch (e) { /* ignore */ }
  }, 200);

  root.SkyPlayables = P;
})(window);
