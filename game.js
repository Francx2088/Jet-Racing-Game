/* Sky Racing - game logic, input, HUD, audio. */
(function () {
  'use strict';
  const T = THREE;
  const { LEVELS, CARS, AI_COLORS } = window.SkyLevels;
  const TK = window.SkyTrack, DS = TK.DS;
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const V3 = (x, y, z) => new T.Vector3(x, y, z);
  const NAMES = ['Aria', 'Blaze', 'Cobra', 'Dash', 'Echo', 'Fury', 'Ghost', 'Hawk'];

  window.addEventListener('error', e => {
    const d = document.createElement('div'); d.id = 'err'; d.textContent = 'Error: ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno;
    document.body.appendChild(d);
  });

  /* ---------------- save data ---------------- */
  let save = { unlocked: 1, best: {}, sound: true };
  try { const s = JSON.parse(localStorage.getItem('skyracing.v1')); if (s) save = Object.assign(save, s); } catch (e) { /* ignore */ }
  const persist = () => { try { localStorage.setItem('skyracing.v1', JSON.stringify(save)); } catch (e) { /* ignore */ } };

  /* ---------------- renderer ---------------- */
  const canvas = $('c');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  window.SkyMaxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(70, 1, 0.3, 7000);
  scene.add(camera);
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  // speed lines (child of the camera)
  const SL = 70, slPos = new Float32Array(SL * 6), slSeed = [];
  for (let i = 0; i < SL; i++) { const a = Math.random() * 6.28, r = 2.5 + Math.random() * 9; slSeed.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7, z: -(4 + Math.random() * 56) }); }
  const slGeo = new T.BufferGeometry(); slGeo.setAttribute('position', new T.BufferAttribute(slPos, 3));
  const slMat = new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const speedLines = new T.LineSegments(slGeo, slMat); speedLines.frustumCulled = false; camera.add(speedLines);

  // sparks
  const SP = 60, spPos = new Float32Array(SP * 3), spVel = [], spLife = new Float32Array(SP);
  for (let i = 0; i < SP; i++) spVel.push(V3(0, 0, 0));
  const spGeo = new T.BufferGeometry(); spGeo.setAttribute('position', new T.BufferAttribute(spPos, 3));
  const sparks = new T.Points(spGeo, new T.PointsMaterial({ color: 0xffc060, size: 0.35, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
  sparks.frustumCulled = false; scene.add(sparks);
  let spIdx = 0;
  function emitSparks(p, n, vel, spread) {
    for (let k = 0; k < n; k++) {
      const i = spIdx++ % SP; spLife[i] = 0.35 + Math.random() * 0.35;
      spPos[i * 3] = p.x; spPos[i * 3 + 1] = p.y; spPos[i * 3 + 2] = p.z;
      spVel[i].set((Math.random() - 0.5) * spread, Math.random() * spread * 0.6, (Math.random() - 0.5) * spread).add(vel);
    }
  }
  function updateSparks(dt) {
    for (let i = 0; i < SP; i++) {
      if (spLife[i] <= 0) { spPos[i * 3 + 1] = -99999; continue; }
      spLife[i] -= dt; spVel[i].y -= 18 * dt;
      spPos[i * 3] += spVel[i].x * dt; spPos[i * 3 + 1] += spVel[i].y * dt; spPos[i * 3 + 2] += spVel[i].z * dt;
    }
    spGeo.attributes.position.needsUpdate = true;
  }

  /* ---------------- audio ---------------- */
  const audio = {
    ctx: null, eng: null, wind: null,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try {
        const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
        const ctx = this.ctx = new C();
        this.master = ctx.createGain(); this.master.gain.value = save.sound ? 0.6 : 0; this.master.connect(ctx.destination);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(this.master);
        this.engGain = ctx.createGain(); this.engGain.gain.value = 0; this.engGain.connect(lp);
        this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth'; this.o1.frequency.value = 60;
        this.o2 = ctx.createOscillator(); this.o2.type = 'square'; this.o2.frequency.value = 30;
        this.o1.connect(this.engGain); this.o2.connect(this.engGain); this.o1.start(); this.o2.start();
        const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true;
        this.hp = ctx.createBiquadFilter(); this.hp.type = 'bandpass'; this.hp.frequency.value = 900; this.hp.Q.value = 0.6;
        this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
        ns.connect(this.hp); this.hp.connect(this.windGain); this.windGain.connect(this.master); ns.start();
      } catch (e) { this.ctx = null; }
    },
    setMute(m) { save.sound = !m; persist(); if (this.master) this.master.gain.value = m ? 0 : 0.6; },
    tone(freq, dur, type, vol, slideTo) {
      if (!this.ctx || !save.sound) return;
      const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
    },
    engine(frac, boost, on) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.o1.frequency.setTargetAtTime(48 + frac * 150 + (boost ? 25 : 0), t, 0.06);
      this.o2.frequency.setTargetAtTime(24 + frac * 75, t, 0.06);
      this.engGain.gain.setTargetAtTime(on ? 0.08 + frac * 0.07 : 0, t, 0.1);
      this.windGain.gain.setTargetAtTime(on ? frac * frac * 0.32 + (boost ? 0.12 : 0) : 0, t, 0.1);
      this.hp.frequency.setTargetAtTime(500 + frac * 1800, t, 0.1);
    },
    beep(go) { this.tone(go ? 880 : 520, go ? 0.5 : 0.18, 'square', 0.12); },
    ding(n) { this.tone(660 + n * 70, 0.18, 'triangle', 0.18, 990 + n * 70); },
    boost() { this.tone(180, 0.6, 'sawtooth', 0.14, 700); },
    ring() { this.tone(520, 0.4, 'sine', 0.2, 1040); },
    crash() { this.tone(120, 0.35, 'sawtooth', 0.25, 40); },
    fin() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'triangle', 0.2), i * 120)); }
  };

  /* ---------------- input ---------------- */
  // Desktop: arrow keys. Landscape phone: two arrow buttons. Portrait phone: a thumb slider.
  const input = { left: false, right: false, kl: false, kr: false, boost: false, analog: 0 };
  let touchSeen = false;
  function isTouchDevice() {
    const mm = q => window.matchMedia && window.matchMedia(q).matches;
    return touchSeen || mm('(pointer: coarse)') || (navigator.maxTouchPoints > 0 && !mm('(pointer: fine)'));
  }
  function applyLayout() {
    const cls = !isTouchDevice() ? 'ctl-desktop' : window.innerHeight > window.innerWidth ? 'ctl-portrait' : 'ctl-landscape';
    const b = document.body;
    ['ctl-desktop', 'ctl-portrait', 'ctl-landscape'].forEach(c => b.classList.toggle(c, c === cls));
    state.layout = cls;
  }
  window.addEventListener('resize', applyLayout);
  window.addEventListener('orientationchange', () => setTimeout(applyLayout, 200));
  window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && !touchSeen) { touchSeen = true; applyLayout(); } audio.init(); });
  window.addEventListener('contextmenu', e => e.preventDefault());
  const isLeft = k => k === 'ArrowLeft' || k === 'a' || k === 'A', isRight = k => k === 'ArrowRight' || k === 'd' || k === 'D';
  const isBoost = k => k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'Shift';
  window.addEventListener('keydown', e => {
    audio.init();
    if (isLeft(e.key)) input.kl = true;
    if (isRight(e.key)) input.kr = true;
    if (isBoost(e.key)) input.boost = true;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') togglePause();
    if (e.key === 'Enter' && state.mode === 'menu') startLevel(Math.min(save.unlocked, 8) - 1);
  });
  window.addEventListener('keyup', e => {
    if (isLeft(e.key)) input.kl = false;
    if (isRight(e.key)) input.kr = false;
    if (isBoost(e.key)) input.boost = false;
  });
  window.addEventListener('blur', () => { input.kl = input.kr = input.boost = false; });

  // boost button
  const boostBtn = $('boost');
  boostBtn.addEventListener('pointerdown', e => { e.preventDefault(); boostBtn.setPointerCapture(e.pointerId); input.boost = true; boostBtn.classList.add('down'); audio.init(); });
  const boostUp = () => { input.boost = false; boostBtn.classList.remove('down'); };
  boostBtn.addEventListener('pointerup', boostUp); boostBtn.addEventListener('pointercancel', boostUp); boostBtn.addEventListener('lostpointercapture', boostUp);

  // landscape: left / right arrow buttons (slide a thumb from one to the other)
  const arrows = $('arrows'), btnL = $('btnL'), btnR = $('btnR');
  let arrowId = null;
  function arrowSet(e) {
    const r = arrows.getBoundingClientRect(), left = e.clientX - r.left < r.width / 2;
    input.left = left; input.right = !left; btnL.classList.toggle('on', left); btnR.classList.toggle('on', !left);
  }
  function arrowClear() { arrowId = null; input.left = input.right = false; btnL.classList.remove('on'); btnR.classList.remove('on'); }
  arrows.addEventListener('pointerdown', e => { e.preventDefault(); arrows.setPointerCapture(e.pointerId); arrowId = e.pointerId; arrowSet(e); audio.init(); });
  arrows.addEventListener('pointermove', e => { if (e.pointerId === arrowId) arrowSet(e); });
  arrows.addEventListener('pointerup', e => { if (e.pointerId === arrowId) arrowClear(); });
  arrows.addEventListener('pointercancel', arrowClear); arrows.addEventListener('lostpointercapture', arrowClear);

  // portrait: thumb slider. The farther the knob is dragged, the harder the car steers.
  const pad = $('steerPad'), knob = $('steerKnob');
  let padId = null;
  function padSet(e) {
    const r = pad.getBoundingClientRect(), max = r.width / 2 - 46;
    const off = clamp(e.clientX - (r.left + r.width / 2), -max, max), v = off / max;
    knob.style.transform = 'translateX(' + off + 'px)';
    input.analog = Math.abs(v) < 0.06 ? 0 : Math.sign(v) * (0.55 * Math.abs(v) + 0.45 * v * v);
  }
  function padClear() { padId = null; input.analog = 0; knob.style.transition = 'transform .12s'; knob.style.transform = 'translateX(0)'; }
  pad.addEventListener('pointerdown', e => { e.preventDefault(); pad.setPointerCapture(e.pointerId); padId = e.pointerId; knob.style.transition = 'none'; padSet(e); audio.init(); });
  pad.addEventListener('pointermove', e => { if (e.pointerId === padId) padSet(e); });
  pad.addEventListener('pointerup', e => { if (e.pointerId === padId) padClear(); });
  pad.addEventListener('pointercancel', padClear); pad.addEventListener('lostpointercapture', padClear);

  /* ---------------- game state ---------------- */
  const state = { mode: 'menu', levelIdx: 0, world: null, cars: [], player: null, time: 0, raceT: 0, countT: 0, finishT: 0, paused: false, autopilot: false, resultShown: false };
  applyLayout();
  const fr = { p: V3(0, 0, 0), f: V3(0, 0, -1), u: V3(0, 1, 0), r: V3(1, 0, 0), k: 0, i: 0 };
  function frameAt(s, o) {
    const tr = state.world.track, n = tr.n;
    let x = Math.max(0, s / DS); const i = Math.min(Math.floor(x), n - 2), t = Math.min(1, x - i);
    const P = tr.P, F = tr.F, U = tr.U, a = i * 3, b = a + 3;
    o.p.set(lerp(P[a], P[b], t), lerp(P[a + 1], P[b + 1], t), lerp(P[a + 2], P[b + 2], t));
    o.f.set(lerp(F[a], F[b], t), lerp(F[a + 1], F[b + 1], t), lerp(F[a + 2], F[b + 2], t)).normalize();
    o.u.set(lerp(U[a], U[b], t), lerp(U[a + 1], U[b + 1], t), lerp(U[a + 2], U[b + 2], t));
    o.u.addScaledVector(o.f, -o.u.dot(o.f)).normalize();
    o.r.crossVectors(o.f, o.u);
    o.k = tr.kappa[i]; o.i = i;
    return o;
  }

  /* ---------------- level / race setup ---------------- */
  function loadWorld(idx) {
    if (state.world && state.levelIdx === idx && state.world.built) return;
    if (state.world) { scene.remove(state.world.group); state.world.dispose(); }
    state.cars.forEach(c => { scene.remove(c.mesh); window.SkyCars.dispose(c.mesh); }); state.cars = [];
    const w = SkyWorld.build(idx, renderer);
    w.built = true;
    scene.add(w.group);
    scene.fog = new T.Fog(SkyWorld.lin(w.th.fog.color), w.th.fog.near, w.th.fog.far);
    renderer.setClearColor(SkyWorld.lin(w.th.fog.color));
    renderer.toneMappingExposure = w.th.exposure;
    state.world = w; state.levelIdx = idx;
    drawMini();
  }

  function makeCar(style, color, isPlayer, name) {
    const w = state.world;
    const mesh = window.SkyCars.build(style, color, { env: w.env, detail: isPlayer ? 'high' : 'low', glow: isPlayer ? w.th.road.edge : color });
    scene.add(mesh);
    return { mesh, parts: mesh.userData.parts, dims: mesh.userData.dims, style, color, isPlayer, name, s: 0, lat: 0, latV: 0, speed: 0, steerS: 0, boostT: 0, nitro: 40, nitroOn: false,
      fr: 0, padTarget: null, padSeen: new Set(), aiBurn: false, react: 60, padSeek: 0.8, margin: 1.4, rnd: Math.random, yawVis: 0, spin: 0, hitCd: 0, padCd: 0, finished: false, finishTime: 0, skill: 1, lane0: 0, laneF: 1, laneAmp: 0, ph: 0, wheelRot: 0, scrape: 0, draft: 0, combo: 0 };
  }

  function spawnRace(demo) {
    const w = state.world, L = w.L;
    state.cars.forEach(c => { scene.remove(c.mesh); window.SkyCars.dispose(c.mesh); }); state.cars = [];
    const cars = [];
    const pStyle = CARS[L.car];
    const player = makeCar(pStyle, pStyle.color, true, 'YOU');
    cars.push(player);
    const rnd = TK.mulberry(L.id * 31 + (demo ? 5 : Math.floor(Math.random() * 1000)));
    const styleIdx = [...CARS.keys()].filter(k => k !== L.car).sort(() => rnd() - 0.5);
    for (let i = 0; i < L.ai; i++) {
      const st = CARS[styleIdx[i % styleIdx.length]], col = AI_COLORS[(i * 3 + L.id) % AI_COLORS.length];
      const c = makeCar(st, col, false, NAMES[(i + L.id) % NAMES.length]);
      c.skill = L.aiSkill + (rnd() - 0.6) * 0.05 + (i === 0 ? 0.015 : 0);
      c.lane0 = (rnd() - 0.5) * L.width * 0.5; c.laneF = 0.3 + rnd() * 0.5; c.laneAmp = L.width * (0.04 + rnd() * 0.08); c.ph = rnd() * 6.28;
      c.react = 42 + rnd() * 60; c.padSeek = 0.55 + rnd() * 0.4; c.margin = 1.2 + rnd() * 0.5; c.rnd = rnd; c.nitro = 30 + rnd() * 20;
      cars.push(c);
    }
    // grid: 2 columns x 3 rows, player somewhere in the back half
    const slots = []; for (let r = 0; r < 3; r++) for (const sx of [-1, 1]) slots.push({ s: w.track.startS - 8 - r * 11, lat: sx * L.width * 0.2 });
    const order = [0, 1, 2, 3, 4, 5];
    const pSlot = 3 + Math.floor(rnd() * 3);
    const ais = cars.slice(1); let ai = 0;
    cars.forEach((c, idx) => {
      const slot = idx === 0 ? slots[pSlot] : slots[order.filter(o => o !== pSlot)[ai++]];
      c.s = slot.s; c.lat = slot.lat; c.speed = 0;
      if (demo) { c.s = w.track.startS + 40 + (cars.length - idx) * 22; c.speed = L.base * 0.9; }
    });
    state.cars = cars; state.player = player;
    state.raceT = 0; state.finishT = 0; state.resultShown = false;
    // stats
    state.stats = { boosts: 0, crashes: 0, top: 0 };
  }

  /* ---------------- gameplay update ---------------- */
  const CENT = 0.2;
  function hazardsAhead(c, ahead) {
    const out = [];
    for (const ob of state.world.feats.obst) { const d = ob.i * DS - c.s; if (d > -3 && d < ahead) out.push(ob); }
    return out;
  }
  // choose a lateral target that stays out of every blocked span (evaluated for when the car arrives)
  function freeLane(c, laneT, halfW, margin) {
    const w = state.world, t = state.time, spans = [];
    for (const ob of hazardsAhead(c, c.react)) {
      const eta = Math.max(0, (ob.i * DS - c.s) / Math.max(c.speed, 25));
      for (const sp of w.blocked(ob, t + eta)) spans.push([sp[0] - margin, sp[1] + margin]);
    }
    if (!spans.length) return laneT;
    spans.sort((x, y) => x[0] - y[0]);
    const lo = -halfW + 0.4, hi = halfW - 0.4, segs = []; let cur = lo;
    for (const [x, y] of spans) { if (x > cur) segs.push([cur, Math.min(x, hi)]); cur = Math.max(cur, y); }
    if (cur < hi) segs.push([cur, hi]);
    let best = laneT, bd = 1e9;
    for (const sg of segs) {
      if (sg[1] - sg[0] < 0.2) continue;
      const x = clamp(laneT, sg[0], sg[1]), d = Math.abs(x - laneT) + Math.abs(x - c.lat) * 0.15;
      if (d < bd) { bd = d; best = x; }
    }
    return best;
  }

  function stepCar(c, dt, drive) {
    const w = state.world, L = w.L, tr = w.track, M = L.mech;
    frameAt(c.s, fr);
    const halfW = L.width / 2 - 1.15;
    const kAhead = tr.kappa[Math.min(tr.n - 2, Math.floor(c.s / DS) + 14)] || 0;
    // ---- lateral ----
    if (c.isPlayer && !drive) {
      const want = input.analog ? clamp(input.analog, -1, 1) : clamp((input.right || input.kr ? 1 : 0) - (input.left || input.kl ? 1 : 0), -1, 1);
      c.steerS += (want - c.steerS) * (1 - Math.exp(-11 * dt));
      const grip = clamp(0.55 + c.speed / 220, 0.55, 1.0);
      c.latV += c.steerS * 52 * grip * (M.ice ? 0.75 : 1) * dt;
      c.latV += -fr.k * c.speed * c.speed * CENT * dt;
      if (M.gust) c.latV += Math.sin(state.time * 0.9 + c.s * 0.004) * Math.sin(state.time * 2.3 + 1.7) * M.gust * dt * 1.9 * (0.6 + 0.4 * Math.sin(c.s * 0.0013));
      c.latV *= Math.exp(-(M.ice ? 1.7 : 3.6) * dt);
      c.latV = clamp(c.latV, -30, 30);
      c.lat += c.latV * dt;
    } else {
      // rivals: wander in their lane, chase boost pads, then steer around hazards and other cars
      let laneT = c.lane0 + Math.sin(state.time * c.laneF + c.ph) * c.laneAmp;
      if (!state.demo) {
        if (!c.padTarget || c.padTarget.i * DS < c.s - 4) {
          c.padTarget = null;
          for (const p of w.feats.pads) {
            const d = p.i * DS - c.s;
            if (d > 12 && d < 160) { if (!c.padSeen.has(p)) { c.padSeen.add(p); if (c.rnd() < c.padSeek) c.padTarget = p; } break; }
          }
        }
        if (c.padTarget) laneT = c.padTarget.lat;
      }
      laneT = clamp(laneT, -halfW + 0.5, halfW - 0.5);
      laneT = freeLane(c, laneT, halfW, c.margin);
      for (const o of state.cars) {
        if (o === c) continue; const d = o.s - c.s;
        if (d > 0 && d < 16 && Math.abs(o.lat - c.lat) < 2.4) laneT = clamp(c.lat + (c.lat >= o.lat ? 1 : -1) * 3.2, -halfW + 0.5, halfW - 0.5);
      }
      const prev = c.lat;
      c.lat += clamp((laneT - c.lat) * 2.6, -15, 15) * dt;
      c.latV = (c.lat - prev) / Math.max(dt, 1e-4);
    }
    // walls
    if (Math.abs(c.lat) > halfW) {
      const sgn = Math.sign(c.lat);
      c.lat = sgn * halfW;
      if (c.latV * sgn > 3 && c.isPlayer) {
        c.speed -= c.speed * 0.55 * dt * 2.2;
        c.scrape = 0.15;
        emitSparks(V3(fr.p.x + fr.r.x * (c.lat + sgn * 0.9), fr.p.y + fr.r.y * (c.lat + sgn * 0.9) + 0.5, fr.p.z + fr.r.z * (c.lat + sgn * 0.9)), 2, V3(-fr.f.x * c.speed * 0.2, 2, -fr.f.z * c.speed * 0.2), 6);
        if (!c.wallT || state.time - c.wallT > 0.6) { audio.tone(300, 0.1, 'sawtooth', 0.08, 120); c.wallT = state.time; }
      }
      c.latV = -c.latV * 0.2;
    }
    // ---- speed ----
    let target = L.base * (c.isPlayer ? 1 : c.skill);
    const racing = state.mode === 'race';
    if (!c.isPlayer && !state.demo) {
      const p = state.player, lead = p.s - c.s;           // > 0: rival is behind the player
      if (lead > 30) target *= 1 + Math.min(L.aiRubber * 1.8, (lead - 30) / 500);
      else if (lead < -80) target *= 1 - Math.min(0.04, (-lead - 80) / 2500);
      target *= 1 - Math.min(0.07, Math.abs(kAhead) * 34);
    }
    // rival nitro: a meter fed by pads and time, burned on clear straights
    if (!c.isPlayer && !state.demo && racing) {
      c.nitro = Math.min(100, c.nitro + 3.5 * dt);
      const clear = Math.abs(kAhead) < 0.004 && hazardsAhead(c, 60).length === 0;
      if (!c.aiBurn && c.nitro >= 25 && clear) c.aiBurn = true;
      if (c.aiBurn) { c.nitro -= 30 * dt; if (c.nitro < 3 || Math.abs(kAhead) > 0.007) c.aiBurn = false; }
      c.nitroOn = c.aiBurn;
    }
    const padOn = c.boostT > 0;
    if (padOn) c.boostT -= dt;
    if (c.isPlayer) {
      if (padOn) target *= 1.34;
      c.nitroOn = false;
      if (racing) {
        if ((input.boost || (state.autopilot && c.nitro > 15)) && c.nitro > 0) { c.nitroOn = true; c.nitro = Math.max(0, c.nitro - 30 * dt); target *= 1.45; }
        c.nitro = Math.min(100, c.nitro + (M.regen || 2) * dt);
      }
    } else if (padOn || c.nitroOn) target *= 1.28;
    target *= 1 - fr.f.y * 0.1;
    if (c.draft > 0) target *= 1.05;
    const acc = c.nitroOn || padOn ? 2.6 : (c.speed < target ? 1.35 : 0.8);
    c.speed += (target - c.speed) * (1 - Math.exp(-acc * dt));
    c.s += c.speed * dt;
    c.fr = Math.min(tr.n - 2, Math.floor(c.s / DS));
    c.scrape = Math.max(0, c.scrape - dt);
    c.hitCd = Math.max(0, c.hitCd - dt); c.padCd = Math.max(0, c.padCd - dt);
    if (c.spin > 0) c.spin = Math.max(0, c.spin - dt / 0.9);
  }

  // boost pads work for every car; hazards hurt every car
  function pickups(c) {
    const w = state.world, F = w.feats, t = state.time, st = state.stats;
    const idx = c.s / DS;
    for (const p of F.pads) {
      if (Math.abs(p.i - idx) < 5 && Math.abs(c.lat - p.lat) < 4.2 && c.padCd <= 0) {
        c.padCd = 1.0; c.boostT = 1.8; c.nitro = Math.min(100, c.nitro + 20);
        if (c.isPlayer) { st.boosts++; toast('BOOST!', '#ffe45c'); audio.boost(); kick(0.5); }
      }
    }
    if (c.hitCd > 0) return;
    for (const o of F.obst) {
      if (Math.abs(o.i - idx) > 1.6) continue;
      for (const sp of w.blocked(o, t)) {
        if (c.lat > sp[0] - 1.0 && c.lat < sp[1] + 1.0) {
          const soft = o.type === 'cones';
          c.hitCd = soft ? 0.6 : 1.3; c.speed *= soft ? 0.82 : (o.type === 'laser' ? 0.55 : 0.45); c.spin = soft ? 0 : 1;
          if (c.isPlayer) { c.nitro = Math.max(0, c.nitro - (soft ? 3 : 10)); st.crashes++; toast(soft ? 'BUMP' : 'CRASH!', '#ff5a3a'); audio.crash(); kick(soft ? 0.4 : 1); }
          else { c.nitro = Math.max(0, c.nitro - 15); c.aiBurn = false; }
          frameAt(c.s, fr); emitSparks(V3(fr.p.x + fr.r.x * c.lat, fr.p.y + 1, fr.p.z + fr.r.z * c.lat), soft ? 8 : 24, V3(0, 4, 0), 14);
          return;
        }
      }
    }
  }

  function carCollisions(dt) {
    const cars = state.cars;
    for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
      const A = cars[a], B = cars[b], ds = A.s - B.s;
      if (Math.abs(ds) < 4.4 && Math.abs(A.lat - B.lat) < 2.1) {
        const push = (A.lat >= B.lat ? 1 : -1) * 7 * dt;
        A.lat += push; B.lat -= push;
        const back = ds < 0 ? A : B;
        if (back.isPlayer) { back.speed -= back.speed * 0.5 * dt; if (!back.bumpT || state.time - back.bumpT > 0.5) { audio.tone(200, 0.08, 'square', 0.08, 90); back.bumpT = state.time; emitSparks(back.mesh.position, 4, V3(0, 2, 0), 6); } }
        else back.speed -= back.speed * 0.6 * dt;
      }
    }
  }

  function drafting() {
    const p = state.player, M = state.world.L.mech;
    p.draft = 0;
    for (const o of state.cars) {
      if (o === p) continue; const d = o.s - p.s;
      if (d > 3 && d < 20 && Math.abs(o.lat - p.lat) < 2.8) { p.draft = 1; p.nitro = Math.min(100, p.nitro + (M.draft || 8) * state.dt); }
    }
    if (p.draft && (!p.draftToast || state.time - p.draftToast > 2.5)) { toast('SLIPSTREAM', '#9fe7ff'); p.draftToast = state.time; }
  }

  function ranking() {
    return state.cars.slice().sort((a, b) => (a.finished && b.finished) ? a.finishTime - b.finishTime : a.finished ? -1 : b.finished ? 1 : b.s - a.s);
  }

  /* ---------------- placing car meshes ---------------- */
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _q2 = new T.Quaternion(), _e = new T.Euler(), _v = V3(0, 0, 0), _z = V3(0, 0, 0);
  function placeCar(c, dt) {
    frameAt(c.s, fr);
    const lift = 0.0;
    c.mesh.position.set(fr.p.x + fr.r.x * c.lat + fr.u.x * lift, fr.p.y + fr.r.y * c.lat + fr.u.y * lift, fr.p.z + fr.r.z * c.lat + fr.u.z * lift);
    _m.makeBasis(fr.r, fr.u, _z.copy(fr.f).negate());
    _q.setFromRotationMatrix(_m);
    const yaw = -c.latV * 0.011 + c.spin * c.spin * Math.PI * 4 * (c.spin > 0 ? 1 : 0);
    c.yawVis += (yaw - c.yawVis) * (1 - Math.exp(-14 * dt));
    _q2.setFromEuler(_e.set(0, c.yawVis, c.latV * 0.003 + (c.latV < 0 ? 0 : 0)));
    c.mesh.quaternion.copy(_q).multiply(_q2);
    c.wheelRot -= c.speed * dt / c.dims.wr;
    c.parts.wheels.forEach(w => { w.rotation.x = c.wheelRot; });
    const fl = c.nitroOn || c.boostT > 0 ? 1 : (c.speed > 25 ? 0.14 : 0);
    c.parts.flames.forEach(f => { f.scale.z = fl * (3.2 + Math.random() * 1.2) + 0.01; f.position.z = c.dims.L * 0.99 + 0.5 * f.scale.z; f.scale.x = f.scale.y = 1 + fl * 0.6; f.material.color.setHex(c.nitroOn || c.boostT > 0 ? 0x4fd8ff : 0xffa73a); });
  }

  /* ---------------- camera ---------------- */
  const cam = { pos: V3(), look: V3(), up: V3(0, 1, 0), fov: 70, shake: 0, init: false };
  const _a = V3(), _b = V3(), _c = V3(), _vel = V3(), _prev = V3();
  function kick(a) { cam.shake = Math.max(cam.shake, a); }
  function updateCamera(dt) {
    const p = state.player, w = state.world;
    frameAt(p.s, fr);
    const car = p.mesh.position;
    let desiredPos, lookAt, up = _c.copy(fr.u), fovT;
    const sf = clamp(p.speed / (w.L.base * 1.3), 0, 1.2);
    if (state.mode === 'menu') {
      const t = state.time;
      frameAt(state.leadS, fr);
      const base = fr.p;
      desiredPos = _a.copy(base).addScaledVector(fr.f, -12 - Math.sin(t * 0.17) * 5).addScaledVector(fr.r, Math.sin(t * 0.23) * 9).addScaledVector(fr.u, 4.5 + Math.sin(t * 0.31) * 1.5);
      lookAt = _b.copy(base).addScaledVector(fr.f, 8).addScaledVector(fr.u, 1.5);
      fovT = 62; up.copy(fr.u);
    } else if (state.mode === 'countdown') {
      const k = clamp(state.countT / 3.4, 0, 1);       // 0 = start of intro, 1 = GO
      const e = k * k * (3 - 2 * k);
      const ang = (1 - e) * 2.4, rad = lerp(10, 9, e), hgt = lerp(3.4, 3.6, e);
      desiredPos = _a.copy(car).addScaledVector(fr.f, -Math.cos(ang) * rad).addScaledVector(fr.r, Math.sin(ang) * rad).addScaledVector(fr.u, hgt + (1 - e) * 2);
      lookAt = _b.copy(car).addScaledVector(fr.f, 4 * e).addScaledVector(fr.u, 1.1);
      fovT = lerp(52, 66, e);
    } else if (state.mode === 'finish') {
      const t = state.finishT;
      desiredPos = _a.copy(car).addScaledVector(fr.f, -9 + t * 2.4).addScaledVector(fr.r, 7 - t * 1.2).addScaledVector(fr.u, 3 + t * 0.4);
      lookAt = _b.copy(car).addScaledVector(fr.u, 1);
      fovT = 62;
    } else {
      const back = 8.2 + sf * 1.2 + (p.nitroOn || p.boostT > 0 ? 1.4 : 0), h = 3.1 + sf * 0.2;
      desiredPos = _a.copy(car).addScaledVector(fr.f, -back).addScaledVector(fr.u, h).addScaledVector(fr.r, -p.lat * 0.18);
      lookAt = _b.copy(car).addScaledVector(fr.f, 13).addScaledVector(fr.u, 1.2);
      fovT = 66 + sf * 14 + (p.nitroOn || p.boostT > 0 ? 12 : 0);
    }
    if (state.debugCam) { const o = state.debugCam; desiredPos = _a.copy(car).addScaledVector(fr.r, o[0]).addScaledVector(fr.u, o[1]).addScaledVector(fr.f, o[2]); lookAt = _b.copy(car).addScaledVector(fr.u, 0.7); fovT = o[3] || 45; cam.init = false; }
    if (!cam.init) { cam.pos.copy(desiredPos); cam.look.copy(lookAt); cam.up.copy(up); cam.fov = fovT; cam.init = true; }
    const kp = state.mode === 'race' ? 1 - Math.exp(-13 * dt) : 1 - Math.exp(-6 * dt);
    cam.pos.lerp(desiredPos, kp); cam.look.lerp(lookAt, 1 - Math.exp(-14 * dt)); cam.up.lerp(up, 1 - Math.exp(-5 * dt)).normalize(); cam.fov += (fovT - cam.fov) * (1 - Math.exp(-4 * dt));
    camera.position.copy(cam.pos);
    if (cam.shake > 0.001) { const s = cam.shake * 0.35; camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s; cam.shake *= Math.exp(-7 * dt); }
    camera.up.copy(cam.up);
    camera.lookAt(cam.look);
    const portrait = camera.aspect < 1;
    camera.fov = portrait ? clamp(cam.fov * 1.32, 60, 100) : cam.fov;
    // lift the scene so the car sits above the dashboard and controls
    const shift = state.mode === 'menu' ? 0 : state.layout === 'ctl-landscape' ? 0.17 : state.layout === 'ctl-portrait' ? 0.07 : 0.11;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (shift) camera.setViewOffset(vw, vh, 0, Math.round(vh * shift), vw, vh); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    // camera velocity for weather streaks
    _vel.copy(camera.position).sub(_prev).divideScalar(Math.max(dt, 1e-3)); _prev.copy(camera.position);
  }
  function updateSpeedLines(dt) {
    const p = state.player, spd = state.mode === 'race' || state.mode === 'menu' ? p.speed : 0;
    const f = clamp((spd - 30) / 90, 0, 1) + (p.nitroOn || p.boostT > 0 ? 0.4 : 0);
    slMat.opacity = clamp(f * 0.35, 0, 0.5);
    const len = 2 + spd * 0.06;
    for (let i = 0; i < SL; i++) {
      const s = slSeed[i]; s.z += spd * dt * 0.9; if (s.z > -2) s.z = -60 - Math.random() * 10;
      slPos[i * 6] = s.x; slPos[i * 6 + 1] = s.y; slPos[i * 6 + 2] = s.z;
      slPos[i * 6 + 3] = s.x; slPos[i * 6 + 4] = s.y; slPos[i * 6 + 5] = s.z - len;
    }
    slGeo.attributes.position.needsUpdate = true;
  }

  /* ---------------- HUD ---------------- */
  const hud = { pos: $('pos'), time: $('time'), toast: $('toast'), count: $('count'), vig: $('vig'), flash: $('flash'), lvl: $('lvlname'), intro: $('intro'), top: $('topSpeed') };
  let lastPos = -1;
  function toast(txt, color) { hud.toast.textContent = txt; hud.toast.style.color = color || '#fff'; hud.toast.classList.remove('show'); void hud.toast.offsetWidth; hud.toast.classList.add('show'); }
  function flash(a) { hud.flash.style.opacity = a; setTimeout(() => { hud.flash.style.opacity = 0; }, 90); }
  const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };

  // --- gauges: a speedometer (270 degree sweep, red line near the limit) and a nitro "gas" gauge ---
  const MAXK = 400, REDK = 320, KMH = 2.0;
  const pt = (cx, cy, r, deg) => [cx + r * Math.sin(deg * Math.PI / 180), cy - r * Math.cos(deg * Math.PI / 180)];
  const arc = (cx, cy, r, d0, d1) => { const a = pt(cx, cy, r, d0), b = pt(cx, cy, r, d1); return 'M' + a[0].toFixed(2) + ' ' + a[1].toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + (d1 - d0 > 180 ? 1 : 0) + ' 1 ' + b[0].toFixed(2) + ' ' + b[1].toFixed(2); };
  const gauge = { needle: null, prog: null, speed: null, gear: null, gNeedle: null, gProg: null, gLabel: null, last: -1, lastN: -1, lastG: 0 };
  function buildGauges() {
    const d0 = -135, d1 = 135, sp = k => d0 + (d1 - d0) * k / MAXK;
    let g = '<defs><radialGradient id="dg" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#1b2342"/><stop offset="1" stop-color="#070a18"/></radialGradient></defs>';
    g += '<circle cx="100" cy="100" r="97" fill="url(#dg)" stroke="rgba(255,255,255,.28)" stroke-width="2"/><circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="1"/>';
    g += '<path d="' + arc(100, 100, 82, d0, d1) + '" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="7" stroke-linecap="round"/>';
    g += '<path d="' + arc(100, 100, 82, sp(REDK), d1) + '" fill="none" stroke="#ff3b30" stroke-width="7" stroke-linecap="round" opacity=".9"/>';
    g += '<path id="dProg" d="' + arc(100, 100, 82, d0, d1) + '" pathLength="100" stroke-dasharray="0 100" fill="none" stroke="#ffb347" stroke-width="7" stroke-linecap="round"/>';
    for (let k = 0; k <= MAXK; k += 20) {
      const major = k % 100 === 0, a = pt(100, 100, 70, sp(k)), b = pt(100, 100, major ? 60 : 65, sp(k));
      g += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" stroke="' + (k >= REDK ? '#ff6a5e' : '#e9eefc') + '" stroke-width="' + (major ? 2.4 : 1.2) + '"/>';
      if (major) { const t = pt(100, 100, 48, sp(k)); g += '<text x="' + t[0].toFixed(1) + '" y="' + (t[1] + 4).toFixed(1) + '" fill="#cfd8f5" font-size="11" font-weight="700" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif">' + k + '</text>'; }
    }
    g += '<text id="dGear" x="100" y="86" fill="#9fb0e0" font-size="11" font-weight="700" text-anchor="middle" letter-spacing="2" font-family="Segoe UI,Arial,sans-serif">GEAR 1</text>';
    g += '<text id="dSpeed" x="100" y="128" fill="#fff" font-size="40" font-weight="900" font-style="italic" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif">0</text>';
    g += '<text x="100" y="146" fill="#9fb0e0" font-size="11" font-weight="700" text-anchor="middle" letter-spacing="2" font-family="Segoe UI,Arial,sans-serif">KM/H</text>';
    g += '<g id="dNeedle"><polygon points="100,22 96.5,100 103.5,100" fill="#ff5a3a"/><circle cx="100" cy="100" r="9" fill="#222a4a" stroke="#ff5a3a" stroke-width="3"/></g>';
    $('dial').innerHTML = g;
    // nitro gauge: E ... F half-dial
    const e0 = -95, e1 = 95;
    let n = '<defs><radialGradient id="ng" cx="50%" cy="70%" r="75%"><stop offset="0" stop-color="#1b2342"/><stop offset="1" stop-color="#070a18"/></radialGradient></defs>';
    n += '<path d="M8 100 A62 62 0 0 1 132 100 L132 104 Q132 108 128 108 L12 108 Q8 108 8 104 Z" fill="url(#ng)" stroke="rgba(255,255,255,.28)" stroke-width="2"/>';
    n += '<path d="' + arc(70, 92, 50, e0, e1) + '" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="7" stroke-linecap="round"/>';
    n += '<path id="gProg" d="' + arc(70, 92, 50, e0, e1) + '" pathLength="100" stroke-dasharray="0 100" fill="none" stroke="#ffb347" stroke-width="7" stroke-linecap="round"/>';
    for (let k = 0; k <= 4; k++) { const a = pt(70, 92, 58, e0 + (e1 - e0) * k / 4), b = pt(70, 92, 52, e0 + (e1 - e0) * k / 4); n += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" stroke="#e9eefc" stroke-width="1.6"/>'; }
    n += '<text x="22" y="100" fill="#cfd8f5" font-size="10" font-weight="800" font-family="Segoe UI,Arial,sans-serif">E</text><text x="112" y="100" fill="#cfd8f5" font-size="10" font-weight="800" font-family="Segoe UI,Arial,sans-serif">F</text>';
    n += '<path d="M70 52 C62 62 60 70 66 76 C64 70 70 66 70 60 C74 66 78 70 74 77 C80 72 80 62 70 52 Z" fill="#ffb347" opacity=".95"/>';
    n += '<text id="gLabel" x="70" y="104" fill="#9fb0e0" font-size="9" font-weight="800" text-anchor="middle" letter-spacing="2" font-family="Segoe UI,Arial,sans-serif">NITRO</text>';
    n += '<g id="gNeedle"><polygon points="70,44 67.5,92 72.5,92" fill="#ff5a3a"/><circle cx="70" cy="92" r="6" fill="#222a4a" stroke="#ff5a3a" stroke-width="2.5"/></g>';
    $('gas').innerHTML = n;
    gauge.needle = $('dNeedle'); gauge.prog = $('dProg'); gauge.speed = $('dSpeed'); gauge.gear = $('dGear');
    gauge.gNeedle = $('gNeedle'); gauge.gProg = $('gProg'); gauge.gLabel = $('gLabel');
  }
  buildGauges();
  const GEARS = [0, 45, 95, 150, 215, 290];
  function updateGauges(kmh, nitro, boosting) {
    const f = clamp(kmh / MAXK, 0, 1), ang = -135 + 270 * f;
    gauge.needle.setAttribute('transform', 'rotate(' + ang.toFixed(1) + ' 100 100)');
    gauge.prog.setAttribute('stroke-dasharray', (f * 100).toFixed(1) + ' 100');
    gauge.prog.setAttribute('stroke', kmh >= REDK ? '#ff3b30' : boosting ? '#4fd8ff' : '#ffb347');
    const sk = Math.round(kmh);
    if (sk !== gauge.last) { gauge.last = sk; gauge.speed.textContent = sk; let g = 1; for (let i = 0; i < GEARS.length; i++) if (kmh >= GEARS[i]) g = i + 1; if (g !== gauge.lastG) { gauge.lastG = g; gauge.gear.textContent = 'GEAR ' + g; } }
    const nf = clamp(nitro / 100, 0, 1);
    gauge.gNeedle.setAttribute('transform', 'rotate(' + (-95 + 190 * nf).toFixed(1) + ' 70 92)');
    gauge.gProg.setAttribute('stroke-dasharray', (nf * 100).toFixed(1) + ' 100');
    gauge.gProg.setAttribute('stroke', boosting ? '#4fd8ff' : nf < 0.2 ? '#ff5a3a' : '#ffb347');
  }
  function updateHUD() {
    const p = state.player, rk = ranking();
    const place = rk.indexOf(p) + 1;
    if (place !== lastPos) { lastPos = place; hud.pos.innerHTML = '<b>' + place + '</b><span>' + ['st', 'nd', 'rd', 'th', 'th', 'th', 'th'][place - 1] + '</span>'; }
    const kmh = p.speed * KMH;
    state.stats.top = Math.max(state.stats.top, kmh);
    updateGauges(kmh, p.nitro, p.nitroOn || p.boostT > 0);
    hud.top.textContent = 'TOP ' + Math.round(state.stats.top) + ' · LIMIT ' + MAXK;
    hud.time.textContent = fmt(state.raceT);
    hud.vig.style.opacity = p.nitroOn || p.boostT > 0 ? 0.9 : 0;
    drawMini();
  }

  // minimap
  const mini = $('mini'), mctx = mini.getContext('2d');
  let miniBase = null, miniXf = null;
  function buildMini() {
    const w = state.world, tr = w.track, c = document.createElement('canvas'); c.width = c.height = 208;
    const g = c.getContext('2d'), { mn, mx } = w.bounds;
    const sx = 168 / Math.max(1, mx.x - mn.x), sz = 168 / Math.max(1, mx.z - mn.z), s = Math.min(sx, sz);
    const ox = 104 - (mn.x + mx.x) / 2 * s, oz = 104 - (mn.z + mx.z) / 2 * s;
    miniXf = { s, ox, oz };
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 9; g.beginPath();
    for (let i = 0; i < tr.n; i += 5) { const x = tr.P[i * 3] * s + ox, y = tr.P[i * 3 + 2] * s + oz; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 4; g.beginPath();
    for (let i = 0; i < tr.n; i += 5) { const x = tr.P[i * 3] * s + ox, y = tr.P[i * 3 + 2] * s + oz; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    miniBase = c;
  }
  function drawMini() {
    if (!state.world) return;
    if (!miniBase || miniBase.lvl !== state.levelIdx || miniBase.w !== state.world) { buildMini(); miniBase.lvl = state.levelIdx; miniBase.w = state.world; }
    mctx.clearRect(0, 0, 208, 208); mctx.drawImage(miniBase, 0, 0);
    const tr = state.world.track, { s, ox, oz } = miniXf;
    for (const c of state.cars) {
      const i = clamp(Math.floor(c.s / DS), 0, tr.n - 1);
      const x = tr.P[i * 3] * s + ox, y = tr.P[i * 3 + 2] * s + oz;
      mctx.fillStyle = c.isPlayer ? '#ffe45c' : c.color; mctx.beginPath(); mctx.arc(x, y, c.isPlayer ? 8 : 5.5, 0, 7); mctx.fill();
      if (c.isPlayer) { mctx.strokeStyle = '#000'; mctx.lineWidth = 2.5; mctx.stroke(); }
    }
  }

  /* ---------------- flow ---------------- */
  function show(id, on) { $(id).classList.toggle('hidden', !on); }
  function showLoading(txt, fn) {
    $('loadTxt').textContent = txt; show('loading', true);
    requestAnimationFrame(() => setTimeout(() => { try { fn(); } finally { show('loading', false); } }, 30));
  }
  function startMenuDemo() {
    state.mode = 'menu'; state.demo = true; cam.init = false;
    loadWorld(Math.min(save.unlocked, 8) - 1);
    spawnRace(true);
    state.leadS = state.world.track.startS + 120; state.time = 0;
    show('hud', false); show('menu', true); show('levels', false); show('result', false); show('pauseScr', false);
    const best = Object.keys(save.best).length;
    $('menuBest').textContent = best ? 'Unlocked ' + Math.min(save.unlocked, 8) + ' / 8 tracks · ' + Object.values(save.best).reduce((a, b) => a + (b.stars || 0), 0) + ' ★' : 'Fly through rings, grab boost pads, beat 5 rivals.';
    $('playBtn').textContent = save.unlocked > 1 || best ? '▶ Continue · Level ' + Math.min(save.unlocked, 8) : '▶ Play';
  }

  function startLevel(idx) {
    audio.init();
    showLoading('Level ' + (idx + 1) + ' · ' + LEVELS[idx].name, () => {
      loadWorld(idx);
      state.demo = false; state.autopilot = false;
      spawnRace(false);
      state.mode = 'countdown'; state.countT = 0; state.lastCount = 4; state.lastBeep = 4; cam.init = false; state.paused = false;
      show('menu', false); show('levels', false); show('result', false); show('pauseScr', false); show('hud', true);
      const L = state.world.L;
      hud.lvl.textContent = 'Level ' + L.id + ' · ' + L.name;
      hud.intro.innerHTML = '<div class="n">LEVEL ' + L.id + ' OF 8</div><div class="t">' + L.name.toUpperCase() + '</div><div class="w">' + L.twist + '</div><div class="c">Your ride: ' + CARS[L.car].name + '</div>';
      hud.count.textContent = ''; hud.time.textContent = '0:00.0'; lastPos = -1;
      input.boost = false;
      updateCamera(0.016); placeAll(0.016);
    });
  }
  function placeAll(dt) { state.cars.forEach(c => placeCar(c, dt)); }

  function finishRace() {
    const p = state.player;
    state.mode = 'finish'; state.finishT = 0;
    const place = state.cars.filter(c => c.finished).length;  // player already flagged finished
    p.place = place;
    audio.fin(); hud.intro.innerHTML = ''; toast(place === 1 ? 'VICTORY!' : 'FINISH!', '#ffe45c');
    setTimeout(showResult, 1700);
  }
  function showResult() {
    if (state.mode !== 'finish' || state.resultShown) return;
    state.resultShown = true;
    const p = state.player, L = state.world.L, idx = state.levelIdx;
    const place = p.place, stars = place === 1 ? 3 : place === 2 ? 2 : place === 3 ? 1 : 0;
    const ord = ['1st', '2nd', '3rd', '4th', '5th', '6th'][place - 1];
    const prev = save.best[L.id] || {};
    const newBest = !prev.time || (place <= 3 && p.finishTime < prev.time);
    save.best[L.id] = { time: place <= 3 ? Math.min(prev.time || 1e9, p.finishTime) : prev.time, stars: Math.max(prev.stars || 0, stars), place: Math.min(prev.place || 9, place) };
    if (!save.best[L.id].time) delete save.best[L.id].time;
    const passed = place <= 3;
    if (passed && idx + 2 > save.unlocked && idx < 7) save.unlocked = idx + 2;
    persist();
    $('resPlace').textContent = ord + (place === 1 ? ' 🏆' : '');
    $('resStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('resTime').textContent = 'Time ' + fmt(p.finishTime) + ' · Boosts ' + state.stats.boosts + ' · Crashes ' + state.stats.crashes;
    $('resBest').textContent = passed && save.best[L.id].time ? 'Best ' + fmt(save.best[L.id].time) + (newBest ? ' · NEW BEST!' : '') : '';
    $('resMsg').textContent = passed ? (idx < 7 ? 'Podium! Level ' + (idx + 2) + ' unlocked.' : 'You conquered all 8 tracks!') : 'Finish top 3 to unlock the next track. Grab boost pads and rings!';
    $('nextBtn').style.display = passed && idx < 7 ? '' : 'none';
    show('hud', false); show('result', true);
  }

  function togglePause() {
    if (state.mode !== 'race' && state.mode !== 'countdown') return;
    state.paused = !state.paused; show('pauseScr', state.paused);
    if (audio.ctx) audio.engine(0, false, false);
  }

  /* ---------------- main loop ---------------- */
  let last = performance.now(), fpsAcc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!state.world || !state.player) return;
    if (!state.paused) tick(dt);
    renderer.render(scene, camera);
  }
  function tick(dt) {
    state.time += dt; state.dt = dt;
    const w = state.world, p = state.player;
    if (state.mode === 'menu') {
      state.cars.forEach(c => { stepCar(c, dt, true); if (c.s > w.track.finishS - 150) { c.s = w.track.startS + 20; } });
      state.leadS = state.cars.reduce((m, c) => Math.max(m, c.s), 0) - 30;
      state.leadS = p.s;
      placeAll(dt); updateCamera(dt);
      audio.engine(0, false, false);
    } else if (state.mode === 'countdown') {
      state.countT += dt;
      const n = Math.ceil(3.4 - state.countT);
      if (n !== state.lastCount && n <= 3) {
        state.lastCount = n;
        hud.count.textContent = n > 0 ? n : 'GO!'; hud.count.classList.remove('tick'); void hud.count.offsetWidth; hud.count.classList.add('tick');
      }
      if (state.countT >= 3.4) {
        state.mode = 'race'; hud.count.textContent = 'GO!'; hud.count.classList.remove('tick'); void hud.count.offsetWidth; hud.count.classList.add('tick');
        audio.beep(true); hud.intro.innerHTML = ''; setTimeout(() => { if (state.mode === 'race') hud.count.textContent = ''; }, 800);
        state.cars.forEach(c => { c.speed = 8; });
      } else if (n !== state.lastBeep && n > 0) { state.lastBeep = n; audio.beep(false); }
      placeAll(dt); updateCamera(dt); updateHUD();
      audio.engine(0.05 + (state.countT > 2.8 ? 0.2 : 0), false, true);
    } else if (state.mode === 'race' || state.mode === 'finish') {
      state.raceT += state.mode === 'race' ? dt : 0;
      const t = state.raceT;
      for (const c of state.cars) {
        const drive = c.isPlayer ? state.autopilot : true;
        if (c.isPlayer && state.autopilot) autopilotInput(c);
        stepCar(c, dt, c.isPlayer ? (state.mode === 'finish' || state.autopilot) : true);
        if (state.mode === 'race') pickups(c);
        if (!c.finished && c.s >= w.track.finishS) {
          c.finished = true; c.finishTime = t - (c.s - w.track.finishS) / Math.max(c.speed, 1);
          if (c.isPlayer) finishRace();
        }
      }
      if (state.mode === 'race') { carCollisions(dt); drafting(); p.top = Math.max(p.top || 0, p.speed); }
      // after the finish line, everyone coasts on
      if (state.mode === 'finish') { state.finishT += dt; p.speed += (w.L.base * 0.6 - p.speed) * (1 - Math.exp(-1.2 * dt)); p.lat += (0 - p.lat) * (1 - Math.exp(-1.2 * dt)); p.latV = 0; }
      // keep finished AI from running off the track end
      for (const c of state.cars) { if (c.s > w.track.length - 40) { c.s = w.track.length - 40; c.speed *= 0.9; } }
      placeAll(dt); updateCamera(dt);
      if (state.mode === 'race') updateHUD();
      audio.engine(clamp(p.speed / (w.L.base * 1.5), 0, 1), p.nitroOn || p.boostT > 0, true);
    }
    w.update(dt, state.time, camera, _vel);
    updateSparks(dt); updateSpeedLines(dt);
  }

  // simple autopilot used by the headless tests (window.SkyGame.autoplay): drives like a rival, minus the rubber band
  function autopilotInput(c) { c.lane0 = 0; c.laneAmp = 0; }

  /* ---------------- UI wiring ---------------- */
  function buildLevelGrid() {
    const g = $('grid'); g.innerHTML = '';
    LEVELS.forEach((L, i) => {
      const c = document.createElement('button'); c.className = 'card' + (i + 1 > save.unlocked ? ' locked' : '');
      const s = L.theme.sky; c.style.background = 'linear-gradient(180deg,' + s.top + ',' + s.mid + ' 60%,' + s.hor + ')';
      const b = save.best[L.id], stars = b ? b.stars : 0;
      c.innerHTML = '<div class="n">' + L.id + '</div><div class="st">' + '★'.repeat(stars) + '<span style="opacity:.35">' + '★'.repeat(3 - stars) + '</span></div><div class="t">' + L.name + '</div><div class="s">' + L.tag + '</div>';
      c.addEventListener('click', () => { if (i + 1 <= save.unlocked) startLevel(i); });
      g.appendChild(c);
    });
  }
  $('playBtn').addEventListener('click', () => startLevel(Math.min(save.unlocked, 8) - 1));
  $('levelsBtn').addEventListener('click', () => { buildLevelGrid(); show('menu', false); show('levels', true); });
  $('levelsBack').addEventListener('click', () => { show('levels', false); show('menu', true); });
  $('soundBtn').addEventListener('click', e => { audio.init(); audio.setMute(save.sound); e.target.textContent = 'Sound: ' + (save.sound ? 'On' : 'Off'); });
  $('soundBtn').textContent = 'Sound: ' + (save.sound ? 'On' : 'Off');
  $('nextBtn').addEventListener('click', () => startLevel(Math.min(state.levelIdx + 1, 7)));
  $('retryBtn').addEventListener('click', () => startLevel(state.levelIdx));
  $('resLevelsBtn').addEventListener('click', () => { buildLevelGrid(); show('result', false); show('levels', true); state.mode = 'menu'; });
  $('pause').addEventListener('click', togglePause);
  $('resumeBtn').addEventListener('click', togglePause);
  $('pRetryBtn').addEventListener('click', () => { state.paused = false; startLevel(state.levelIdx); });
  $('pMenuBtn').addEventListener('click', () => { state.paused = false; startMenuDemo(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && (state.mode === 'race')) togglePause(); });

  // public hooks (useful for tests and for wiring the platform SDK later)
  window.SkyGame = {
    state, startLevel, startMenuDemo, togglePause, input, save,
    set autoplay(v) { state.autopilot = !!v; },
    skipCountdown() { state.countT = 3.39; },
    fastForward(sec, step) { step = step || 1 / 30; for (let t = 0; t < sec && state.mode !== 'menu'; t += step) tick(step); }
  };

  startMenuDemo();
  requestAnimationFrame(frame);
})();
