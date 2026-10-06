(function (root) {
  'use strict';
  const KEY = 'crazyracers.v2';
  const pauseCbs = [], resumeCbs = [], audioCbs = [];
  let pg = null, lastSaved = null, lastScore = -1, audioOn = true;
  let platformPaused = false, hidden = false, frozen = false;
  let adListeners = [];

  const withTimeout = (p, ms) => new Promise(res => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; res(null); } }, ms);
    Promise.resolve(p).then(v => { if (!done) { done = true; clearTimeout(t); res(v); } }, () => { if (!done) { done = true; clearTimeout(t); res(null); } });
  });
  const ev = (name, fallback) => (pg && pg.EVENT_NAME && pg.EVENT_NAME[name]) || fallback;

  const syncFreeze = () => {
    const now = platformPaused || hidden;
    if (now === frozen) return;
    frozen = now;
    (now ? pauseCbs : resumeCbs).forEach(f => f());
  };

  const ready = (async () => {
    const B = root.bridge;
    if (!B || typeof B.initialize !== 'function') return null;
    try { await withTimeout(B.initialize(), 8000); } catch (e) { return null; }
    if (!B.platform) return null;
    pg = B;
    try {
      audioOn = B.platform.isAudioEnabled !== false;
      if (!audioOn) audioCbs.forEach(f => f(false));
      B.platform.on(ev('AUDIO_STATE_CHANGED', 'audio_state_changed'), on => { audioOn = !!on; audioCbs.forEach(f => f(audioOn)); });
    } catch (e) {}
    try {
      platformPaused = !!B.platform.isPaused;
      B.platform.on(ev('PAUSE_STATE_CHANGED', 'pause_state_changed'), p => { platformPaused = !!p; syncFreeze(); });
    } catch (e) {}
    try {
      B.platform.on(ev('VISIBILITY_STATE_CHANGED', 'visibility_state_changed'), s => { hidden = s === 'hidden'; syncFreeze(); });
    } catch (e) {}
    try {
      B.advertisement.on(ev('INTERSTITIAL_STATE_CHANGED', 'interstitial_state_changed'), s => adListeners.slice().forEach(f => f(s)));
    } catch (e) {}
    syncFreeze();
    return B;
  })();
  if (root.document) root.document.addEventListener('visibilitychange', () => { hidden = root.document.hidden; syncFreeze(); });

  const P = {
    inYouTube: false,
    inPlaygama: false,

    firstFrameReady() {},
    gameReady() { ready.then(b => { if (b) try { b.platform.sendMessage('game_ready'); } catch (e) {} }); },

    load() {
      return withTimeout(ready, 9000).then(b => {
        if (b && b.storage) return withTimeout(b.storage.get(KEY, false), 5000);
        try { return root.localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
      }).then(v => (typeof v === 'string' ? v : (v && typeof v === 'object' ? JSON.stringify(v) : '')));
    },
    save(str) {
      if (typeof str !== 'string' || str === lastSaved) return Promise.resolve();
      lastSaved = str;
      return ready.then(b => {
        if (b && b.storage) return Promise.resolve(b.storage.set(KEY, str)).catch(() => { lastSaved = null; });
        try { root.localStorage.setItem(KEY, str); } catch (e) {}
      });
    },

    sendScore(value) { lastScore = Math.max(lastScore, Math.floor(value) || 0); },
    setKnownScore(v) { lastScore = Math.max(lastScore, Math.floor(v || 0)); },

    audioEnabled() { return audioOn; },
    onAudioChange(cb) { audioCbs.push(cb); },
    onPause(cb) { pauseCbs.push(cb); },
    onResume(cb) { resumeCbs.push(cb); },

    interstitial() {
      return ready.then(b => {
        if (!b || !b.advertisement || b.advertisement.isInterstitialSupported === false) return false;
        return new Promise(res => {
          let started = false, done = false;
          const finish = v => { if (done) return; done = true; adListeners = adListeners.filter(f => f !== on); clearTimeout(t1); clearTimeout(t2); res(v); };
          const on = s => {
            if (s === 'loading' || s === 'opened') started = true;
            else if (s === 'closed') finish(true);
            else if (s === 'failed') finish(false);
          };
          adListeners.push(on);
          const t1 = setTimeout(() => { if (!started) finish(false); }, 5000);
          const t2 = setTimeout(() => finish(false), 90000);
          try { b.advertisement.showInterstitial(); } catch (e) { finish(false); }
        });
      });
    },

    language() { return ready.then(b => (b && b.platform && b.platform.language) || navigator.language || 'en'); },
    logError() {}, logWarning() {}
  };
  ready.then(b => { P.inPlaygama = !!b; });

  let playing = false;
  setInterval(() => {
    if (!pg) return;
    const st = root.SkyGame && root.SkyGame.state;
    const now = !!st && (st.mode === 'countdown' || st.mode === 'race') && !st.paused && !st.adPause && !st.sysPaused && !root.document.hidden;
    if (now === playing) return;
    playing = now;
    try { pg.platform.sendMessage(now ? 'gameplay_started' : 'gameplay_stopped'); } catch (e) {}
  }, 200);

  root.SkyPlayables = P;
})(window);
