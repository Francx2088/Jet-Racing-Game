(function (root) {
  'use strict';
  const yt = root.ytgame;
  const IN_ENV = !!(yt && yt.IN_PLAYABLES_ENV);
  const KEY = 'crazyracers.v2';
  let firstFrameSent = false, readySent = false, lastSaved = null, lastScore = -1;
  const pauseCbs = [], resumeCbs = [], audioCbs = [];

  const withTimeout = (p, ms) => new Promise(res => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; res(null); } }, ms);
    Promise.resolve(p).then(v => { if (!done) { done = true; clearTimeout(t); res(v); } }, () => { if (!done) { done = true; clearTimeout(t); res(null); } });
  });
  const hasLoneSurrogates = s => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

  const P = {
    inYouTube: IN_ENV,

    firstFrameReady() {
      if (firstFrameSent) return; firstFrameSent = true;
      if (IN_ENV) try { yt.game.firstFrameReady(); } catch (e) { P.logError(); }
    },
    gameReady() {
      if (readySent) return;
      P.firstFrameReady(); readySent = true;
      if (IN_ENV) try { yt.game.gameReady(); } catch (e) { P.logError(); }
    },

    load() {
      if (IN_ENV) return withTimeout(yt.game.loadData().catch(() => ''), 4000).then(s => (typeof s === 'string' ? s : ''));
      try { return Promise.resolve(root.localStorage.getItem(KEY) || ''); } catch (e) { return Promise.resolve(''); }
    },
    save(str) {
      if (typeof str !== 'string' || str === lastSaved || hasLoneSurrogates(str)) return Promise.resolve();
      if (str.length > 500 * 1024) { P.logWarning(); return Promise.resolve(); }
      lastSaved = str;
      if (IN_ENV) return yt.game.saveData(str).catch(() => { lastSaved = null; P.logWarning(); });
      try { root.localStorage.setItem(KEY, str); } catch (e) {}
      return Promise.resolve();
    },

    sendScore(value) {
      value = Math.max(0, Math.floor(value));
      if (value <= lastScore) return;
      lastScore = value;
      if (IN_ENV && yt.engagement && yt.engagement.sendScore) yt.engagement.sendScore({ value }).catch(() => P.logWarning());
    },
    setKnownScore(v) { lastScore = Math.max(lastScore, Math.floor(v || 0)); },

    audioEnabled() { if (IN_ENV) try { return yt.system.isAudioEnabled(); } catch (e) { return true; } return true; },
    onAudioChange(cb) { audioCbs.push(cb); },
    onPause(cb) { pauseCbs.push(cb); },
    onResume(cb) { resumeCbs.push(cb); },

    interstitial() {
      if (!(IN_ENV && yt.ads && typeof yt.ads.requestInterstitialAd === 'function')) return Promise.resolve(false);
      let p;
      try { p = yt.ads.requestInterstitialAd(); } catch (e) { P.logWarning(); return Promise.resolve(false); }
      return withTimeout(Promise.resolve(p).then(() => true, () => false), 60000).then(v => !!v);
    },
    language() { if (IN_ENV && yt.system.getLanguage) return withTimeout(yt.system.getLanguage(), 2000).then(l => l || 'en'); return Promise.resolve(navigator.language || 'en'); },

    logError() { if (IN_ENV && yt.health) try { yt.health.logError(); } catch (e) {} },
    logWarning() { if (IN_ENV && yt.health) try { yt.health.logWarning(); } catch (e) {} }
  };

  if (IN_ENV) {
    try { yt.system.onPause(() => pauseCbs.forEach(f => f())); } catch (e) { P.logError(); }
    try { yt.system.onResume(() => resumeCbs.forEach(f => f())); } catch (e) { P.logError(); }
    try { yt.system.onAudioEnabledChange(on => audioCbs.forEach(f => f(on))); } catch (e) { P.logError(); }
    root.addEventListener('error', () => P.logError());
    root.addEventListener('unhandledrejection', () => P.logError());
  }
  root.SkyPlayables = P;
})(window);
