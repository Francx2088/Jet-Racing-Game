/* Sky Racing - procedural car models.
   Clear-coat paint, wheel arches with liners, projector headlights, grille, door cut lines, mirrors,
   plates, spoked wheels with brake discs and calipers. Static parts are merged per material so a
   whole car costs only a few dozen draw calls. */
(function (root) {
  'use strict';
  const T = THREE;
  const lin = hex => new T.Color(hex).convertSRGBToLinear();

  // polygon with rounded corners: pts = [[x, y, radius], ...]
  function roundedShape(pts) {
    const n = pts.length, k = [];
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], r = p1[2] === undefined ? 0.08 : p1[2];
      const d1 = [p0[0] - p1[0], p0[1] - p1[1]], d2 = [p2[0] - p1[0], p2[1] - p1[1]];
      const l1 = Math.hypot(d1[0], d1[1]) || 1, l2 = Math.hypot(d2[0], d2[1]) || 1;
      const r1 = Math.min(r, l1 * 0.45), r2 = Math.min(r, l2 * 0.45);
      k.push({ a: [p1[0] + d1[0] / l1 * r1, p1[1] + d1[1] / l1 * r1], p: p1, b: [p1[0] + d2[0] / l2 * r2, p1[1] + d2[1] / l2 * r2] });
    }
    const s = new T.Shape();
    s.moveTo(k[0].b[0], k[0].b[1]);
    for (let i = 1; i < n; i++) { s.lineTo(k[i].a[0], k[i].a[1]); s.quadraticCurveTo(k[i].p[0], k[i].p[1], k[i].b[0], k[i].b[1]); }
    s.lineTo(k[0].a[0], k[0].a[1]); s.quadraticCurveTo(k[0].p[0], k[0].p[1], k[0].b[0], k[0].b[1]);
    return s;
  }
  function extrudeProfile(pts, width, bevel) {
    const depth = Math.max(0.01, width - bevel * 2);
    const g = new T.ExtrudeGeometry(roundedShape(pts), { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 6 });
    g.rotateY(Math.PI / 2);          // length (x, forward) -> -z, width (z) -> x
    g.translate(-(depth / 2), 0, 0);
    return g;
  }

  let G = null;
  function geos() {
    if (G) return G;
    G = {
      box: new T.BoxGeometry(1, 1, 1),
      cylY: new T.CylinderGeometry(1, 1, 1, 14),
      cylX: new T.CylinderGeometry(1, 1, 1, 32).rotateZ(Math.PI / 2),
      cylXlo: new T.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2),
      cylZ: new T.CylinderGeometry(1, 1, 1, 18).rotateX(Math.PI / 2),
      torusX: new T.TorusGeometry(1, 0.14, 8, 36).rotateY(Math.PI / 2),
      disc: new T.CircleGeometry(1, 24),
      flame: new T.ConeGeometry(0.13, 1, 8).rotateX(Math.PI / 2),
      blob: new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    };
    return G;
  }
  let blobTex = null, plateTex = null;
  function blobTexture() {
    if (blobTex) return blobTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (blobTex = new T.CanvasTexture(c));
  }
  function plateTexture() {
    if (plateTex) return plateTex;
    const c = document.createElement('canvas'); c.width = 128; c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#f4f1e6'; g.fillRect(0, 0, 128, 32);
    g.strokeStyle = '#223'; g.lineWidth = 2; g.strokeRect(1, 1, 126, 30);
    g.fillStyle = '#1a2a5c'; g.fillRect(3, 3, 12, 26);
    g.fillStyle = '#111'; g.font = 'bold 22px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SKY 88', 70, 17);
    plateTex = new T.CanvasTexture(c); plateTex.encoding = T.sRGBEncoding; return plateTex;
  }

  const _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3();
  function ent(list, geo, mat, x, y, z, sx, sy, sz, rx, ry, rz) {
    const m = new T.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx || 0, ry || 0, rz || 0)), _s.set(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz));
    list.push({ geo, mat, m });
  }
  // merge every entry that shares a material into one mesh
  function flush(list, parent) {
    const by = new Map();
    for (const e of list) { if (!by.has(e.mat)) by.set(e.mat, []); by.get(e.mat).push(e); }
    by.forEach((arr, mat) => {
      const pos = [], nor = [], uv = [];
      for (const e of arr) {
        const g = e.geo.index ? e.geo.toNonIndexed() : e.geo.clone();
        g.applyMatrix4(e.m);
        const p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv ? g.attributes.uv.array : null;
        for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
        if (u) for (let i = 0; i < u.length; i++) uv.push(u[i]); else for (let i = 0; i < p.length / 3 * 2; i++) uv.push(0);
        g.dispose();
      }
      const out = new T.BufferGeometry();
      out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      out.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      parent.add(new T.Mesh(out, mat));
    });
  }

  /** Build a car. style = entry of SkyLevels.CARS, color = body hex. opts: {env, detail:'high'|'low', glow:hex} */
  function build(style, color, opts) {
    opts = opts || {};
    const g = geos(), env = opts.env || null, high = opts.detail !== 'low';
    const L = style.len / 2, W = style.wid, wr = style.wr, ww = style.ww || 0.31;
    const nose = style.nose, tail = style.tail, belt = style.belt, roof = style.roof;
    const car = new T.Group();
    const parts = { wheels: [], flames: [] };
    const S = [];      // static parts

    // ---- materials ----
    const paint = new T.MeshPhysicalMaterial({ color: lin(color), metalness: 0.4, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.06, envMap: env, envMapIntensity: 0.75 });
    const accent = new T.MeshPhysicalMaterial({ color: lin(style.accent), metalness: 0.35, roughness: 0.35, clearcoat: 1, envMap: env, envMapIntensity: 0.9 });
    const glass = new T.MeshPhysicalMaterial({ color: lin('#070b14'), metalness: 0.95, roughness: 0.03, clearcoat: 1, envMap: env, envMapIntensity: 2.0 });
    const dark = new T.MeshStandardMaterial({ color: lin('#0a0a0d'), roughness: 0.65, metalness: 0.3, envMap: env, envMapIntensity: 0.4 });
    const carbon = new T.MeshStandardMaterial({ color: lin('#16171c'), roughness: 0.32, metalness: 0.65, envMap: env, envMapIntensity: 0.9 });
    const chrome = new T.MeshStandardMaterial({ color: lin('#e2e6ee'), roughness: 0.12, metalness: 1, envMap: env, envMapIntensity: 1.4 });
    const steel = new T.MeshStandardMaterial({ color: lin('#6c717c'), roughness: 0.4, metalness: 0.9, envMap: env, envMapIntensity: 0.8 });
    const tireM = new T.MeshStandardMaterial({ color: lin('#0c0c0f'), roughness: 0.95, metalness: 0 });
    const caliper = new T.MeshStandardMaterial({ color: lin('#c8161c'), roughness: 0.4, metalness: 0.3 });
    const lens = new T.MeshBasicMaterial({ color: lin('#f6fbff') });
    const tailM = new T.MeshBasicMaterial({ color: lin('#ff1a26') });
    const liner = new T.MeshBasicMaterial({ color: 0x050506, side: T.DoubleSide });

    // ---- lower body: wedge side silhouette with real wheel-arch cut-outs ----
    const ra = wr + 0.1, yb = 0.25, yc = wr, wz = L * 0.64;
    const chord = Math.sqrt(Math.max(0.01, ra * ra - (yb - yc) * (yb - yc)));
    const th0 = Math.asin((yb - yc) / ra);
    const arch = xc => { const a = []; for (let k = 0; k <= 8; k++) { const th = th0 + (Math.PI - 2 * th0) * k / 8; a.push([xc + ra * Math.cos(th), yc + ra * Math.sin(th), 0]); } return a; };
    const prof = [
      [-L, 0.30, 0.05], [-L, tail, 0.10], [-L * 0.80, belt - 0.02, 0.38], [L * 0.15, belt + 0.02, 0.3], [L * 0.62, belt - 0.03, 0.34],
      [L * 0.97, nose + 0.03, 0.24], [L, nose - 0.12, 0.07], [L * 0.98, 0.30, 0.06],
      ...arch(wz), [-wz + chord + 0.02, yb, 0.0], ...arch(-wz), [-L, 0.28, 0.04]
    ];
    car.add(new T.Mesh(extrudeProfile(prof, W, 0.055), paint));

    // ---- cabin: dark glass greenhouse + painted roof ----
    const cabW = W * 0.8;
    const rearBase = L * style.cabR * 1.5, frontBase = L * (style.cabF + 0.2), cl = frontBase - rearBase;
    const rearTop = rearBase + cl * 0.24, frontTop = frontBase - cl * 0.36;
    const cab = [[rearBase, belt - 0.05, 0.06], [rearTop, roof - 0.02, 0.14], [frontTop, roof - 0.02, 0.14], [frontBase, belt - 0.05, 0.06]];
    car.add(new T.Mesh(extrudeProfile(cab, cabW, 0.05), glass));
    ent(S, g.box, paint, 0, roof + 0.005, -(rearTop + frontTop) / 2, cabW * 0.96, 0.06, (frontTop - rearTop) + 0.1);

    // ---- livery ----
    if (style.stripe) for (const s of [-1, 1]) ent(S, g.box, accent, s * W * 0.1, belt + 0.035, -L * 0.2, 0.16, 0.012, L * 1.65);

    // ---- underbody, splitter, skirts, diffuser ----
    ent(S, g.box, dark, 0, 0.24, 0, W * 0.9, 0.05, L * 1.85);
    ent(S, g.box, carbon, 0, 0.29, -L * 0.985, W * 1.0, 0.07, 0.5);
    ent(S, g.box, carbon, 0, 0.27, L * 0.97, W * 0.9, 0.12, 0.35);
    for (const s of [-1, 1]) {
      ent(S, g.box, carbon, s * (W / 2 + 0.005), 0.32, 0, 0.09, 0.1, L * 0.62);                  // side skirts between the arches
      for (let k = -1; k <= 1; k++) ent(S, g.box, carbon, k * W * 0.2, 0.2, L * 1.0, 0.03, 0.14, 0.3);   // diffuser fins
    }
    // ---- wing ----
    if (style.wing === 'wing') {
      ent(S, g.box, carbon, 0, tail + 0.5, L * 0.86, W * 0.96, 0.045, 0.42);
      for (const s of [-1, 1]) {
        ent(S, g.box, carbon, s * W * 0.3, tail + 0.28, L * 0.86, 0.05, 0.4, 0.14);
        ent(S, g.box, accent, s * W * 0.48, tail + 0.5, L * 0.86, 0.04, 0.22, 0.46);
      }
    } else if (style.wing === 'duck') {
      ent(S, g.box, carbon, 0, tail + 0.05, L * 0.9, W * 0.8, 0.06, 0.3, -0.25);
    } else {
      ent(S, g.box, accent, 0, tail + 0.02, L * 0.93, W * 0.7, 0.04, 0.2);
    }

    // ---- front: projector headlights, DRLs, grille, intake ----
    for (const s of [-1, 1]) {
      ent(S, g.box, dark, s * W * 0.32, nose - 0.05, -L * 0.985, 0.5, 0.13, 0.1);                 // housing
      ent(S, g.cylZ, chrome, s * W * 0.26, nose - 0.05, -L * 0.995, 0.075, 0.075, 0.03);         // projector ring
      ent(S, g.cylZ, lens, s * W * 0.26, nose - 0.05, -L * 1.0, 0.055, 0.055, 0.03);
      ent(S, g.cylZ, lens, s * W * 0.37, nose - 0.04, -L * 1.0, 0.04, 0.04, 0.03);
      ent(S, g.box, lens, s * W * 0.32, nose - 0.13, -L * 0.998, 0.44, 0.022, 0.03);               // LED strip
    }
    ent(S, g.box, dark, 0, nose - 0.17, -L * 0.995, W * 0.26, 0.13, 0.05);                         // grille
    for (let k = 0; k < 4; k++) ent(S, g.box, steel, 0, nose - 0.2 + k * 0.05, -L * 1.0, W * 0.25, 0.012, 0.03);
    ent(S, g.box, dark, 0, 0.4, -L * 0.995, W * 0.62, 0.11, 0.05);                                // lower intake
    for (let k = -2; k <= 2; k++) ent(S, g.box, steel, k * W * 0.12, 0.4, -L * 1.0, 0.012, 0.1, 0.03);
    // hood vents
    for (const s of [-1, 1]) ent(S, g.box, dark, s * W * 0.2, belt - 0.02, -L * 0.5, 0.2, 0.012, 0.42);

    // ---- sides: door cut lines, handles, mirrors, window trim ----
    for (const s of [-1, 1]) {
      const x = s * (W / 2 + 0.006);
      ent(S, g.box, dark, x, (0.42 + belt - 0.05) / 2, -(frontBase - 0.08), 0.012, belt - 0.5, 0.014);   // door front
      ent(S, g.box, dark, x, (0.42 + belt - 0.05) / 2, -(rearBase + 0.22), 0.012, belt - 0.5, 0.014);    // door rear
      ent(S, g.box, dark, x, 0.42, -(frontBase + rearBase) / 2 + 0.07, 0.012, 0.014, (frontBase - rearBase) - 0.3);  // sill line
      ent(S, g.box, chrome, x, belt - 0.14, -(rearBase + 0.42), 0.014, 0.03, 0.16);                       // door handle
      ent(S, g.box, chrome, s * (cabW / 2 + 0.005), belt - 0.03, -(frontBase + rearBase) / 2, 0.012, 0.014, (frontBase - rearBase) * 0.95);   // beltline trim
      // mirrors
      ent(S, g.box, dark, s * (cabW / 2 + 0.06), belt + 0.06, -(frontBase - 0.38), 0.12, 0.035, 0.05);
      ent(S, g.box, paint, s * (cabW / 2 + 0.17), belt + 0.11, -(frontBase - 0.4), 0.2, 0.11, 0.13);
      ent(S, g.box, dark, s * (cabW / 2 + 0.27), belt + 0.11, -(frontBase - 0.4) + 0.001, 0.015, 0.09, 0.11);
    }
    // ---- rear: LED tail lights, reverse lights, exhaust ----
    ent(S, g.box, tailM, 0, tail * 0.82 + 0.17, L * 0.995, W * 0.82, 0.06, 0.05);
    for (const s of [-1, 1]) {
      ent(S, g.cylZ, tailM, s * W * 0.38, tail * 0.82 + 0.07, L * 0.99, 0.07, 0.07, 0.03);
      ent(S, g.box, tailM, s * W * 0.44, tail * 0.82 + 0.12, L * 0.98, 0.16, 0.12, 0.06);
      ent(S, g.cylZ, lens, s * W * 0.3, tail * 0.82 + 0.0, L * 0.995, 0.03, 0.03, 0.03);
      ent(S, g.cylZ, chrome, s * W * 0.2, 0.31, L * 0.99, 0.065, 0.065, 0.16);
      ent(S, g.cylZ, dark, s * W * 0.2, 0.31, L * 1.0, 0.045, 0.045, 0.1);
    }

    // ---- wheels ----
    const archMx = (sx, sz) => { const m = new T.Matrix4().compose(new T.Vector3(sx * (W / 2 - 0.3), wr, sz * wz), new T.Quaternion().setFromEuler(new T.Euler(0, sx * Math.PI / 2, 0)), new T.Vector3(ra, ra, 1)); return m; };
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      S.push({ geo: g.disc, mat: liner, m: archMx(sx, sz) });
      const wg = new T.Group(); wg.position.set(sx * (W / 2 - ww / 2 + 0.04), wr, sz * wz);
      const spin = new T.Group(); wg.add(spin);
      const R = [];
      ent(R, g.cylX, tireM, 0, 0, 0, ww, wr, wr);                                           // tread
      for (const o of [-1, 1]) ent(R, g.torusX, tireM, o * ww * 0.47, 0, 0, 1, wr * 0.93, wr * 0.93);   // rounded shoulders
      const fx = sx * (ww / 2 - 0.015);                                                      // outer face
      ent(R, g.torusX, chrome, fx, 0, 0, 1, wr * 0.68, wr * 0.68);                           // rim lip
      ent(R, g.cylX, steel, fx - sx * 0.02, 0, 0, 0.04, wr * 0.62, wr * 0.62);               // rim face
      ent(R, g.cylXlo, dark, sx * (ww / 2 - 0.1), 0, 0, 0.05, wr * 0.5, wr * 0.5);           // brake disc seen through the spokes
      ent(R, g.box, caliper, sx * (ww / 2 - 0.12), wr * 0.3, -wr * 0.28, 0.07, wr * 0.26, wr * 0.3);
      const spokes = high ? 10 : 6;
      for (let k = 0; k < spokes; k++) {
        const a = k * Math.PI * 2 / spokes;
        const m = new T.Matrix4().makeRotationX(a).multiply(new T.Matrix4().compose(new T.Vector3(fx + sx * 0.005, wr * 0.31, 0), new T.Quaternion(), new T.Vector3(0.035, wr * 0.6, high ? 0.045 : 0.07)));
        R.push({ geo: g.box, mat: chrome, m });
      }
      ent(R, g.cylX, accent, fx + sx * 0.01, 0, 0, 0.03, wr * 0.13, wr * 0.13);              // centre cap
      flush(R, spin);
      car.add(wg); parts.wheels.push(spin);
    });

    // ---- exhaust flames ----
    for (const s of [-1, 1]) {
      const fl = new T.Mesh(g.flame, new T.MeshBasicMaterial({ color: lin('#ffa73a'), transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
      fl.position.set(s * W * 0.2, 0.31, L * 1.0 + 0.45); fl.scale.set(1, 1, 0.01); car.add(fl); parts.flames.push(fl);
    }
    flush(S, car);

    // licence plate (own material, one extra draw)
    const plate = new T.Mesh(new T.PlaneGeometry(0.52, 0.13), new T.MeshBasicMaterial({ map: plateTexture() }));
    plate.position.set(0, tail * 0.82 - 0.06, L + 0.012); car.add(plate);

    // ---- glow + soft shadow ----
    const glow = new T.Mesh(g.blob, new T.MeshBasicMaterial({ color: lin(opts.glow || style.accent), transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false, map: blobTexture() }));
    glow.scale.set(W * 1.45, 1, L * 2.1); glow.position.y = 0.05; car.add(glow);
    const shadow = new T.Mesh(g.blob, new T.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, map: blobTexture(), color: 0x000000 }));
    shadow.scale.set(W * 1.7, 1, L * 2.3); shadow.position.y = 0.02; car.add(shadow);

    car.userData.parts = parts;
    car.userData.dims = { L, W, wr };
    return car;
  }

  function dispose(car) {
    const keep = new Set(Object.values(geos()));
    car.traverse(o => {
      if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
  }
  root.SkyCars = { build, dispose };
})(window);
