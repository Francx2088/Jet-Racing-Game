/* Crazy Racers - procedural race cars.
   The body is lofted from ~60 cross-sections, so it curves in every direction: sculpted fender crests,
   a lower hood between them, tumblehome sides, real wheel arches cut into the shell. A painted livery
   (base colour, stripes or swooshes, door numbers, sponsor plates, carbon sills) is mapped over the
   shell, and the head/tail lights are painted into an emissive map so they follow the bodywork. */
(function (root) {
  'use strict';
  const T = THREE;
  const lin = hex => new T.Color(hex).convertSRGBToLinear();
  const sstep = t => t * t * (3 - 2 * t);

  // smooth key-framed profile: keys = [[u, value], ...]
  function K(keys) {
    const k = keys.slice().sort((a, b) => a[0] - b[0]).filter((p, i, arr) => i === 0 || p[0] - arr[i - 1][0] > 0.015);
    return u => {
      if (u <= k[0][0]) return k[0][1];
      for (let i = 0; i < k.length - 1; i++) {
        const [u0, v0] = k[i], [u1, v1] = k[i + 1];
        if (u <= u1) return v0 + (v1 - v0) * sstep((u - u0) / (u1 - u0));
      }
      return k[k.length - 1][1];
    };
  }
  // Catmull-Rom through 2D points
  function cr(pts, per) {
    const out = [], n = pts.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      for (let s = 0; s < per; s++) {
        const t = s / per, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    out.push(pts[n - 1].slice());
    return out;
  }

  /* ---------------- body model (shape functions shared by the shell, cabin and details) ---------------- */
  function model(sp) {
    const L = sp.len / 2, wr = sp.wr, hb = 0.15, archR = wr + 0.06;
    const uF = sp.uF || -0.62, uR = sp.uR || 0.64;
    const half = sp.wid / 2, base = half - sp.flare;
    const archTop = wr + archR;
    const fcrest = Math.max(sp.hoodH + 0.04, archTop + 0.06 + sp.fender), rcrest = Math.max(sp.deckH + 0.02, archTop + 0.08 + sp.fender);
    const [c0, c1, c2, c3] = sp.cab;
    const a = K([[-1, base * 0.72], [-0.9, base * 0.9], [uF, base + sp.flare * 0.85], [uF + 0.3, base * 0.98], [0.05, base * 0.965], [uR, half], [0.93, base * 0.98], [1, base * 0.9]]);
    const Ht = K([[-1, sp.noseH - 0.09], [-0.95, sp.noseH], [uF - 0.27, (sp.noseH + fcrest) / 2], [uF, fcrest], [Math.min(uF + 0.3, c0 - 0.03), Math.max(sp.hoodH + 0.04, (fcrest + sp.beltH) / 2)],
      [c0 + 0.05, sp.beltH], [uR - 0.3, sp.beltH + 0.01], [uR, rcrest], [0.94, sp.deckH], [1, sp.tailH]]);
    const dip = K([[-1, 0.02], [uF, Math.max(0, fcrest - sp.hoodH)], [(uF + c0) / 2, Math.max(0.02, (fcrest - sp.hoodH) * 0.5)], [c0, 0], [c3, 0], [uR, Math.max(0, rcrest - sp.deckH)], [1, 0.03]]);
    const ends = K([[-1, 0.24], [-0.9, hb], [0.9, hb], [1, 0.3]]);
    const B = u => {
      const z = u * L; let b = Math.max(hb, ends(u));
      for (const zc of [uF * L, uR * L]) { const dz = z - zc; if (Math.abs(dz) < archR) b = Math.max(b, wr + Math.sqrt(archR * archR - dz * dz)); }
      return b;
    };
    const S = u => hb + (Ht(u) - hb) * 0.5;
    const top = u => Ht(u) - dip(u);                       // height of the body centre line
    const rh = K([[c0, 0], [c1, sp.roofH - sp.beltH], [c2, sp.roofH - sp.beltH - 0.02], [c3, 0]]);
    const roof = u => top(u) + (u > c0 && u < c3 ? rh(u) : 0);
    const half2 = u => {                                   // right half of the shell section, bottom centre -> top centre
      const A = a(u), H = Ht(u), D = dip(u), Bc = B(u), s = S(u);
      return cr([[0, Bc], [A * 0.84, Bc], [A, hb + (s - hb) * 0.5], [A * 0.99, s], [A * 0.93, s + (H - s) * 0.62], [A * 0.8, H], [A * 0.5, H - D * 0.8], [0, H - D]], 3)
        .map(([x, y]) => [Math.max(0, x), Math.max(y, Bc)]);
    };
    const perim = u => { const h = half2(u); let p = 0; for (let i = 1; i < h.length; i++) p += Math.hypot(h[i][0] - h[i - 1][0], h[i][1] - h[i - 1][1]); return 2 * p; };
    return { L, wr, hb, archR, uF, uR, a, Ht, dip, B, S, top, roof, half2, perim, c0, c1, c2, c3 };
  }

  /* ---------------- lofted shell ---------------- */
  function shellGeometry(m) {
    const N = 64, pos = [], uv = [], dark = [], idxPaint = [], idxDark = [];
    let R = 0;
    for (let i = 0; i <= N; i++) {
      const u = -1 + 2 * i / N, h = m.half2(u), Bc = m.B(u), z = u * m.L;
      const ring = h.concat(h.slice(0, -1).reverse().slice(0, -1).map(([x, y]) => [-x, y]));  // right side up, left side down
      ring.push(ring[0]);
      R = ring.length;
      let len = 0; const cum = [0];
      for (let j = 1; j < R; j++) { len += Math.hypot(ring[j][0] - ring[j - 1][0], ring[j][1] - ring[j - 1][1]); cum.push(len); }
      ring.forEach(([x, y], j) => { pos.push(x, y, z); uv.push((u + 1) / 2, cum[j] / len); dark.push(y <= Bc + 0.002 ? 1 : 0); });
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < R - 1; j++) {
      const a = i * R + j, b = a + 1, c = a + R, d = c + 1;
      const tgt = dark[a] && dark[b] && dark[c] && dark[d] ? idxDark : idxPaint;
      tgt.push(a, c, b, b, c, d);
    }
    // nose and tail caps (dark: grille / rear panel)
    for (const [i, sgn] of [[0, -1], [N, 1]]) {
      const c = pos.length / 3; let cy = 0;
      for (let j = 0; j < R; j++) cy += pos[(i * R + j) * 3 + 1];
      pos.push(0, cy / R, pos[(i * R) * 3 + 2]); uv.push(i ? 1 : 0, 0.5);
      for (let j = 0; j < R - 1; j++) { const a = i * R + j; if (sgn < 0) idxDark.push(c, a, a + 1); else idxDark.push(c, a + 1, a); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idxPaint.concat(idxDark));
    g.addGroup(0, idxPaint.length, 0); g.addGroup(idxPaint.length, idxDark.length, 1);
    g.computeVertexNormals();
    return g;
  }
  // glass cabin with a painted roof panel (roof uses the body's livery UVs so stripes run over it)
  function cabinGeometry(m, sp) {
    const N = 30, pos = [], uv = [], roofF = [], idxGlass = [], idxRoof = [];
    let R = 0;
    for (let i = 0; i <= N; i++) {
      const u = m.c0 + (m.c3 - m.c0) * i / N, z = u * m.L;
      const A = m.a(u), base = m.top(u) - 0.02, gb = A * 0.78 * (sp.cabW || 1), Rt = m.roof(u), h = Math.max(0.004, Rt - base), gt = gb * 0.66;
      const half = cr([[gb, base], [gb * 0.95, base + h * 0.45], [gt * 1.08, base + h * 0.88], [gt * 0.72, base + h - 0.004], [0, base + h]], 3);
      const ring = half.concat(half.slice(0, -1).reverse().map(([x, y]) => [-x, y]));
      R = ring.length;
      const P = m.perim(u);
      const isRoof = u > m.c1 + 0.03 && u < m.c2 - 0.02;
      ring.forEach(([x, y], j) => {
        pos.push(x, y, z);
        uv.push((u + 1) / 2, 0.5 - x / P);
        const k = j < half.length ? j : R - 1 - j;               // index from the base on either side
        roofF.push(isRoof && k >= half.length - 5 ? 1 : 0);
      });
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < R - 1; j++) {
      const a = i * R + j, b = a + 1, c = a + R, d = c + 1;
      (roofF[a] && roofF[b] && roofF[c] && roofF[d] ? idxRoof : idxGlass).push(a, c, b, b, c, d);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idxGlass.concat(idxRoof));
    g.addGroup(0, idxGlass.length, 0); g.addGroup(idxGlass.length, idxRoof.length, 1);
    g.computeVertexNormals();
    return g;
  }

  /* ---------------- livery ---------------- */
  // canvas x = along the car (0 nose .. 1 tail); canvas y = around the section.
  // Right side: lower half of the canvas (bottom -> top of car); left side: upper half (top -> bottom).
  function liveryTextures(sp, m, colors, hi) {
    const W = hi ? 1024 : 512, H = hi ? 512 : 256;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const em = document.createElement('canvas'); em.width = W; em.height = H;
    const g = cv.getContext('2d'), e = em.getContext('2d');
    const X = s => s * W, Y = t => (1 - t) * H;
    const kx = W / sp.len, ky = H / m.perim(0);              // px per metre along / around
    g.fillStyle = colors.base; g.fillRect(0, 0, W, H);
    e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
    // subtle panel shading towards the sills
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, 'rgba(0,0,0,.28)'); grd.addColorStop(0.2, 'rgba(0,0,0,0)'); grd.addColorStop(0.5, 'rgba(255,255,255,.06)'); grd.addColorStop(0.8, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,.28)');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // both-sides helper: f(ctx, t) draws one side; mirror maps t -> 1 - t for the left side
    const sides = fn => { fn(t => t); fn(t => 1 - t); };
    const poly = (ctx, pts, mt) => { ctx.beginPath(); pts.forEach(([s, t], i) => i ? ctx.lineTo(X(s), Y(mt(t))) : ctx.moveTo(X(s), Y(mt(t)))); ctx.closePath(); ctx.fill(); };
    // pattern
    if (sp.livery === 'stripes') {
      g.fillStyle = colors.accent; g.fillRect(0, Y(0.5) - 0.2 * ky, W, 0.13 * ky); g.fillRect(0, Y(0.5) + 0.07 * ky, W, 0.13 * ky);
      g.fillStyle = colors.trim; g.fillRect(0, Y(0.5) - 0.24 * ky, W, 0.02 * ky); g.fillRect(0, Y(0.5) + 0.22 * ky, W, 0.02 * ky);
      sides(mt => { g.fillStyle = colors.accent; poly(g, [[0.12, 0.2], [0.9, 0.3], [0.9, 0.34], [0.12, 0.25]], mt); });
    } else if (sp.livery === 'arrow') {
      sides(mt => { g.fillStyle = colors.accent; poly(g, [[0.02, 0.33], [0.38, 0.12], [1, 0.12], [1, 0.26], [0.45, 0.26], [0.2, 0.36]], mt);
        g.fillStyle = colors.trim; poly(g, [[0.2, 0.36], [0.45, 0.26], [1, 0.26], [1, 0.28], [0.46, 0.28], [0.22, 0.38]], mt); });
      g.fillStyle = colors.accent; poly(g, [[0, 0.47], [0.3, 0.49], [0.3, 0.51], [0, 0.53]], t => t);
    } else if (sp.livery === 'split') {
      sides(mt => { g.fillStyle = colors.accent; poly(g, [[0.42, 0.0], [0.62, 0.5], [1, 0.5], [1, 0], [0.42, 0]], mt);
        g.fillStyle = colors.trim; poly(g, [[0.38, 0], [0.42, 0], [0.62, 0.5], [0.58, 0.5]], mt); });
    } else if (sp.livery === 'band') {
      sides(mt => { g.fillStyle = colors.accent; poly(g, [[0, 0.17], [1, 0.17], [1, 0.27], [0, 0.27]], mt);
        g.fillStyle = colors.trim; poly(g, [[0, 0.27], [1, 0.27], [1, 0.29], [0, 0.29]], mt); });
      g.fillStyle = colors.accent; g.fillRect(0, Y(0.5) - 0.08 * ky, X(0.35), 0.16 * ky);
    }
    // carbon sills / lower bodywork
    g.fillStyle = '#121318'; g.fillRect(0, Y(0.075), W, H - Y(0.075)); g.fillRect(0, 0, W, Y(0.925));
    // door numbers, front-fender and rear sponsor plates
    const decal = (s, t, draw, side) => {
      g.save(); g.translate(X(s), Y(side > 0 ? t : 1 - t));
      g.scale(side > 0 ? -1 : 1, side > 0 ? 1 : -1);          // right side reads mirrored in u, left side upside-down in t
      g.scale(1, ky / kx); draw(g); g.restore();
    };
    for (const side of [1, -1]) {
      decal(0.47, 0.25, c => {
        const r = 0.24 * kx;
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
        c.lineWidth = r * 0.12; c.strokeStyle = colors.trim; c.stroke();
        c.fillStyle = '#0d0d12'; c.font = '900 ' + Math.round(r * 1.25) + 'px "Saira Condensed","Arial Narrow",Impact,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(sp.num), 0, r * 0.08);
      }, side);
      decal(0.3, 0.34, c => { const w = 0.5 * kx, h = 0.13 * kx; c.fillStyle = '#0d0d12'; c.fillRect(-w / 2, -h / 2, w, h); c.fillStyle = '#fff'; c.font = '800 ' + Math.round(h * 0.75) + 'px "Saira Condensed","Arial Narrow",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('NITRO', 0, 1); }, side);
      decal(0.69, 0.31, c => { const w = 0.5 * kx, h = 0.11 * kx; c.fillStyle = '#ffffff'; c.fillRect(-w / 2, -h / 2, w, h); c.fillStyle = '#d11'; c.font = '900 italic ' + Math.round(h * 0.75) + 'px "Saira Condensed","Arial Narrow",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('CRAZY RACERS', 0, 1); }, side);
    }
    // lights (painted on the body and glowing through the emissive map)
    const lamp = (s0, s1, t0, t1, col, glow) => sides(mt => {
      g.fillStyle = '#0b0c10'; poly(g, [[s0 - 0.006, t0 - 0.01], [s1 + 0.006, t0 - 0.01], [s1 + 0.006, t1 + 0.01], [s0 - 0.006, t1 + 0.01]], mt);
      g.fillStyle = col; poly(g, [[s0, t0], [s1, t0 + (t1 - t0) * 0.35], [s1, t1], [s0, t1]], mt);
      e.fillStyle = glow; poly(e, [[s0, t0], [s1, t0 + (t1 - t0) * 0.35], [s1, t1], [s0, t1]], mt);
    });
    lamp(0.03, 0.085, 0.335, 0.385, '#eaf4ff', '#ffffff');      // headlights
    lamp(0.955, 0.995, 0.31, 0.41, '#ff2230', '#ff1020');      // tail lights
    g.fillStyle = '#ff2230'; g.fillRect(X(0.985), Y(0.53), X(0.015), Y(0.47) - Y(0.53)); e.fillStyle = '#ff1020'; e.fillRect(X(0.985), Y(0.53), X(0.015), Y(0.47) - Y(0.53));
    const map = new T.CanvasTexture(cv), emap = new T.CanvasTexture(em);
    map.encoding = emap.encoding = T.sRGBEncoding;
    map.anisotropy = emap.anisotropy = root.SkyMaxAniso || 4;
    return { map, emap };
  }

  /* ---------------- shared bits ---------------- */
  let G = null;
  function geos() {
    if (G) return G;
    G = {
      box: new T.BoxGeometry(1, 1, 1),
      cylX: new T.CylinderGeometry(1, 1, 1, 36).rotateZ(Math.PI / 2),
      cylXlo: new T.CylinderGeometry(1, 1, 1, 16).rotateZ(Math.PI / 2),
      cylZ: new T.CylinderGeometry(1, 1, 1, 18).rotateX(Math.PI / 2),
      torusX: new T.TorusGeometry(1, 0.14, 8, 40).rotateY(Math.PI / 2),
      flame: new T.ConeGeometry(0.11, 1, 8).rotateX(Math.PI / 2),
      blob: new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    };
    return G;
  }
  let blobTex = null, tireTex = null;
  function blobTexture() {
    if (blobTex) return blobTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (blobTex = new T.CanvasTexture(c));
  }
  function tireTexture() {                                  // slick sidewall lettering ring
    if (tireTex) return tireTex;
    const c = document.createElement('canvas'); c.width = 256; c.height = 32;
    const g = c.getContext('2d'); g.fillStyle = '#121216'; g.fillRect(0, 0, 256, 32);
    g.fillStyle = '#f2f2f2'; g.font = '700 16px "Arial Narrow",sans-serif'; g.textBaseline = 'middle';
    for (let k = 0; k < 2; k++) g.fillText('SKY SLICKS', 18 + k * 128, 17);
    tireTex = new T.CanvasTexture(c); tireTex.encoding = T.sRGBEncoding; return tireTex;
  }
  const _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3();
  function ent(list, geo, mat, x, y, z, sx, sy, sz, rx, ry, rz) {
    list.push({ geo, mat, m: new T.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx || 0, ry || 0, rz || 0)), _s.set(sx, sy, sz)) });
  }
  function flush(list, parent) {
    const by = new Map();
    for (const e of list) { if (!by.has(e.mat)) by.set(e.mat, []); by.get(e.mat).push(e); }
    by.forEach((arr, mat) => {
      const pos = [], nor = [], uv = [];
      for (const e of arr) {
        const g = e.geo.index ? e.geo.toNonIndexed() : e.geo.clone();
        g.applyMatrix4(e.m);
        const p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv && g.attributes.uv.array;
        for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
        for (let i = 0; i < p.length / 3 * 2; i++) uv.push(u ? u[i] : 0);
        g.dispose();
      }
      const out = new T.BufferGeometry();
      out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      out.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      parent.add(new T.Mesh(out, mat));
    });
  }

  /** Build a race car. style = entry of SkyLevels.CARS, color = body hex. opts: {env, detail:'high'|'low', glow:hex} */
  function build(style, color, opts) {
    opts = opts || {};
    const g = geos(), env = opts.env || null, high = opts.detail !== 'low';
    const m = model(style), L = m.L, wr = style.wr, ww = style.ww || 0.32;
    const car = new T.Group(), parts = { wheels: [], flames: [] }, S = [];
    const accentHex = color.toLowerCase() === style.color.toLowerCase() ? style.accent : (style.accent === '#ffffff' ? '#101015' : '#ffffff');
    const tex = liveryTextures(style, m, { base: color, accent: accentHex, trim: style.trim }, high);

    // ---- materials ----
    const paint = new T.MeshPhysicalMaterial({ map: tex.map, emissiveMap: tex.emap, emissive: 0xffffff, emissiveIntensity: 1.4, metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04, envMap: env, envMapIntensity: 0.85, side: T.DoubleSide });
    const under = new T.MeshStandardMaterial({ color: lin('#0b0b0f'), roughness: 0.8, metalness: 0.2, side: T.DoubleSide });
    const glass = new T.MeshPhysicalMaterial({ color: lin('#05080e'), metalness: 0.9, roughness: 0.03, clearcoat: 1, envMap: env, envMapIntensity: 2.0, side: T.DoubleSide });
    const carbon = new T.MeshStandardMaterial({ color: lin('#17181d'), roughness: 0.3, metalness: 0.6, envMap: env, envMapIntensity: 0.9 });
    const chrome = new T.MeshStandardMaterial({ color: lin('#dfe3ea'), roughness: 0.14, metalness: 1, envMap: env, envMapIntensity: 1.3 });
    const rimM = new T.MeshStandardMaterial({ color: lin(style.type.indexOf('Rally') >= 0 ? '#f2f2f2' : '#2a2c33'), roughness: 0.25, metalness: 0.9, envMap: env, envMapIntensity: 1.2 });
    const tireM = new T.MeshStandardMaterial({ color: lin('#121216'), roughness: 0.9, metalness: 0 });
    const caliper = new T.MeshStandardMaterial({ color: lin('#d4141c'), roughness: 0.35, metalness: 0.3 });
    const accentM = new T.MeshPhysicalMaterial({ color: lin(accentHex), metalness: 0.3, roughness: 0.35, clearcoat: 1, envMap: env, envMapIntensity: 0.9 });
    const bodyPaint = new T.MeshPhysicalMaterial({ color: lin(color), metalness: 0.35, roughness: 0.32, clearcoat: 1, envMap: env, envMapIntensity: 0.85 });
    const lightM = new T.MeshBasicMaterial({ color: lin('#ff2030') });

    // ---- shell + cabin ----
    car.add(new T.Mesh(shellGeometry(m), [paint, under]));
    car.add(new T.Mesh(cabinGeometry(m, style), [glass, paint]));

    // ---- aero: splitter, canards, diffuser ----
    const aN = m.a(-0.95);
    ent(S, g.box, carbon, 0, 0.15, -L * 0.94, aN * 1.95, 0.025, 0.22);
    if (style.canards) for (const sx of [-1, 1]) for (const k of [0, 1]) {
      const u = -0.88 + k * 0.05, A = m.a(u);
      ent(S, g.box, carbon, sx * (A + 0.02), m.S(u) + k * 0.08, u * L, 0.1, 0.01, 0.16, 0, 0, sx * -0.25);
    }
    for (let k = -2; k <= 2; k++) ent(S, g.box, carbon, k * m.a(0.97) * 0.33, 0.21, L * 0.9, 0.016, 0.1, 0.4);
    ent(S, g.box, carbon, 0, 0.165, L * 0.9, m.a(0.97) * 1.6, 0.02, 0.45);
    // rear light bar on the tail panel
    ent(S, g.box, lightM, 0, style.tailH - 0.1, L + 0.004, m.a(1) * 1.5, 0.035, 0.012);

    // ---- wings / fin / scoop ----
    const deck = m.top(0.9);
    const wingFoil = (y, z, span, chord, tilt) => { ent(S, g.box, carbon, 0, y, z, span, 0.04, chord, tilt); ent(S, g.box, accentM, 0, y + 0.03, z + chord * 0.48, span, 0.05, 0.02, tilt); };
    const endplates = (y, z, span, h, d) => { for (const sx of [-1, 1]) ent(S, g.box, carbon, sx * span / 2, y - h * 0.3, z, 0.02, h, d); };
    if (style.wing === 'gt') {
      const span = m.a(0.9) * 1.9, y = deck + 0.42, z = L * 0.9;
      wingFoil(y, z, span, 0.4, -0.12); endplates(y, z, span, 0.24, 0.44);
      for (const sx of [-1, 1]) ent(S, g.box, carbon, sx * span * 0.24, deck + 0.2, z - 0.05, 0.03, 0.42, 0.22, 0.25);
    } else if (style.wing === 'swan') {
      const span = m.a(0.9) * 1.95, y = deck + 0.5, z = L * 0.9;
      wingFoil(y, z, span, 0.42, -0.1); ent(S, g.box, carbon, 0, y + 0.1, z + 0.18, span * 0.98, 0.03, 0.18, -0.35);
      endplates(y + 0.03, z, span, 0.38, 0.6);
      for (const sx of [-1, 1]) { ent(S, g.box, carbon, sx * span * 0.22, y + 0.06, z - 0.06, 0.03, 0.14, 0.2); ent(S, g.box, carbon, sx * span * 0.22, deck + 0.24, z - 0.16, 0.03, 0.5, 0.08, -0.45); }
    } else if (style.wing === 'proto') {
      const span = m.a(1) * 2.05, y = style.tailH + 0.26, z = L * 0.97;
      wingFoil(y, z, span, 0.36, -0.1);
      for (const sx of [-1, 1]) ent(S, g.box, carbon, sx * span / 2, y - 0.18, z - 0.05, 0.025, 0.5, 0.7);
    } else if (style.wing === 'rally') {
      const z = m.c2 * L + 0.18, y = m.roof(m.c2) + 0.02, span = m.a(m.c2) * 1.55;
      ent(S, g.box, carbon, 0, y + 0.06, z, span, 0.035, 0.42, 0.18); endplates(y + 0.08, z, span, 0.22, 0.44);
      ent(S, g.box, carbon, 0, 0.42, L * 0.99, m.a(1) * 1.7, 0.1, 0.12);
    } else if (style.wing === 'duck') {
      ent(S, g.box, carbon, 0, style.tailH + 0.07, L * 0.965, m.a(0.97) * 1.75, 0.025, 0.24, -0.55);
    }
    if (style.fin) {
      const z0 = m.c2 * L, z1 = L * 0.92, y0 = m.roof(m.c2) - 0.02;
      ent(S, g.box, bodyPaint, 0, (y0 + m.top(0.85)) / 2 + 0.06, (z0 + z1) / 2, 0.025, (y0 - m.top(0.85)) * 0.9 + 0.16, z1 - z0);
    }
    if (style.scoop) { const u = m.c1 + 0.04; ent(S, g.box, carbon, 0, m.roof(u) + 0.05, u * L + 0.12, 0.3, 0.09, 0.4); ent(S, g.box, under, 0, m.roof(u) + 0.05, u * L - 0.09, 0.26, 0.06, 0.02); }
    // hood louvres
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) { const u = m.uF + 0.08 + k * 0.035; ent(S, g.box, under, sx * m.a(u) * 0.42, m.Ht(u) - m.dip(u) * 0.55 + 0.004, u * L, m.a(u) * 0.28, 0.012, 0.025); }
    // mirrors
    for (const sx of [-1, 1]) {
      const u = m.c0 + 0.11, x = m.a(u) * 0.8 * (style.cabW || 1);
      ent(S, g.box, carbon, sx * (x + 0.07), m.top(u) + 0.08, u * L, 0.14, 0.03, 0.05);
      ent(S, g.box, bodyPaint, sx * (x + 0.18), m.top(u) + 0.12, u * L, 0.16, 0.09, 0.14);
    }
    // exhausts
    for (const sx of [-1, 1]) { ent(S, g.cylZ, chrome, sx * 0.14, 0.3, L + 0.01, 0.06, 0.06, 0.14); ent(S, g.cylZ, under, sx * 0.14, 0.3, L + 0.06, 0.045, 0.045, 0.06); }
    // tow hooks
    ent(S, g.box, caliper, m.a(-0.97) * 0.6, 0.26, -L - 0.02, 0.05, 0.03, 0.06);
    ent(S, g.box, caliper, 0, 0.36, L + 0.02, 0.05, 0.03, 0.06);

    // ---- wheels: slicks, centre-lock rims, discs and calipers ----
    const tireSide = new T.MeshStandardMaterial({ map: tireTexture(), roughness: 0.85 });
    [[-1, m.uF], [1, m.uF], [-1, m.uR], [1, m.uR]].forEach(([sx, u]) => {
      const wg = new T.Group(); wg.position.set(sx * (m.a(u) * 0.97 - ww / 2 + 0.02), wr, u * L);
      const spin = new T.Group(); wg.add(spin);
      const W = [], fx = sx * (ww / 2 - 0.012);
      ent(W, g.cylX, tireM, 0, 0, 0, ww, wr, wr);
      for (const o of [-1, 1]) ent(W, g.torusX, tireM, o * ww * 0.46, 0, 0, 1, wr * 0.92, wr * 0.92);
      ent(W, g.cylX, tireSide, fx + sx * 0.004, 0, 0, 0.01, wr * 0.86, wr * 0.86);
      ent(W, g.cylX, rimM, fx + sx * 0.006, 0, 0, 0.012, wr * 0.68, wr * 0.68);
      ent(W, g.torusX, chrome, fx + sx * 0.01, 0, 0, 1, wr * 0.68, wr * 0.68);
      ent(W, g.cylXlo, carbon, sx * (ww / 2 - 0.1), 0, 0, 0.04, wr * 0.55, wr * 0.55);
      const spokes = high ? 10 : 6;
      for (let k = 0; k < spokes; k++) {
        const a = k * Math.PI * 2 / spokes;
        const mx = new T.Matrix4().makeRotationX(a).multiply(new T.Matrix4().compose(new T.Vector3(fx + sx * 0.02, wr * 0.34, 0), new T.Quaternion(), new T.Vector3(0.03, wr * 0.62, high ? 0.04 : 0.07)));
        W.push({ geo: g.box, mat: rimM, m: mx });
      }
      ent(W, g.cylX, chrome, fx + sx * 0.03, 0, 0, 0.04, wr * 0.14, wr * 0.14);          // centre-lock nut
      ent(W, g.cylX, caliper, fx + sx * 0.05, 0, 0, 0.012, wr * 0.07, wr * 0.07);
      flush(W, spin);
      const cal = []; ent(cal, g.box, caliper, sx * (ww / 2 - 0.12), wr * 0.32, -wr * 0.3, 0.07, wr * 0.28, wr * 0.32); flush(cal, wg);   // caliper does not spin
      car.add(wg); parts.wheels.push(spin);
    });

    // ---- exhaust flames ----
    for (const sx of [-1, 1]) {
      const fl = new T.Mesh(g.flame, new T.MeshBasicMaterial({ color: lin('#ffa73a'), transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
      fl.position.set(sx * 0.14, 0.3, L + 0.45); fl.scale.set(1, 1, 0.01); car.add(fl); parts.flames.push(fl);
    }
    flush(S, car);

    // ---- glow + soft shadow ----
    const glow = new T.Mesh(g.blob, new T.MeshBasicMaterial({ color: lin(opts.glow || style.accent), transparent: true, opacity: 0.3, blending: T.AdditiveBlending, depthWrite: false, map: blobTexture() }));
    glow.scale.set(style.wid * 1.4, 1, L * 2.1); glow.position.y = 0.05; car.add(glow);
    const shadow = new T.Mesh(g.blob, new T.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, map: blobTexture(), color: 0x000000 }));
    shadow.scale.set(style.wid * 1.6, 1, L * 2.25); shadow.position.y = 0.02; car.add(shadow);

    car.userData.parts = parts;
    car.userData.dims = { L, W: style.wid, wr };
    return car;
  }

  function dispose(car) {
    const keep = new Set(Object.values(geos()));
    car.traverse(o => {
      if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => { if (mt.map && mt.map !== tireTex && mt.map !== blobTex) mt.map.dispose(); if (mt.emissiveMap) mt.emissiveMap.dispose(); mt.dispose(); });
    });
  }
  root.SkyCars = { build, dispose };
})(window);
