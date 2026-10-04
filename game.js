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
  let save = { reached: 1, best: {}, sound: true, done: false };
  try { const s = JSON.parse(localStorage.getItem('skyracing.v2')); if (s) save = Object.assign(save, s); } catch (e) { /* ignore */ }
  const persist = () => { try { localStorage.setItem('skyracing.v2', JSON.stringify(save)); } catch (e) { /* ignore */ } };

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

  // nitro light trails from the tail lights (every car)
  const TRAIL_N = 22;
  const trailMat = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
  function makeTrail() {
    const pos = new Float32Array(TRAIL_N * 4 * 3), col = new Float32Array(TRAIL_N * 4 * 3), idx = [];
    for (let t = 0; t < 2; t++) for (let k = 0; k < TRAIL_N - 1; k++) { const b = (t * TRAIL_N + k) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setIndex(idx);
    const mesh = new T.Mesh(g, trailMat); mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
    return { mesh, pts: [[], []], a: 0 };
  }
  function dropTrail(c) { if (c.trail) { scene.remove(c.trail.mesh); c.trail.mesh.geometry.dispose(); } }
  const _tl = V3(), _tr = V3();
  function updateTrails(dt) {
    for (const c of state.cars) {
      const tr = c.trail; if (!tr) continue;
      tr.a += ((c.nitroOn ? 1 : 0) - tr.a) * (1 - Math.exp(-6 * dt));
      c.mesh.updateMatrixWorld();
      _tr.setFromMatrixColumn(c.mesh.matrixWorld, 0).normalize();
      for (let t = 0; t < 2; t++) {
        const p = c.mesh.localToWorld(_tl.set((t ? 1 : -1) * c.dims.W * 0.3, c.style.tailH - 0.12, c.dims.L + 0.05));
        tr.pts[t].unshift(p.clone()); if (tr.pts[t].length > TRAIL_N) tr.pts[t].pop();
      }
      tr.mesh.visible = tr.a > 0.02;
      if (!tr.mesh.visible) continue;
      const P = tr.mesh.geometry.attributes.position.array, C = tr.mesh.geometry.attributes.color.array;
      for (let t = 0; t < 2; t++) for (let k = 0; k < TRAIL_N; k++) {
        const q = tr.pts[t][Math.min(k, tr.pts[t].length - 1)], f = 1 - k / TRAIL_N, w = 0.2 * f + 0.03, b = (t * TRAIL_N + k) * 2;
        P[b * 3] = q.x - _tr.x * w; P[b * 3 + 1] = q.y - _tr.y * w; P[b * 3 + 2] = q.z - _tr.z * w;
        P[b * 3 + 3] = q.x + _tr.x * w; P[b * 3 + 4] = q.y + _tr.y * w; P[b * 3 + 5] = q.z + _tr.z * w;
        const i = tr.a * f * f;
        for (const o of [0, 3]) { C[b * 3 + o] = 0.25 * i; C[b * 3 + o + 1] = 0.8 * i; C[b * 3 + o + 2] = 1.0 * i; }
      }
      tr.mesh.geometry.attributes.position.needsUpdate = true; tr.mesh.geometry.attributes.color.needsUpdate = true;
    }
  }
  // finish-line fireworks
  const FW = 420, fwPos = new Float32Array(FW * 3), fwCol = new Float32Array(FW * 3), fwVel = [], fwLife = new Float32Array(FW), fwBase = [];
  for (let i = 0; i < FW; i++) { fwVel.push(V3(0, 0, 0)); fwBase.push(new T.Color()); fwPos[i * 3 + 1] = -99999; }
  const fwGeo = new T.BufferGeometry(); fwGeo.setAttribute('position', new T.BufferAttribute(fwPos, 3)); fwGeo.setAttribute('color', new T.BufferAttribute(fwCol, 3));
  const fireworks = new T.Points(fwGeo, new T.PointsMaterial({ size: 0.9, vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
  fireworks.frustumCulled = false; scene.add(fireworks);
  let fwIdx = 0; const fwQueue = [];
  function burst(p, hex) {
    const c = new T.Color(hex);
    for (let k = 0; k < 70; k++) {
      const i = fwIdx++ % FW; fwLife[i] = 1.2 + Math.random() * 0.6; fwBase[i].copy(c);
      fwPos[i * 3] = p.x; fwPos[i * 3 + 1] = p.y; fwPos[i * 3 + 2] = p.z;
      const th = Math.random() * 6.28, ph = Math.acos(2 * Math.random() - 1), sp = 9 + Math.random() * 6;
      fwVel[i].set(Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp);
    }
  }
  function celebrate() {
    const w = state.world; frameAt(w.track.finishS + 30, fr);
    const cols = ['#ffc247', '#33d6ff', '#ff4b8f', '#7dff6a', '#ffffff'];
    for (let k = 0; k < 7; k++) fwQueue.push({ t: k * 0.32, p: fr.p.clone().addScaledVector(fr.u, 14 + Math.random() * 8).addScaledVector(fr.r, (Math.random() - 0.5) * 26).addScaledVector(fr.f, Math.random() * 20), c: cols[k % cols.length] });
  }
  function updateFireworks(dt) {
    for (let q = fwQueue.length - 1; q >= 0; q--) { fwQueue[q].t -= dt; if (fwQueue[q].t <= 0) { burst(fwQueue[q].p, fwQueue[q].c); if (q === 0 || Math.random() < 0.5) audio.tone(90 + Math.random() * 40, 0.4, 'sawtooth', 0.06, 40); fwQueue.splice(q, 1); } }
    for (let i = 0; i < FW; i++) {
      if (fwLife[i] <= 0) { fwPos[i * 3 + 1] = -99999; continue; }
      fwLife[i] -= dt; fwVel[i].multiplyScalar(Math.exp(-1.6 * dt)); fwVel[i].y -= 6 * dt;
      fwPos[i * 3] += fwVel[i].x * dt; fwPos[i * 3 + 1] += fwVel[i].y * dt; fwPos[i * 3 + 2] += fwVel[i].z * dt;
      const f = Math.min(1, fwLife[i]); fwCol[i * 3] = fwBase[i].r * f; fwCol[i * 3 + 1] = fwBase[i].g * f; fwCol[i * 3 + 2] = fwBase[i].b * f;
    }
    fwGeo.attributes.position.needsUpdate = true; fwGeo.attributes.color.needsUpdate = true;
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
  // Desktop: arrow keys. Landscape phone: two arrow buttons. Portrait phone: swipe left / right anywhere.
  const input = { left: false, right: false, kl: false, kr: false, analog: 0, touching: false, swipeDX: 0 };
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
  window.addEventListener('keydown', e => {
    audio.init();
    if (isLeft(e.key)) input.kl = true;
    if (isRight(e.key)) input.kr = true;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') togglePause();
    if (e.key === 'Enter' && state.mode === 'menu' && !$('menu').classList.contains('hidden')) startLevel(0);
  });
  window.addEventListener('keyup', e => {
    if (isLeft(e.key)) input.kl = false;
    if (isRight(e.key)) input.kr = false;
  });
  window.addEventListener('blur', () => { input.kl = input.kr = false; });

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

  // portrait: swipe. Moving a finger left moves the car left, moving it right moves the car right,
  // anywhere on the screen; the car follows the swipe and holds that line when the finger stops.
  let dragId = null, dragLastX = 0;
  window.addEventListener('pointerdown', e => {
    if (state.layout !== 'ctl-portrait' || (state.mode !== 'race' && state.mode !== 'countdown') || state.paused || dragId !== null) return;
    if (e.target.closest && e.target.closest('button,.screen')) return;
    dragId = e.pointerId; dragLastX = e.clientX; input.touching = true; input.swipeDX = 0;
  });
  window.addEventListener('pointermove', e => { if (e.pointerId === dragId) { input.swipeDX += e.clientX - dragLastX; dragLastX = e.clientX; } });
  const dragEnd = e => { if (e.pointerId !== dragId) return; dragId = null; input.touching = false; input.swipeDX = 0; };
  window.addEventListener('pointerup', dragEnd); window.addEventListener('pointercancel', dragEnd);

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
    state.cars.forEach(c => { scene.remove(c.mesh); window.SkyCars.dispose(c.mesh); dropTrail(c); }); state.cars = [];
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
    return { trail: makeTrail(), mesh, parts: mesh.userData.parts, dims: mesh.userData.dims, style, color, isPlayer, name, s: 0, lat: 0, latV: 0, speed: 0, steerS: 0, nitro: 0, nitroOn: false, slowT: 0, slowF: 1, bumpCd: 0, wallCd: 0,
      fr: 0, padTarget: null, padSeen: new Set(), react: 60, padSeek: 0.8, margin: 1.4, rnd: Math.random, yawVis: 0, spin: 0, hitCd: 0, padCd: 0, finished: false, finishTime: 0, skill: 1, lane0: 0, laneF: 1, laneAmp: 0, ph: 0, wheelRot: 0, scrape: 0, draft: 0, combo: 0 };
  }

  function spawnRace(demo) {
    const w = state.world, L = w.L;
    state.cars.forEach(c => { scene.remove(c.mesh); window.SkyCars.dispose(c.mesh); dropTrail(c); }); state.cars = [];
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
      c.react = 42 + rnd() * 60; c.padSeek = 0.55 + rnd() * 0.4; c.margin = 1.2 + rnd() * 0.5; c.rnd = rnd;
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
      let want = clamp((input.right || input.kr ? 1 : 0) - (input.left || input.kl ? 1 : 0), -1, 1);
      if (input.touching) {                                   // swipe: steer towards the line the finger asked for
        const gain = L.width * 0.9 / Math.max(200, window.innerWidth * 0.55);
        c.swipeT = clamp((c.swipeT === undefined ? c.lat : c.swipeT) + input.swipeDX * gain, -halfW, halfW); input.swipeDX = 0;
        want = clamp((c.swipeT - c.lat) * 0.6, -1, 1);
      } else c.swipeT = c.lat;
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
    // walls (every car scrapes and loses speed the same way)
    if (Math.abs(c.lat) > halfW) {
      const sgn = Math.sign(c.lat);
      c.lat = sgn * halfW;
      if (c.latV * sgn > 3) {
        c.speed -= c.speed * 1.2 * dt;
        if (c.wallCd <= 0) { hit(c, 'wall'); c.wallCd = 0.5; }
        if (near(c)) emitSparks(V3(fr.p.x + fr.r.x * (c.lat + sgn * 0.9), fr.p.y + fr.r.y * (c.lat + sgn * 0.9) + 0.5, fr.p.z + fr.r.z * (c.lat + sgn * 0.9)), 2, V3(-fr.f.x * c.speed * 0.2, 2, -fr.f.z * c.speed * 0.2), 6);
      }
      c.latV = -c.latV * 0.2;
    }
    // ---- speed: one rule book for everyone ----
    let target = L.base * (c.isPlayer ? 1 : c.skill);
    const racing = state.mode === 'race';
    if (!c.isPlayer && !state.demo) {
      const p = state.player, lead = p.s - c.s;           // > 0: rival is behind the player
      if (lead > 40) target *= 1 + Math.min(L.aiRubber, (lead - 40) / 700);
      else if (lead < -80) target *= 1 - Math.min(0.03, (-lead - 80) / 2500);
      target *= 1 - Math.min(0.06, Math.abs(kAhead) * 30);
    }
    // road nitro: boost pads (and slipstream) fill the tank, a full-enough tank fires by itself
    if (racing) {
      if (!c.nitroOn && c.nitro >= NITRO_MIN) c.nitroOn = true;
      if (c.nitroOn) { c.nitro -= NITRO_BURN * dt; if (c.nitro <= 0) { c.nitro = 0; c.nitroOn = false; } else target *= NITRO_GAIN; }
    } else c.nitroOn = false;
    // after a crash or bump the car limps for a moment
    if (c.slowT > 0) { c.slowT -= dt; target *= c.slowF; }
    target *= 1 - fr.f.y * 0.1;
    if (c.draft > 0) target *= 1.04;
    const acc = c.nitroOn ? 2.6 : (c.speed < target ? 1.35 : 0.8);
    c.speed += (target - c.speed) * (1 - Math.exp(-acc * dt));
    c.s += c.speed * dt;
    c.fr = Math.min(tr.n - 2, Math.floor(c.s / DS));
    c.hitCd = Math.max(0, c.hitCd - dt); c.padCd = Math.max(0, c.padCd - dt);
    c.bumpCd = Math.max(0, c.bumpCd - dt); c.wallCd = Math.max(0, c.wallCd - dt);
    if (c.spin > 0) c.spin = Math.max(0, c.spin - dt / 0.9);
  }

  const NITRO_MIN = 8, NITRO_BURN = 24, NITRO_GAIN = 1.42, PAD_FILL = 36;
  // what a knock does: [speed kept, limp seconds, limp speed factor, spin out, nitro kept]
  const HITS = {
    crash: [0.5, 1.5, 0.6, 1, 0.5], laser: [0.55, 1.3, 0.62, 1, 0.5], cones: [0.85, 0.6, 0.85, 0, 0.9],
    bump: [0.82, 0.8, 0.82, 0, 0.85], nudge: [0.95, 0.35, 0.93, 0, 1], wall: [0.96, 0.35, 0.9, 0, 1]
  };
  const near = c => c.isPlayer || Math.abs(c.s - state.player.s) < 60;
  function hit(c, kind) {
    const h = HITS[kind];
    c.speed *= h[0];
    if (c.slowT > 0) c.slowF = Math.min(c.slowF, h[2]); else c.slowF = h[2];
    c.slowT = Math.max(c.slowT, h[1]);
    if (h[3]) c.spin = 1;
    c.nitro *= h[4]; if (h[4] < 1) c.nitroOn = false;
    if (c.isPlayer) {
      if (kind === 'crash' || kind === 'laser') { state.stats.crashes++; toast('CRASH!', '#ff5a3a'); audio.crash(); kick(1); }
      else if (kind === 'cones' || kind === 'bump') { toast('BUMP!', '#ffb347'); audio.tone(200, 0.1, 'square', 0.1, 90); kick(0.5); }
      else if (kind === 'wall') audio.tone(300, 0.1, 'sawtooth', 0.08, 120);
    } else if (near(c) && (kind === 'crash' || kind === 'laser')) audio.tone(160, 0.25, 'sawtooth', 0.1, 50);
  }

  // boost pads fill every car's tank; hazards hurt every car
  function pickups(c) {
    const w = state.world, F = w.feats, t = state.time, st = state.stats;
    const idx = c.s / DS;
    for (const p of F.pads) {
      if (Math.abs(p.i - idx) < 5 && Math.abs(c.lat - p.lat) < 4.2 && c.padCd <= 0) {
        c.padCd = 1.0; c.nitro = Math.min(100, c.nitro + PAD_FILL * (w.L.mech.padMult || 1)); c.speed += 6;
        if (c.isPlayer) { st.boosts++; toast('NITRO!', '#33d6ff'); audio.boost(); kick(0.5); }
      }
    }
    if (c.hitCd > 0) return;
    for (const o of F.obst) {
      if (Math.abs(o.i - idx) > 1.6) continue;
      for (const sp of w.blocked(o, t)) {
        if (c.lat > sp[0] - 1.0 && c.lat < sp[1] + 1.0) {
          const kind = o.type === 'cones' ? 'cones' : o.type === 'laser' ? 'laser' : 'crash';
          c.hitCd = kind === 'cones' ? 0.6 : 1.3;
          hit(c, kind);
          if (near(c)) { frameAt(c.s, fr); emitSparks(V3(fr.p.x + fr.r.x * c.lat, fr.p.y + 1, fr.p.z + fr.r.z * c.lat), kind === 'cones' ? 8 : 24, V3(0, 4, 0), 14); }
          return;
        }
      }
    }
  }

  // car-to-car contact: the car behind takes the bigger hit, the car in front gets a nudge
  function carCollisions(dt) {
    const cars = state.cars;
    for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
      const A = cars[a], B = cars[b], ds = A.s - B.s;
      if (Math.abs(ds) < 4.4 && Math.abs(A.lat - B.lat) < 2.1) {
        const push = (A.lat >= B.lat ? 1 : -1) * 7 * dt;
        A.lat += push; B.lat -= push;
        const back = ds < 0 ? A : B, front = back === A ? B : A;
        if (back.bumpCd <= 0 && front.bumpCd <= 0) {
          back.bumpCd = front.bumpCd = 0.8;
          const side = Math.abs(ds) < 2.2;                  // side by side: both trade paint equally
          hit(back, 'bump'); hit(front, side ? 'bump' : 'nudge');
          if (near(back) || near(front)) emitSparks(V3().addVectors(back.mesh.position, front.mesh.position).multiplyScalar(0.5).setY(back.mesh.position.y + 0.6), 8, V3(0, 2, 0), 8);
        }
      }
    }
  }

  // slipstream: sitting right behind any car fills the nitro tank, for rivals too
  function drafting() {
    const M = state.world.L.mech, rate = (M.draft || 14) * 0.5 * state.dt;
    for (const c of state.cars) {
      c.draft = 0;
      for (const o of state.cars) {
        if (o === c) continue; const d = o.s - c.s;
        if (d > 3 && d < 20 && Math.abs(o.lat - c.lat) < 2.8) { c.draft = 1; c.nitro = Math.min(100, c.nitro + rate); break; }
      }
    }
    const p = state.player;
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
    const fl = c.nitroOn ? 1 : (c.speed > 25 ? 0.14 : 0);
    c.parts.flames.forEach(f => { f.scale.z = fl * (3.2 + Math.random() * 1.2) + 0.01; f.position.z = c.dims.L * 0.99 + 0.5 * f.scale.z; f.scale.x = f.scale.y = 1 + fl * 0.6; f.material.color.setHex(c.nitroOn ? 0x4fd8ff : 0xffa73a); });
  }

  /* ---------------- camera ---------------- */
  const cam = { pos: V3(), look: V3(), up: V3(0, 1, 0), fov: 70, shake: 0, init: false };
  const _a = V3(), _b = V3(), _c = V3(), _vel = V3(), _prev = V3(), WORLD_UP = V3(0, 1, 0);
  const frA = { p: V3(), f: V3(), u: V3(), r: V3(), k: 0, i: 0 }, frB = { p: V3(), f: V3(), u: V3(), r: V3(), k: 0, i: 0 };
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
      // chase cam: rides the road behind the car and aims at the road ahead, so it leans into every corner
      const boost = p.nitroOn ? 1 : 0, tall = camera.aspect < 1;
      const back = (tall ? 8.4 : 7.0) + sf * 1.3 + boost * 1.1, h = (tall ? 3.2 : 2.45) + sf * 0.2;
      frameAt(p.s - back, frB);
      desiredPos = _a.copy(frB.p).addScaledVector(frB.r, p.lat * 0.85).addScaledVector(frB.u, h);
      frameAt(p.s + 15 + sf * 6, frA);
      lookAt = _b.copy(frA.p).addScaledVector(frA.r, p.lat * 0.55).addScaledVector(frA.u, tall ? 0.6 : 0.95);
      frameAt(p.s, fr);
      up.copy(fr.u).lerp(WORLD_UP, 0.35 * Math.max(0, fr.u.y)).normalize();      // keep the horizon calmer on banked turns
      fovT = 63 + sf * 11 + boost * 7;
    }
    if (state.debugCam) { const o = state.debugCam; desiredPos = _a.copy(car).addScaledVector(fr.r, o[0]).addScaledVector(fr.u, o[1]).addScaledVector(fr.f, o[2]); lookAt = _b.copy(car).addScaledVector(fr.u, 0.7); fovT = o[3] || 45; cam.init = false; }
    if (!cam.init) { cam.pos.copy(desiredPos); cam.look.copy(lookAt); cam.up.copy(up); cam.fov = fovT; cam.init = true; }
    const kp = state.mode === 'race' ? 1 - Math.exp(-9 * dt) : 1 - Math.exp(-6 * dt);
    cam.pos.lerp(desiredPos, kp); cam.look.lerp(lookAt, 1 - Math.exp(-14 * dt)); cam.up.lerp(up, 1 - Math.exp(-5 * dt)).normalize(); cam.fov += (fovT - cam.fov) * (1 - Math.exp(-4 * dt));
    camera.position.copy(cam.pos);
    if (cam.shake > 0.001) { const s = cam.shake * 0.35; camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s; cam.shake *= Math.exp(-7 * dt); }
    camera.up.copy(cam.up);
    camera.lookAt(cam.look);
    const portrait = camera.aspect < 1;
    camera.fov = portrait ? clamp(cam.fov * 1.32, 60, 100) : cam.fov;
    // nudge the view so the car clears the on-screen controls
    const shift = state.mode === 'menu' ? 0 : state.layout === 'ctl-landscape' ? 0.05 : state.layout === 'ctl-portrait' ? -0.13 : 0.03;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (shift !== 0) camera.setViewOffset(vw, vh, 0, Math.round(vh * shift), vw, vh); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    // camera velocity for weather streaks
    _vel.copy(camera.position).sub(_prev).divideScalar(Math.max(dt, 1e-3)); _prev.copy(camera.position);
  }
  /* ---------------- HUD ---------------- */
  const hud = { pos: $('pos'), time: $('time'), toast: $('toast'), count: $('count'), vig: $('vig'), flash: $('flash'), intro: $('intro'), nitroBox: $('nitroBox') };
  let lastPos = -1;
  const lights = [...document.querySelectorAll('#lights i')];
  function toast(txt, color) { hud.toast.textContent = txt; hud.toast.style.color = color || '#fff'; hud.toast.classList.remove('show'); void hud.toast.offsetWidth; hud.toast.classList.add('show'); }
  function flash(a) { hud.flash.style.opacity = a; setTimeout(() => { hud.flash.style.opacity = 0; }, 90); }
  const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };

  // --- speedometer: transparent segmented arc, big digital speed, gear; nitro: segmented tank bar ---
  const MAXK = 400, REDK = 320, KMH = 2.0, SEGS = 40, NSEG = 12;
  const pt = (cx, cy, r, deg) => [cx + r * Math.sin(deg * Math.PI / 180), cy - r * Math.cos(deg * Math.PI / 180)];
  const F = n => n.toFixed(1);
  const gauge = { segs: [], nsegs: [], speed: null, gear: null, pct: null, lit: -1, nlit: -1, last: -1, lastG: 0, mode: '' };
  const segColor = k => k >= SEGS * REDK / MAXK ? '#ff4b3a' : k >= SEGS * 0.55 ? '#ffc247' : '#ffffff';
  function buildGauges() {
    const cx = 120, cy = 120, r0 = 92, r1 = 108, a0 = -112, a1 = 112, step = (a1 - a0) / SEGS;
    let g = '<defs><radialGradient id="spdBg" cx="50%" cy="85%" r="60%"><stop offset="0" stop-color="#050816" stop-opacity=".55"/><stop offset="1" stop-color="#050816" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="nosFill" x1="0" x2="1"><stop offset="0" stop-color="#ff8a1f"/><stop offset="1" stop-color="#ffc247"/></linearGradient></defs>';
    g += '<ellipse cx="120" cy="104" rx="104" ry="64" fill="url(#spdBg)"/>';
    for (let k = 0; k < SEGS; k++) {
      const d0 = a0 + k * step + 0.7, d1 = a0 + (k + 1) * step - 0.7;
      const p = [pt(cx, cy, r0, d0), pt(cx, cy, r1, d0), pt(cx, cy, r1, d1), pt(cx, cy, r0, d1)];
      g += '<polygon class="sg" points="' + p.map(q => F(q[0]) + ',' + F(q[1])).join(' ') + '" fill="rgba(255,255,255,.14)"/>';
    }
    const e0 = pt(cx, cy, 86, a0), e1 = pt(cx, cy, 86, a1);
    g += '<path d="M' + F(e0[0]) + ' ' + F(e0[1]) + ' A86 86 0 1 1 ' + F(e1[0]) + ' ' + F(e1[1]) + '" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1.2"/>';
    for (const k of [0, 100, 200, 300, 400]) { const q = pt(cx, cy, 76, a0 + (a1 - a0) * k / MAXK); g += '<text x="' + F(q[0]) + '" y="' + F(q[1] + 3) + '" fill="' + (k >= REDK ? '#ff7a6e' : 'rgba(235,240,255,.75)') + '" font-size="9" font-weight="700" text-anchor="middle" font-family="Chakra Petch,Segoe UI,sans-serif">' + k + '</text>'; }
    g += '<text id="spdGear" x="120" y="62" fill="#ffc247" font-size="13" font-weight="800" text-anchor="middle" letter-spacing="1" font-family="Saira Condensed,Arial Narrow,sans-serif">GEAR 1</text>';
    g += '<text id="spdNum" x="120" y="110" fill="#fff" font-size="54" font-weight="900" font-style="italic" text-anchor="middle" font-family="Saira Condensed,Arial Narrow,sans-serif">0</text>';
    g += '<text x="120" y="126" fill="rgba(235,240,255,.75)" font-size="10" font-weight="700" text-anchor="middle" letter-spacing="3" font-family="Chakra Petch,Segoe UI,sans-serif">KM/H · LIMIT ' + MAXK + '</text>';
    $('spd').innerHTML = g;
    gauge.segs = [...$('spd').querySelectorAll('.sg')];
    gauge.speed = $('spdNum'); gauge.gear = $('spdGear');
    // nitro tank
    let n = '<path d="M14 6 C9 12 8 16 11 20 C10 16 14 14 14 10 C16 14 18 16 16 20 C20 17 20 11 14 6 Z" fill="#33d6ff"/>';
    n += '<text x="26" y="18" fill="#fff" font-size="13" font-weight="800" letter-spacing="2" font-family="Saira Condensed,Arial Narrow,sans-serif">NITRO</text>';
    n += '<text id="nosPct" x="156" y="18" fill="rgba(235,240,255,.8)" font-size="12" font-weight="800" text-anchor="end" font-family="Saira Condensed,Arial Narrow,sans-serif">0%</text>';
    const w = 11.2, gap = 1.6, x0 = 6, y0 = 26, h = 20, sk = 5;
    for (let k = 0; k < NSEG; k++) { const x = x0 + k * (w + gap); n += '<polygon class="ns" points="' + F(x + sk) + ',' + y0 + ' ' + F(x + w + sk) + ',' + y0 + ' ' + F(x + w) + ',' + (y0 + h) + ' ' + F(x) + ',' + (y0 + h) + '" fill="rgba(255,255,255,.14)"/>'; }
    n += '<text x="6" y="56" fill="rgba(235,240,255,.6)" font-size="7.5" font-weight="700" letter-spacing="1.5" font-family="Chakra Petch,Segoe UI,sans-serif">HIT PADS TO FILL</text>';
    $('nos').innerHTML = n;
    gauge.nsegs = [...$('nos').querySelectorAll('.ns')]; gauge.pct = $('nosPct');
  }
  buildGauges();
  const GEARS = [0, 45, 95, 150, 215, 290];
  function updateGauges(kmh, nitro, boosting) {
    const lit = Math.round(clamp(kmh / MAXK, 0, 1) * SEGS);
    if (lit !== gauge.lit) { gauge.lit = lit; gauge.segs.forEach((el, k) => el.setAttribute('fill', k < lit ? segColor(k) : 'rgba(255,255,255,.14)')); }
    const sk = Math.round(kmh);
    if (sk !== gauge.last) {
      gauge.last = sk; gauge.speed.textContent = sk;
      let g = 1; for (let i = 0; i < GEARS.length; i++) if (kmh >= GEARS[i]) g = i + 1;
      if (g !== gauge.lastG) { gauge.lastG = g; gauge.gear.textContent = 'GEAR ' + g; }
    }
    const nl = Math.ceil(clamp(nitro / 100, 0, 1) * NSEG - 0.01), mode = boosting ? 'b' : 'c';
    if (nl !== gauge.nlit || mode !== gauge.mode) {
      gauge.nlit = nl; gauge.mode = mode;
      gauge.nsegs.forEach((el, k) => el.setAttribute('fill', k < nl ? (boosting ? '#33d6ff' : 'url(#nosFill)') : 'rgba(255,255,255,.14)'));
      gauge.pct.textContent = boosting ? 'BOOST' : Math.round(nitro) + '%';
      hud.nitroBox.classList.toggle('on', boosting);
    }
  }
  function updateHUD() {
    const p = state.player, rk = ranking();
    const place = rk.indexOf(p) + 1;
    if (place !== lastPos) { lastPos = place; hud.pos.innerHTML = '<b>' + place + '</b><span>/' + state.cars.length + '</span>'; }
    const kmh = p.speed * KMH;
    state.stats.top = Math.max(state.stats.top, kmh);
    updateGauges(kmh, p.nitro, p.nitroOn);
    hud.time.textContent = fmt(state.raceT);
    hud.vig.style.opacity = p.nitroOn ? 0.45 : 0;
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
    loadWorld(0);
    spawnRace(true);
    state.leadS = state.world.track.startS + 120; state.time = 0;
    show('hud', false); show('menu', true); show('levels', false); show('result', false); show('pauseScr', false);
    const reached = Math.min(save.reached || 1, 8), stars = Object.values(save.best).reduce((a, b) => a + (b.stars || 0), 0);
    $('pips').innerHTML = LEVELS.map((L, i) => '<i class="' + (save.done || i + 1 < reached ? 'done' : i + 1 === reached ? 'now' : '') + '"></i>').join('');
    $('menuBest').textContent = save.done ? 'Career complete · ' + stars + ' / 24 ★ · Tracks is open: pick any track.'
      : reached > 1 ? 'Every race starts at Track 1 · your best run reached Track ' + reached + '.' : 'Start at Track 1, finish top 3 to go on. Reach Track 8 to open Tracks.';
    setBtn('playBtn', 'Play');
  }
  function setBtn(id, txt) { $(id).querySelector('span').textContent = txt; }

  function startLevel(idx) {
    audio.init();
    showLoading('Level ' + (idx + 1) + ' · ' + LEVELS[idx].name, () => {
      loadWorld(idx);
      state.demo = false; state.autopilot = false;
      spawnRace(false);
      state.mode = 'countdown'; state.countT = 0; state.lastCount = 4; state.lastBeep = 4; cam.init = false; state.paused = false;
      show('menu', false); show('levels', false); show('result', false); show('pauseScr', false); show('hud', true);
      const L = state.world.L;
      hud.intro.innerHTML = '<div class="n">LEVEL ' + L.id + ' OF 8</div><div class="t">' + L.name.toUpperCase() + '</div><div class="w">' + L.twist + '</div><div class="c">Your ride: ' + CARS[L.car].name + (state.layout === 'ctl-portrait' ? ' · swipe left / right to steer' : state.layout === 'ctl-desktop' ? ' · ← → to steer' : '') + '</div>';
      hud.count.textContent = ''; hud.time.textContent = '0:00.0'; lastPos = -1;
      state.lastLit = -1; lights.forEach(el => el.classList.remove('on')); $('lights').classList.remove('go'); $('lights').classList.add('show');
      updateCamera(0.016); placeAll(0.016);
    });
  }
  function placeAll(dt) { state.cars.forEach(c => placeCar(c, dt)); }

  function finishRace() {
    const p = state.player;
    state.mode = 'finish'; state.finishT = 0;
    const place = state.cars.filter(c => c.finished).length;  // player already flagged finished
    p.place = place;
    audio.fin(); celebrate(); hud.intro.innerHTML = ''; toast(place === 1 ? 'VICTORY!' : 'FINISH!', '#ffe45c');
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
    if (passed && idx < 7) save.reached = Math.max(save.reached || 1, idx + 2);
    if (idx === 7) save.done = true;                       // raced the last track: free track select opens
    persist();
    $('resLevel').textContent = 'Track ' + L.id + ' · ' + L.name;
    $('resPlace').innerHTML = place + '<sup>' + ['ST', 'ND', 'RD', 'TH', 'TH', 'TH'][place - 1] + '</sup>';
    $('resStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    const best = save.best[L.id].time;
    const rows = [['Time', fmt(p.finishTime)], ['Best', best ? fmt(best) + (newBest && passed ? ' NEW' : '') : '—'], ['Top speed', Math.round(state.stats.top) + ' km/h'], ['Nitro pads', state.stats.boosts], ['Crashes', state.stats.crashes]];
    $('resStats').innerHTML = rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('');
    $('resMsg').textContent = idx === 7 ? 'You reached the last track! Tracks is now open: pick any track to race.'
      : !passed ? 'Finish in the top 3 to go on to Track ' + (idx + 2) + '.' : 'Podium! Track ' + (idx + 2) + ' is next.';
    $('nextBtn').style.display = passed && idx < 7 ? '' : 'none';
    setBtn('nextBtn', 'Next track ▶');
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
      const lit = clamp(Math.floor((state.countT - 0.4) / 0.6) + 1, 0, 5);
      if (lit !== state.lastLit) { state.lastLit = lit; lights.forEach((el, k) => el.classList.toggle('on', k < lit)); if (lit > 0) audio.beep(false); }
      if (state.countT >= 3.4) {
        state.mode = 'race'; hud.count.textContent = 'GO!'; hud.count.classList.remove('tick'); void hud.count.offsetWidth; hud.count.classList.add('tick');
        audio.beep(true); hud.intro.innerHTML = ''; $('lights').classList.add('go'); setTimeout(() => { if (state.mode === 'race') hud.count.textContent = ''; $('lights').classList.remove('show', 'go'); }, 900);
        state.cars.forEach(c => { c.speed = 8; });
      }
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
      audio.engine(clamp(p.speed / (w.L.base * 1.5), 0, 1), p.nitroOn, true);
    }
    w.update(dt, state.time, camera, _vel);
    updateSparks(dt); updateTrails(dt); updateFireworks(dt);
  }

  // simple autopilot used by the headless tests (window.SkyGame.autoplay): drives like a rival, minus the rubber band
  function autopilotInput(c) { c.lane0 = 0; c.laneAmp = 0; c.react = 90; }

  /* ---------------- UI wiring ---------------- */
  // career: tracks unlock one after another and only the next one can be raced, until all 8 are cleared
  function buildLevelGrid() {
    const g = $('grid'); g.innerHTML = '';
    $('gridNote').textContent = save.done ? 'Free play · pick any track' : 'Track 1 is always open · reach Track 8 in a run to unlock the rest';
    LEVELS.forEach((L, i) => {
      const open = save.done || i === 0;
      const c = document.createElement('button');
      c.className = 'card' + (open ? (save.done ? '' : ' next') : ' locked');
      const s = L.theme.sky; c.style.background = 'linear-gradient(180deg,' + s.top + ',' + s.mid + ' 60%,' + s.hor + ')';
      const b = save.best[L.id], stars = b ? b.stars : 0;
      const chip = open ? (b ? '<span class="chip done">' + '★'.repeat(stars) + '☆'.repeat(3 - stars) + '</span>' : (save.done ? '' : '<span class="chip next">START</span>')) : '<span class="chip">🔒</span>';
      c.innerHTML = '<div class="n">' + L.id + '</div>' + chip + '<div class="t">' + L.name + '</div><div class="s">' + L.tag + '</div>';
      if (!open) c.setAttribute('aria-disabled', 'true');
      c.addEventListener('click', () => {
        if (open) startLevel(i);
        else $('gridNote').textContent = 'Locked · play from Track 1 and reach Track 8 to pick tracks freely.';
      });
      g.appendChild(c);
    });
  }
  $('playBtn').addEventListener('click', () => startLevel(0));
  $('levelsBtn').addEventListener('click', () => { buildLevelGrid(); show('menu', false); show('levels', true); });
  $('levelsBack').addEventListener('click', () => { if (state.mode !== 'menu') { startMenuDemo(); return; } show('levels', false); show('menu', true); });
  $('soundBtn').addEventListener('click', () => { audio.init(); audio.setMute(save.sound); setBtn('soundBtn', save.sound ? 'Sound on' : 'Sound off'); });
  setBtn('soundBtn', save.sound ? 'Sound on' : 'Sound off');
  $('nextBtn').addEventListener('click', () => startLevel(Math.min(state.levelIdx + 1, 7)));
  $('retryBtn').addEventListener('click', () => startLevel(state.levelIdx));
  $('resLevelsBtn').addEventListener('click', () => { startMenuDemo(); buildLevelGrid(); show('menu', false); show('levels', true); });
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
