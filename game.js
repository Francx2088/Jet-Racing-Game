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
  const input = { left: false, right: false, kl: false, kr: false, boost: false, steer: 0 };
  const pointers = new Map();
  function syncPointers() { let l = false, r = false; pointers.forEach(x => { if (x < window.innerWidth / 2) l = true; else r = true; }); input.left = l; input.right = r; }
  window.addEventListener('pointerdown', e => { audio.init(); if (e.target.closest('button,.panel,.card')) return; pointers.set(e.pointerId, e.clientX); syncPointers(); });
  window.addEventListener('pointermove', e => { if (pointers.has(e.pointerId)) { pointers.set(e.pointerId, e.clientX); syncPointers(); } });
  const pUp = e => { pointers.delete(e.pointerId); syncPointers(); };
  window.addEventListener('pointerup', pUp); window.addEventListener('pointercancel', pUp);
  window.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', e => {
    audio.init();
    if (e.key === 'ArrowLeft' || e.key === 'a') input.kl = true;
    if (e.key === 'ArrowRight' || e.key === 'd') input.kr = true;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'Shift') input.boost = true;
    if (e.key === 'Escape' || e.key === 'p') togglePause();
    if (e.key === 'Enter' && state.mode === 'menu') startLevel(Math.min(save.unlocked, 8) - 1);
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a') input.kl = false;
    if (e.key === 'ArrowRight' || e.key === 'd') input.kr = false;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'Shift') input.boost = false;
  });
  const boostBtn = $('boost');
  boostBtn.addEventListener('pointerdown', e => { e.preventDefault(); input.boost = true; boostBtn.classList.add('down'); audio.init(); });
  const boostUp = () => { input.boost = false; boostBtn.classList.remove('down'); };
  boostBtn.addEventListener('pointerup', boostUp); boostBtn.addEventListener('pointercancel', boostUp); boostBtn.addEventListener('pointerleave', boostUp);

  /* ---------------- game state ---------------- */
  const state = { mode: 'menu', levelIdx: 0, world: null, cars: [], player: null, time: 0, raceT: 0, countT: 0, finishT: 0, paused: false, autopilot: false, resultShown: false };
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
      fr: 0, yawVis: 0, spin: 0, hitCd: 0, padCd: 0, finished: false, finishTime: 0, skill: 1, lane0: 0, laneF: 1, laneAmp: 0, ph: 0, wheelRot: 0, scrape: 0, draft: 0, combo: 0 };
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
    state.stats = { rings: 0, orbs: 0, boosts: 0, crashes: 0, top: 0 };
  }

  /* ---------------- gameplay update ---------------- */
  const CENT = 0.2;
  function obstacleNear(c, ahead) {
    const w = state.world, o = w.feats.obst, t = state.time;
    for (const ob of o) {
      const d = ob.i * DS - c.s;
      if (d > -2 && d < ahead) return ob;
    }
    return null;
  }

  function stepCar(c, dt, drive) {
    const w = state.world, L = w.L, tr = w.track, M = L.mech;
    frameAt(c.s, fr);
    const halfW = L.width / 2 - 1.15;
    // ---- lateral ----
    if (c.isPlayer && !drive) {
      const want = clamp((input.right || input.kr ? 1 : 0) - (input.left || input.kl ? 1 : 0), -1, 1);
      c.steerS += (want - c.steerS) * (1 - Math.exp(-11 * dt));
      const grip = clamp(0.55 + c.speed / 220, 0.55, 1.0);
      c.latV += c.steerS * 52 * grip * (M.ice ? 0.75 : 1) * dt;
      c.latV += -fr.k * c.speed * c.speed * CENT * dt;
      if (M.gust) c.latV += Math.sin(state.time * 0.9 + c.s * 0.004) * Math.sin(state.time * 2.3 + 1.7) * M.gust * dt * 1.9 * (0.6 + 0.4 * Math.sin(c.s * 0.0013));
      c.latV *= Math.exp(-(M.ice ? 1.7 : 3.6) * dt);
      c.latV = clamp(c.latV, -30, 30);
      c.lat += c.latV * dt;
    } else {
      // AI steering toward its lane, avoiding hazards
      let laneT = c.lane0 + Math.sin(state.time * c.laneF + c.ph) * c.laneAmp;
      const ob = obstacleNear(c, 70);
      if (ob) {
        const ol = w.obstLat(ob, state.time);
        if (Math.abs(laneT - ol) < ob.half + 2.8) laneT = ol + (laneT >= ol ? 1 : -1) * (ob.half + 3.2);
        if (Math.abs(laneT) > halfW - 0.5) laneT = clamp(laneT, -halfW + 0.5, halfW - 0.5);
        if (Math.abs(laneT - ol) < ob.half + 2.0) laneT = ol > 0 ? ol - ob.half - 2.4 : ol + ob.half + 2.4;
      }
      // dodge other cars ahead
      for (const o of state.cars) {
        if (o === c) continue; const d = o.s - c.s;
        if (d > 0 && d < 16 && Math.abs(o.lat - c.lat) < 2.4) laneT = c.lat + (c.lat >= o.lat ? 1 : -1) * 3.2;
      }
      laneT = clamp(laneT, -halfW + 0.5, halfW - 0.5);
      const prev = c.lat;
      c.lat += clamp((laneT - c.lat) * 2.2, -13, 13) * dt;
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
    if (!c.isPlayer && !state.demo) {
      const p = state.player, lead = p.s - c.s;
      if (lead > 40) target *= 1 + Math.min(L.aiRubber * 1.6, (lead - 40) / 800);
      else if (lead < -60) target *= 1 - Math.min(0.1, (-lead - 60) / 1100);
      const ahead = tr.kappa[Math.min(tr.n - 2, c.fr + 12)] || 0;
      target *= 1 - Math.min(0.09, Math.abs(ahead) * 42);
    }
    if (c.boostT > 0) { c.boostT -= dt; target *= 1.34; }
    c.nitroOn = false;
    if (c.isPlayer && state.mode === 'race') {
      if ((input.boost || (state.autopilot && c.nitro > 15)) && c.nitro > 0) { c.nitroOn = true; c.nitro = Math.max(0, c.nitro - 30 * dt); target *= 1.45; }
      if (M.regen) c.nitro = Math.min(100, c.nitro + M.regen * dt);
    }
    target *= 1 - fr.f.y * 0.1;
    if (c.draft > 0) target *= 1.05;
    const acc = c.nitroOn || c.boostT > 0 ? 2.6 : (c.speed < target ? 1.25 : 0.8);
    c.speed += (target - c.speed) * (1 - Math.exp(-acc * dt));
    c.s += c.speed * dt;
    c.fr = Math.min(tr.n - 2, Math.floor(c.s / DS));
    c.scrape = Math.max(0, c.scrape - dt);
    c.hitCd = Math.max(0, c.hitCd - dt); c.padCd = Math.max(0, c.padCd - dt);
    if (c.spin > 0) c.spin = Math.max(0, c.spin - dt / 0.9);
  }

  function pickups(c, dt) {
    const w = state.world, F = w.feats, t = state.time, L = w.L, st = state.stats;
    const idx = c.s / DS;
    for (const p of F.pads) {
      if (Math.abs(p.i - idx) < 5 && Math.abs(c.lat - p.lat) < 4.2 && c.padCd <= 0) {
        c.padCd = 1.0; c.boostT = 1.8; if (c.isPlayer) { c.nitro = Math.min(100, c.nitro + 8); st.boosts++; toast('BOOST!', '#ffe45c'); audio.boost(); kick(0.5); }
      }
    }
    if (!c.isPlayer) return;
    for (const r of F.rings) {
      if (!r.got && Math.abs(r.i - idx) < 2.5 && Math.abs(c.lat - r.lat) < 5.8) {
        r.got = true; r.fade = 0; c.nitro = Math.min(100, c.nitro + 24); c.boostT = Math.max(c.boostT, 0.7); st.rings++;
        toast('RING +NITRO', '#7df9ff'); audio.ring(); flash(0.18);
      }
    }
    for (const o of F.orbs) {
      if (!o.got && Math.abs(o.i - idx) < 2.2 && Math.abs(c.lat - o.lat) < 2.4) {
        o.got = true; c.nitro = Math.min(100, c.nitro + 4); st.orbs++; c.combo = Math.min(8, c.combo + 1); c.comboT = 1.2; audio.ding(c.combo);
      }
    }
    if (c.comboT > 0) { c.comboT -= dt; if (c.comboT <= 0) c.combo = 0; }
    for (const o of F.obst) {
      if (c.hitCd <= 0 && Math.abs(o.i - idx) < 1.6 && Math.abs(c.lat - w.obstLat(o, t)) < o.half + 1.1) {
        c.hitCd = 1.3; c.speed *= 0.45; c.spin = 1; c.nitro = Math.max(0, c.nitro - 10); st.crashes++;
        toast('CRASH!', '#ff5a3a'); audio.crash(); kick(1);
        frameAt(c.s, fr); emitSparks(V3(fr.p.x + fr.r.x * c.lat, fr.p.y + 1, fr.p.z + fr.r.z * c.lat), 24, V3(0, 4, 0), 14);
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
      if (d > 3 && d < 20 && Math.abs(o.lat - p.lat) < 2.8) { p.draft = 1; p.nitro = Math.min(100, p.nitro + (M.draft || 8) * dt()); }
    }
    function dt() { return state.dt; }
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
    camera.fov = portrait ? clamp(cam.fov * 1.32, 60, 100) : cam.fov; camera.updateProjectionMatrix();
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
  const hud = { pos: $('pos'), time: $('time'), speed: $('speed').querySelector('b'), nitro: $('nitroFill'), toast: $('toast'), count: $('count'), vig: $('vig'), flash: $('flash'), lvl: $('lvlname'), intro: $('intro') };
  let lastSpeed = -1, lastPos = -1, lastNitro = -1, toastTimer = 0;
  function toast(txt, color) { hud.toast.textContent = txt; hud.toast.style.color = color || '#fff'; hud.toast.classList.remove('show'); void hud.toast.offsetWidth; hud.toast.classList.add('show'); }
  function flash(a) { hud.flash.style.opacity = a; setTimeout(() => { hud.flash.style.opacity = 0; }, 90); }
  const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
  function updateHUD() {
    const p = state.player, rk = ranking();
    const place = rk.indexOf(p) + 1;
    if (place !== lastPos) { lastPos = place; hud.pos.innerHTML = '<b>' + place + '</b><span>' + ['st', 'nd', 'rd', 'th', 'th', 'th', 'th'][place - 1] + '</span>'; }
    const kmh = Math.round(p.speed * 2.0);
    if (kmh !== lastSpeed) { lastSpeed = kmh; hud.speed.textContent = kmh; }
    const nv = Math.round(p.nitro);
    if (nv !== lastNitro) { lastNitro = nv; hud.nitro.style.width = nv + '%'; }
    hud.nitro.classList.toggle('on', p.nitroOn);
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
      $('hintL').style.opacity = $('hintR').style.opacity = '';
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
    $('resTime').textContent = 'Time ' + fmt(p.finishTime) + ' · Rings ' + state.stats.rings + ' · Crashes ' + state.stats.crashes;
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
        if (c.isPlayer && state.mode === 'race') pickups(c, dt);
        else if (!c.isPlayer && state.mode === 'race') pickups(c, dt);
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

  // simple autopilot used by the headless tests (window.SkyGame.autoplay)
  function autopilotInput(c) {
    const w = state.world, ob = obstacleNear(c, 60);
    let want = c.lane0 || 0;
    want = Math.sin(state.time * 0.4) * w.L.width * 0.12;
    const pad = w.feats.pads.find(p => p.i * DS - c.s > 10 && p.i * DS - c.s < 90);
    if (pad) want = pad.lat;
    if (ob) { const ol = w.obstLat(ob, state.time); if (Math.abs(want - ol) < ob.half + 2.6) want = ol + (want >= ol ? 1 : -1) * (ob.half + 3); }
    c.lane0 = want; c.laneAmp = 0;
  }

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
