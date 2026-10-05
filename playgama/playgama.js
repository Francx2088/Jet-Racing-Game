/* Crazy Racers - Playgama Bridge adapter.
   Drop-in replacement for the YouTube Playables bridge: it exposes the same window.SkyPlayables
   interface the game already calls, so game.js is identical in every build.
     boot           -> bridge.initialize()
     gameReady      -> platform.sendMessage('game_ready')
     load / save    -> bridge.storage (platform cloud / local storage chosen by the Bridge)
     race running   -> 'gameplay_started'; menus, results, pause, ads -> 'gameplay_stopped'
     after a race   -> advertisement.showInterstitial() (game frozen and silent until closed / failed)
     platform pause -> pause_state_changed / visibility_state_changed freeze the game and its audio
     platform mute  -> platform.isAudioEnabled + audio_state_changed
   Outside Playgama (no Bridge loaded) every call falls back to harmless local behaviour. */
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

  // the game freezes (and goes silent) while the platform pauses it or the page is hidden
  const syncFreeze = () => {
    const now = platformPaused || hidden;
    if (now === frozen) return;
    frozen = now;
    (now ? pauseCbs : resumeCbs).forEach(f => f());
  };

  // bridge.initialize() must finish before anything else touches the Bridge
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
    } catch (e) { /* audio state not available */ }
    try {
      platformPaused = !!B.platform.isPaused;
      B.platform.on(ev('PAUSE_STATE_CHANGED', 'pause_state_changed'), p => { platformPaused = !!p; syncFreeze(); });
    } catch (e) { /* pause state not available */ }
    try {
      B.platform.on(ev('VISIBILITY_STATE_CHANGED', 'visibility_state_changed'), s => { hidden = s === 'hidden'; syncFreeze(); });
    } catch (e) { /* visibility state not available */ }
    try {
      B.advertisement.on(ev('INTERSTITIAL_STATE_CHANGED', 'interstitial_state_changed'), s => adListeners.slice().forEach(f => f(s)));
    } catch (e) { /* ads not available */ }
    syncFreeze();
    return B;
  })();
  if (root.document) root.document.addEventListener('visibilitychange', () => { hidden = root.document.hidden; syncFreeze(); });

  const P = {
    inYouTube: false,                       // kept for interface compatibility with the Playables build
    inPlaygama: false,

    firstFrameReady() { /* the Bridge shows the platform loading screen until game_ready */ },
    gameReady() { ready.then(b => { if (b) try { b.platform.sendMessage('game_ready'); } catch (e) { /* ignore */ } }); },

    /** Resolves to the saved string ('' when there is none). Never hangs. */
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
        try { root.localStorage.setItem(KEY, str); } catch (e) { /* ignore */ }
      });
    },

    /** Career star total; only the best value is kept. */
    sendScore(value) { lastScore = Math.max(lastScore, Math.floor(value) || 0); },
    setKnownScore(v) { lastScore = Math.max(lastScore, Math.floor(v || 0)); },

    audioEnabled() { return audioOn; },
    onAudioChange(cb) { audioCbs.push(cb); },
    onPause(cb) { pauseCbs.push(cb); },
    onResume(cb) { resumeCbs.push(cb); },

    /** Interstitial at a natural break: the end of a race. Never at game start (the platform handles
        that and the minimum delay between ads itself). Always resolves, ad or no ad. */
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
          const t1 = setTimeout(() => { if (!started) finish(false); }, 5000);   // nothing happened: carry on
          const t2 = setTimeout(() => finish(false), 90000);                       // never get stuck
          try { b.advertisement.showInterstitial(); } catch (e) { finish(false); }
        });
      });
    },

    language() { return ready.then(b => (b && b.platform && b.platform.language) || navigator.language || 'en'); },
    logError() {}, logWarning() {}
  };
  ready.then(b => { P.inPlaygama = !!b; });

  // gameplay_started / gameplay_stopped follow the race itself: on while a race is running,
  // off in menus, on the results screen, in the pause menu and while an ad plays.
  let playing = false;
  setInterval(() => {
    if (!pg) return;
    const st = root.SkyGame && root.SkyGame.state;
    const now = !!st && (st.mode === 'countdown' || st.mode === 'race') && !st.paused && !st.adPause && !st.sysPaused && !root.document.hidden;
    if (now === playing) return;
    playing = now;
    try { pg.platform.sendMessage(now ? 'gameplay_started' : 'gameplay_stopped'); } catch (e) { /* ignore */ }
  }, 200);

  root.SkyPlayables = P;
})(window);
