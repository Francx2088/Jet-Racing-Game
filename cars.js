/* Sky Racing - procedural car models (glossy clear-coat paint, glass cabin, spoked wheels, lights). */
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
      const l1 = Math.hypot(d1[0], d1[1]), l2 = Math.hypot(d2[0], d2[1]);
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

  let sharedGeo = null;
  function geos() {
    if (sharedGeo) return sharedGeo;
    sharedGeo = {
      tire: new T.CylinderGeometry(1, 1, 1, 24).rotateZ(Math.PI / 2),
      rim: new T.CylinderGeometry(1, 1, 1, 18).rotateZ(Math.PI / 2),
      spoke: new T.BoxGeometry(1, 1, 1),
      box: new T.BoxGeometry(1, 1, 1),
      cyl: new T.CylinderGeometry(1, 1, 1, 10).rotateX(Math.PI / 2),
      flame: new T.ConeGeometry(0.13, 1, 8).rotateX(Math.PI / 2),
      blob: new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      arch: new T.CircleGeometry(1, 20).rotateY(Math.PI / 2)
    };
    return sharedGeo;
  }
  let blobTex = null;
  function blobTexture() {
    if (blobTex) return blobTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    blobTex = new T.CanvasTexture(c); return blobTex;
  }

  /** Build a car. style = entry of SkyLevels.CARS, color = body hex. opts: {env, detail:'high'|'low', glow:hex} */
  function build(style, color, opts) {
    opts = opts || {};
    const G = geos(), env = opts.env || null, high = opts.detail !== 'low';
    const L = style.len / 2, W = style.wid;
    const car = new T.Group();
    const parts = { wheels: [], flames: [], brake: [] };

    const paint = new T.MeshPhysicalMaterial({ color: lin(color), metalness: 0.4, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.08, envMap: env, envMapIntensity: 0.8 });
    const accent = new T.MeshPhysicalMaterial({ color: lin(style.accent), metalness: 0.4, roughness: 0.35, clearcoat: 1, envMap: env, envMapIntensity: 1.1 });
    const glass = new T.MeshPhysicalMaterial({ color: lin('#06090f'), metalness: 0.9, roughness: 0.04, clearcoat: 1, envMap: env, envMapIntensity: 1.8 });
    const dark = new T.MeshStandardMaterial({ color: lin('#0b0b0e'), roughness: 0.6, metalness: 0.3, envMap: env, envMapIntensity: 0.5 });
    const carbon = new T.MeshStandardMaterial({ color: lin('#15161a'), roughness: 0.35, metalness: 0.6, envMap: env, envMapIntensity: 0.9 });
    const chrome = new T.MeshStandardMaterial({ color: lin('#dfe3ea'), roughness: 0.15, metalness: 1, envMap: env, envMapIntensity: 1.4 });
    const tireM = new T.MeshStandardMaterial({ color: lin('#0d0d10'), roughness: 0.92, metalness: 0 });
    const lightM = new T.MeshBasicMaterial({ color: lin('#f4fbff') });
    const tailM = new T.MeshBasicMaterial({ color: lin('#ff1a26') });

    const add = (geo, mat, x, y, z, sx, sy, sz, parent) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); (parent || car).add(m); return m; };

    // ---- lower body: wedge silhouette with rounded edges (x = forward) ----
    const nose = style.nose, tail = style.tail, belt = style.belt;
    const prof = [
      [-L, 0.30, 0.05], [-L, tail, 0.10], [-L * 0.80, belt - 0.02, 0.38], [L * 0.15, belt + 0.02, 0.3], [L * 0.62, belt - 0.03, 0.34],
      [L * 0.97, nose + 0.03, 0.24], [L, nose - 0.12, 0.07], [L * 0.97, 0.30, 0.06], [L * 0.7, 0.25, 0.04], [-L * 0.7, 0.25, 0.04]
    ];
    car.add(new T.Mesh(extrudeProfile(prof, W, 0.1), paint));

    // ---- cabin (dark glass greenhouse) + painted roof ----
    const roof = style.roof, cabW = W * 0.8;
    const rearBase = L * style.cabR * 1.5, frontBase = L * (style.cabF + 0.2), cl = frontBase - rearBase;
    const rearTop = rearBase + cl * 0.24, frontTop = frontBase - cl * 0.36;
    const cab = [[rearBase, belt - 0.05, 0.06], [rearTop, roof - 0.02, 0.14], [frontTop, roof - 0.02, 0.14], [frontBase, belt - 0.05, 0.06]];
    car.add(new T.Mesh(extrudeProfile(cab, cabW, 0.05), glass));
    add(G.box, paint, 0, roof + 0.005, -(rearTop + frontTop) / 2, cabW * 0.96, 0.06, (frontTop - rearTop) + 0.1);

    // ---- livery stripes ----
    if (style.stripe) {
      add(G.box, accent, W * 0.1, belt + 0.04, -(L * 0.2), 0.16, 0.012, L * 1.65);
      add(G.box, accent, -W * 0.1, belt + 0.04, -(L * 0.2), 0.16, 0.012, L * 1.65);
    }
    // ---- aero ----
    add(G.box, carbon, 0, 0.3, -L * 0.98, W * 1.0, 0.07, 0.5);            // front splitter
    add(G.box, carbon, 0, 0.27, L * 0.97, W * 0.9, 0.12, 0.35);           // diffuser
    for (const s of [-1, 1]) add(G.box, carbon, s * (W / 2 - 0.02), 0.32, 0, 0.1, 0.12, L * 0.95);   // side skirts
    if (style.wing === 'wing') {
      add(G.box, carbon, 0, tail + 0.5, L * 0.86, W * 0.96, 0.045, 0.42);
      for (const s of [-1, 1]) {
        add(G.box, carbon, s * W * 0.3, tail + 0.28, L * 0.86, 0.05, 0.4, 0.14);
        add(G.box, accent, s * W * 0.48, tail + 0.5, L * 0.86, 0.04, 0.22, 0.46);
      }
    } else if (style.wing === 'duck') {
      add(G.box, carbon, 0, tail + 0.05, L * 0.9, W * 0.8, 0.06, 0.3).rotation.x = -0.25;
    } else {
      add(G.box, accent, 0, tail + 0.02, L * 0.93, W * 0.7, 0.04, 0.2);
    }
    // ---- lights ----
    for (const s of [-1, 1]) {
      add(G.box, lightM, s * W * 0.33, nose - 0.04, -L * 0.995, 0.4, 0.09, 0.05);
      add(G.box, lightM, s * W * 0.33, nose - 0.14, -L * 0.995, 0.26, 0.03, 0.05);
      add(G.box, dark, s * W * 0.1, 0.47, -L * 0.995, 0.18, 0.16, 0.04);   // grille slats
    }
    add(G.box, tailM, 0, tail * 0.82 + 0.16, L * 0.995, W * 0.82, 0.07, 0.05);
    for (const s of [-1, 1]) add(G.box, tailM, s * W * 0.43, tail * 0.82 + 0.08, L * 0.98, 0.18, 0.1, 0.06);
    // ---- mirrors + exhaust ----
    if (high) {
      for (const s of [-1, 1]) {
        add(G.box, paint, s * (cabW * 0.5 + 0.17), belt + 0.1, -(frontBase - 0.42), 0.22, 0.12, 0.14);
        const ex = add(G.cyl, chrome, s * W * 0.22, 0.32, L * 0.99, 0.07, 0.07, 0.2);
        const fl = new T.Mesh(G.flame, new T.MeshBasicMaterial({ color: lin('#ffa73a'), transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
        fl.position.set(s * W * 0.22, 0.32, L * 0.99 + 0.45); fl.scale.set(1, 1, 0.01); car.add(fl); parts.flames.push(fl);
      }
    } else {
      for (const s of [-1, 1]) {
        const fl = new T.Mesh(G.flame, new T.MeshBasicMaterial({ color: lin('#ffa73a'), transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false }));
        fl.position.set(s * W * 0.22, 0.32, L * 0.99 + 0.45); fl.scale.set(1, 1, 0.01); car.add(fl); parts.flames.push(fl);
      }
    }
    // ---- wheels ----
    const wr = style.wr, ww = 0.3;
    const wx = W / 2 - ww / 2 + 0.04, wz = L * 0.64;
    const archM = new T.MeshBasicMaterial({ color: 0x000000 });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const wg = new T.Group(); wg.position.set(sx * wx, wr, sz * wz);
      const spin = new T.Group(); wg.add(spin);
      add(G.tire, tireM, 0, 0, 0, ww, wr, wr, spin);
      add(G.rim, chrome, sx * 0.02, 0, 0, ww * 1.02, wr * 0.66, wr * 0.66, spin);
      add(G.rim, dark, sx * 0.04, 0, 0, ww * 1.02, wr * 0.5, wr * 0.5, spin);
      if (high) for (let k = 0; k < 5; k++) { const sp = add(G.spoke, chrome, sx * 0.05, 0, 0, 0.05, wr * 1.2, 0.06, spin); sp.rotation.x = k * Math.PI / 5; }
      add(G.cyl, accent, sx * 0.0, 0, 0, 0.05, 0.05, 0.05, spin).rotation.y = Math.PI / 2;
      const arch = new T.Mesh(G.arch, archM); arch.position.set(sx * (W / 2 + 0.005), wr, sz * wz); arch.scale.set(1, wr + 0.11, wr + 0.11); arch.rotation.y = sx > 0 ? 0 : Math.PI; car.add(arch);
      if (sx < 0) arch.rotation.y = Math.PI;
      car.add(wg); parts.wheels.push(spin);
    });
    // ---- glow + shadow ----
    const glowCol = opts.glow || style.accent;
    const glow = new T.Mesh(G.blob, new T.MeshBasicMaterial({ color: lin(glowCol), transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false, map: blobTexture() }));
    glow.scale.set(W * 1.45, 1, L * 2.1); glow.position.y = 0.05; car.add(glow);
    const shadow = new T.Mesh(G.blob, new T.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, map: blobTexture(), color: 0x000000 }));
    shadow.scale.set(W * 1.7, 1, L * 2.3); shadow.position.y = 0.02; car.add(shadow);

    car.userData.parts = parts;
    car.userData.dims = { L, W, wr };
    return car;
  }

  function dispose(car) {
    const keep = new Set(Object.values(geos()));
    car.traverse(o => { if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose(); if (o.material && o.material !== undefined) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } });
  }
  root.SkyCars = { build, dispose };
})(window);
