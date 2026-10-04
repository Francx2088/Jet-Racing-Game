/* Sky Racing - track generator (pure math, no THREE dependency).
   A track is built by "flying a turtle": each command rotates the frame
   (yaw about world-up, pitch about the road's right axis, roll about the
   forward axis) while stepping forward DS units at a time. That makes
   banked turns, coils, loops and corkscrews trivial and always smooth. */
(function (root) {
  'use strict';
  const DS = 2;
  const D2R = Math.PI / 180;

  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  function rot(v, k, a) {
    const c = Math.cos(a), s = Math.sin(a), kv = cross(k, v), kd = dot(k, v) * (1 - c);
    return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
  }
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function build(level) {
    const sc = level.scale || 1;
    let p = [0, 0, 0], f = [0, 0, -1], u = [0, 1, 0];
    const P = [], F = [], U = [], G = [];
    const E = t => t - Math.sin(2 * Math.PI * t) / (2 * Math.PI);

    function seg(c) {
      const len = c.len * (c.noscale ? 1 : sc);
      const n = Math.max(1, Math.round(len / DS));
      const yaw = (c.yaw || 0) * D2R, pitch = (c.pitch || 0) * D2R, roll = (c.roll || 0) * D2R, bank = (c.bank || 0) * D2R;
      const mix = c.mix || 0;
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const w = (1 - mix) * (E(t1) - E(t0)) + mix * (t1 - t0);
        P.push(p[0], p[1], p[2]); F.push(f[0], f[1], f[2]); U.push(u[0], u[1], u[2]); G.push(c.gap ? 1 : 0);
        const dy = yaw * w, dp = pitch * w;
        let dr = roll * w;
        if (bank && yaw) dr += -Math.sign(yaw) * bank * (Math.sin(Math.PI * t1) - Math.sin(Math.PI * t0));
        if (dy) { const ax = c.local ? u : [0, 1, 0]; f = rot(f, ax, dy); u = rot(u, ax, dy); }
        if (dp) { const r = cross(f, u); f = rot(f, r, dp); u = rot(u, r, dp); }
        if (c.unroll) {                       // level the road again: remove whatever bank is left, smoothly
          const r0 = cross(f, u), rem = 1 - E(t0);
          if (rem > 1e-6) dr += Math.asin(Math.max(-1, Math.min(1, r0[1]))) * (E(t1) - E(t0)) / rem;
        }
        if (dr) u = rot(u, f, dr);
        f = norm(f);
        const d = dot(u, f); u = norm([u[0] - f[0] * d, u[1] - f[1] * d, u[2] - f[2] * d]);
        p = [p[0] + f[0] * DS, p[1] + f[1] * DS, p[2] + f[2] * DS];
      }
    }
    level.cmds.flat(Infinity).forEach(seg);
    // final run-out so the finish line has road behind and ahead of it
    const n = P.length / 3;
    const Pa = new Float32Array(P), Fa = new Float32Array(F), Ua = new Float32Array(U);
    const Ra = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = cross([Fa[i * 3], Fa[i * 3 + 1], Fa[i * 3 + 2]], [Ua[i * 3], Ua[i * 3 + 1], Ua[i * 3 + 2]]);
      Ra[i * 3] = r[0]; Ra[i * 3 + 1] = r[1]; Ra[i * 3 + 2] = r[2];
    }
    const kappa = new Float32Array(n);
    for (let i = 0; i < n - 1; i++) {
      const dx = Fa[(i + 1) * 3] - Fa[i * 3], dy = Fa[(i + 1) * 3 + 1] - Fa[i * 3 + 1], dz = Fa[(i + 1) * 3 + 2] - Fa[i * 3 + 2];
      kappa[i] = (dx * Ra[i * 3] + dy * Ra[i * 3 + 1] + dz * Ra[i * 3 + 2]) / DS;
    }
    return { n, P: Pa, F: Fa, U: Ua, R: Ra, gap: new Uint8Array(G), kappa, length: n * DS,
      startS: 70, finishS: (n - 75) * DS };
  }

  // Pick spots for boost pads and obstacles along the road.
  function makeObstacle(type, i, w, m, rnd) {
    const pick = f => (rnd() * 2 - 1) * w * f;
    switch (type) {
      case 'cones': return { i, type, lat: pick(0.3), half: 2.4 };
      case 'bar': return { i, type, lat: 0, amp: w * 0.26, freq: 0.7 + rnd() * 0.5, phase: rnd() * 6.28, half: 2.5 };
      case 'spinner': return { i, type, lat: pick(0.12), arm: w * 0.24, freq: 1.0 + rnd() * 0.5, phase: rnd() * 6.28, half: 0.7 };
      case 'gate': { const gap = m.gateGap || 5.5; return { i, type, gap, gapLat: pick(0.22), half: w / 2 }; }
      case 'laser': return { i, type, side: rnd() < 0.5 ? -1 : 1, ext: w * 0.62, period: 2.2 + rnd() * 0.8, duty: 0.55, phase: rnd() * 3, half: w / 2 };
      default: return { i, type: 'block', lat: pick(0.34), half: 1.9 };
    }
  }

  function features(track, level) {
    const rnd = mulberry(level.id * 7919 + 13);
    const { n, F, U, gap } = track;
    const w = level.width, m = level.mech;
    const out = { pads: [], obst: [] };
    const free = i => {
      for (let d = -8; d <= 8; d += 2) {
        const j = Math.max(0, Math.min(n - 1, i + d));
        if (gap[j] || U[j * 3 + 1] < 0.8 || Math.abs(F[j * 3 + 1]) > 0.5) return false;
      }
      return true;
    };
    const mix = m.mix || ['block'];
    const kinds = [];
    for (let k = 0; k < (m.pads || 0); k++) kinds.push('pad');
    for (let k = 0; k < (m.obst || 0); k++) kinds.push('obst');
    for (let k = kinds.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [kinds[k], kinds[j]] = [kinds[j], kinds[k]]; }
    // never put two hazards back to back, so there is always room to recover
    const lo = 200, hi = n - 120, step = (hi - lo) / Math.max(1, kinds.length);
    let lastObst = -999, mixIdx = Math.floor(rnd() * mix.length);
    kinds.forEach((kind, idx) => {
      const target = Math.round(lo + step * (idx + 0.2 + rnd() * 0.6));
      let i = -1;
      for (let d = 0; d < 90; d += 3) {
        if (target + d < hi && free(target + d)) { i = target + d; break; }
        if (target - d > lo && free(target - d)) { i = target - d; break; }
      }
      if (i < 0) return;
      if (kind === 'pad') out.pads.push({ i, lat: (rnd() * 2 - 1) * w * 0.3 });
      else {
        if (i - lastObst < 36) return;
        lastObst = i;
        const type = mix[mixIdx++ % mix.length];
        out.obst.push(makeObstacle(type, i, w, m, rnd));
      }
    });
    return out;
  }

  // Debug helper (used by the node validator).
  function selfIntersections(track, width) {
    const { n, P } = track, bad = [];
    for (let i = 0; i < n; i += 2) for (let j = i + 90; j < n; j += 2) {
      const dx = P[i * 3] - P[j * 3], dy = P[i * 3 + 1] - P[j * 3 + 1], dz = P[i * 3 + 2] - P[j * 3 + 2];
      if (dx * dx + dy * dy + dz * dz < (width * 0.5 + 4) * (width * 0.5 + 4)) { bad.push([i, j]); }
    }
    return bad;
  }

  root.SkyTrack = { DS, build, features, selfIntersections, mulberry };
  if (typeof module !== 'undefined') module.exports = root.SkyTrack;
})(typeof window !== 'undefined' ? window : globalThis);
