(function (root) {
  'use strict';
  const KEY = 'crazyracers.v2';
  const pauseCbs = [], resumeCbs = [], audioCbs = [];
  let sdk = null, lastSaved = null, lastScore = -1, muted = false;

  const withTimeout = (p, ms) => new Promise(res => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; res(null); } }, ms);
    Promise.resolve(p).then(v => { if (!done) { done = true; clearTimeout(t); res(v); } }, () => { if (!done) { done = true; clearTimeout(t); res(null); } });
  });

  const ready = (async () => {
    const S = root.CrazyGames && root.CrazyGames.SDK;
    if (!S) return null;
    try { await withTimeout(S.init(), 5000); } catch (e) { return null; }
    if (S.environment === 'disabled') return null;
    sdk = S;
    try { sdk.game.loadingStart(); } catch (e) {}
    try {
      muted = !!(sdk.game.settings && sdk.game.settings.muteAudio);
      if (muted) audioCbs.forEach(f => f(false));
      sdk.game.addSettingsChangeListener(s => { muted = !!(s && s.muteAudio); audioCbs.forEach(f => f(!muted)); });
    } catch (e) {}
    return sdk;
  })();

  const P = {
    inYouTube: false,
    inCrazyGames: false,

    firstFrameReady() {},
    gameReady() { ready.then(s => { if (s) try { s.game.loadingStop(); } catch (e) {} }); },

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
        try { root.localStorage.setItem(KEY, str); } catch (e) {}
      });
    },

    sendScore(value) {
      value = Math.max(0, Math.floor(value));
      if (value <= lastScore) return;
      lastScore = value;
      ready.then(s => { if (s) try { s.game.happytime(); } catch (e) {} });
    },
    setKnownScore(v) { lastScore = Math.max(lastScore, Math.floor(v || 0)); },

    audioEnabled() { return !muted; },
    onAudioChange(cb) { audioCbs.push(cb); },
    onPause(cb) { pauseCbs.push(cb); },
    onResume(cb) { resumeCbs.push(cb); },

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

  let playing = false;
  setInterval(() => {
    if (!sdk) return;
    const st = root.SkyGame && root.SkyGame.state;
    const now = !!st && (st.mode === 'countdown' || st.mode === 'race') && !st.paused && !st.adPause && !st.sysPaused && !document.hidden;
    if (now === playing) return;
    playing = now;
    try { if (now) sdk.game.gameplayStart(); else sdk.game.gameplayStop(); } catch (e) {}
  }, 200);

  root.SkyPlayables = P;
})(window);
