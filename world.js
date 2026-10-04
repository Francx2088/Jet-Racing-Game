/* Sky Racing - world builder: sky, road mesh, scenery, weather, pickups. */
(function (root) {
  'use strict';
  const T = THREE;
  const { LEVELS } = root.SkyLevels;
  const TK = root.SkyTrack, DS = TK.DS;
  const lin = hex => new T.Color(hex).convertSRGBToLinear();
  const V3 = (x, y, z) => new T.Vector3(x, y, z);

  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = root.SkyMaxAniso || 4;
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  }

  /* ---------------- sky dome (also used for reflections) ---------------- */
  function skyMaterial(th) {
    const s = th.sky;
    return new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: lin(s.top) }, mid: { value: lin(s.mid) }, hor: { value: lin(s.hor) },
        sunDir: { value: V3(...s.sun).normalize() }, sunCol: { value: lin(s.sunCol) }, sunPow: { value: s.sunPow },
        cloud: { value: s.cloud }, cloudCol: { value: lin(s.cloudCol) }, stars: { value: s.stars },
        neb: { value: lin(s.neb || '#000000') }, nebAmt: { value: s.neb ? 1 : 0 }, time: { value: 0 }, flash: { value: 0 }
      },
      vertexShader: 'varying vec3 vD; void main(){ vD=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `
        varying vec3 vD;
        uniform vec3 top,mid,hor,sunDir,sunCol,cloudCol,neb;
        uniform float sunPow,cloud,stars,time,nebAmt,flash;
        float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
        float n2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),f.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),f.x),f.y); }
        float fbm(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*n2(p); p=p*2.03+17.1; a*=0.5; } return s; }
        void main(){
          vec3 d=normalize(vD); float h=d.y;
          vec3 col=mix(hor,mid,smoothstep(0.0,0.30,h));
          col=mix(col,top,smoothstep(0.22,0.85,h));
          if(h<0.0) col=mix(hor,mid*0.55+hor*0.45,clamp(-h*3.0,0.0,1.0));
          float s=max(dot(d,normalize(sunDir)),0.0);
          vec3 sun=sunCol*(pow(s,sunPow)*3.0+pow(s,24.0)*0.35+pow(s,4.0)*0.12);
          if(stars>0.0){
            vec3 g=floor(d*220.0); float r=fract(sin(dot(g,vec3(12.9898,78.233,37.719)))*43758.5453);
            float tw=0.6+0.4*sin(time*2.0+r*40.0);
            col+=vec3(step(0.9965,r)*tw*stars*smoothstep(-0.05,0.15,h));
            vec3 g2=floor(d*600.0); float r2=fract(sin(dot(g2,vec3(12.9898,78.233,37.719)))*43758.5453);
            col+=vec3(step(0.9985,r2)*0.5*stars);
            if(nebAmt>0.0){ float nb=fbm(d.xz*2.5/(abs(d.y)+0.6)+d.y*3.0); nb=smoothstep(0.35,0.9,nb); col+=neb*nb*0.55*nebAmt; }
          }
          if(cloud>0.0 && h>0.0){
            vec2 uv=d.xz/(h+0.25)*1.6+vec2(time*0.012,0.0);
            float c=fbm(uv); float c2=fbm(uv*2.5+7.0);
            float m=smoothstep(1.0-cloud*0.9,1.05-cloud*0.55,c*0.75+c2*0.25);
            float fade=smoothstep(0.0,0.14,h);
            float lit=0.65+0.45*pow(s,2.0);
            col=mix(col,cloudCol*lit,m*fade*0.9);
          }
          col+=sun+flash*vec3(0.7,0.8,1.0);
          gl_FragColor=linearToOutputTexel(vec4(col,1.0));
        }`
    });
  }

  /* ---------------- helpers ---------------- */
  function rough(geo, amt, seed) {
    geo = geo.toNonIndexed();
    const p = geo.attributes.position, r = TK.mulberry(seed), map = new Map();
    for (let i = 0; i < p.count; i++) {
      const k = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
      let o = map.get(k);
      if (!o) { o = [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]; map.set(k, o); }
      p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
    }
    geo.computeVertexNormals();
    return geo;
  }
  function gradientColors(geo, y0, y1, c0, c1) {
    const p = geo.attributes.position, cols = new Float32Array(p.count * 3), c = new T.Color();
    for (let i = 0; i < p.count; i++) {
      const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0)));
      c.copy(c0).lerp(c1, t); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new T.BufferAttribute(cols, 3));
    return geo;
  }
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _s = new T.Vector3();
  function instanced(geo, mat, items) {
    const m = new T.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => {
      _q.setFromEuler(_e.set(it.rx || 0, it.ry || 0, it.rz || 0));
      _m.compose(it.pos, _q, _s.set(it.sx, it.sy, it.sz));
      m.setMatrixAt(i, _m);
      if (it.color) m.setColorAt(i, it.color);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false;
    return m;
  }
  const jitterColor = (hex, rnd, amt) => { const c = lin(hex); const k = 1 + (rnd() - 0.5) * amt; return c.multiplyScalar(k); };

  function ribbon(track, prof, runs, uvScale) {
    const pos = [], uv = [], idx = [];
    let base = 0;
    const { P, R, U } = track, m = prof.length;
    for (const [a, b] of runs) {
      for (let i = a; i <= b; i++) {
        for (let j = 0; j < m; j++) {
          const l = prof[j][0], h = prof[j][1];
          pos.push(P[i * 3] + R[i * 3] * l + U[i * 3] * h, P[i * 3 + 1] + R[i * 3 + 1] * l + U[i * 3 + 1] * h, P[i * 3 + 2] + R[i * 3 + 2] * l + U[i * 3 + 2] * h);
          uv.push(prof[j][2] !== undefined ? prof[j][2] : j / (m - 1), i * DS / uvScale);
        }
      }
      const cnt = b - a + 1;
      for (let i = 0; i < cnt - 1; i++) for (let j = 0; j < m - 1; j++) {
        const v0 = base + i * m + j, v1 = v0 + 1, v2 = base + (i + 1) * m + j, v3 = v2 + 1;
        idx.push(v0, v1, v2, v1, v3, v2);
      }
      base += cnt * m;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  /* ---------------- textures ---------------- */
  function roadTexture(style, th) {
    const r = th.road;
    return canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = r.base; g.fillRect(0, 0, w, h);
      const rnd = TK.mulberry(5);
      const speck = (n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = (rnd() < 0.5 ? 'rgba(255,255,255,' : 'rgba(0,0,0,') + (rnd() * a) + ')'; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); } };
      speck(5000, 0.09);
      if (style === 'wet') { for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(150,190,255,' + (0.03 + rnd() * 0.06) + ')'; g.fillRect(rnd() * w, rnd() * h, 6 + rnd() * 30, 20 + rnd() * 120); } }
      if (style === 'ice') { for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(220,250,255,' + (0.05 + rnd() * 0.12) + ')'; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 10, 30 + rnd() * 160); } }
      if (style === 'sand') { for (let i = 0; i < 80; i++) { g.fillStyle = 'rgba(255,220,170,' + (0.03 + rnd() * 0.05) + ')'; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 10 + rnd() * 30, 4 + rnd() * 8, 0, 0, 7); g.fill(); } }
      if (style === 'metal') { g.strokeStyle = 'rgba(125,249,255,0.18)'; g.lineWidth = 2; for (let y = 0; y < h; y += 128) { g.strokeRect(14, y + 2, w - 28, 124); } g.fillStyle = 'rgba(255,255,255,.18)'; for (let y = 0; y < h; y += 128) for (const x of [24, w - 24]) { g.beginPath(); g.arc(x, y + 14, 3, 0, 7); g.fill(); } }
      if (style === 'neon') { g.strokeStyle = 'rgba(255,47,208,0.22)'; g.lineWidth = 1.5; for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } for (let x = 32; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } }
      if (style === 'basalt') { g.strokeStyle = 'rgba(255,90,20,0.55)'; g.lineWidth = 1.6; g.shadowColor = '#ff4a10'; g.shadowBlur = 6; for (let i = 0; i < 16; i++) { let x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 50; y += 10 + rnd() * 40; g.lineTo(x, y); } g.stroke(); } g.shadowBlur = 0; }
      // lane markings
      g.fillStyle = r.line;
      g.globalAlpha = 0.28; g.fillRect(63, 0, 2, h); g.fillRect(191, 0, 2, h);
      g.globalAlpha = 0.9; for (let y = 0; y < h; y += 128) g.fillRect(124, y + 8, 8, 64);
      // glowing edge lines
      g.globalAlpha = 1; g.shadowColor = r.edge; g.shadowBlur = 10; g.fillStyle = r.edge;
      g.fillRect(6, 0, 7, h); g.fillRect(w - 13, 0, 7, h);
      g.shadowBlur = 0;
    }, true);
  }
  function chevronTex(color) {
    return canvasTex(128, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = color; g.lineWidth = 16; g.lineJoin = 'miter'; g.shadowColor = color; g.shadowBlur = 16;
      for (let k = 0; k < 3; k++) { const y = 60 + k * 70; g.beginPath(); g.moveTo(14, y + 44); g.lineTo(w / 2, y); g.lineTo(w - 14, y + 44); g.stroke(); }
    }, true);
  }
  function puffTex() {
    return canvasTex(128, 128, (g, w, h) => {
      const rnd = TK.mulberry(9);
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 16; i++) {
        const x = w / 2 + (rnd() - 0.5) * w * 0.45, y = h / 2 + (rnd() - 0.5) * h * 0.45, r = 18 + rnd() * 26;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }
    });
  }
  function hazardTex() {
    return canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#16161a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffc61a';
      for (let i = -h; i < w + h; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 + h, h); g.lineTo(i + h, h); g.fill(); }
    }, true);
  }
  function checkerTex(label) {
    return canvasTex(512, 128, (g, w, h) => {
      const s = 16;
      for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) { g.fillStyle = ((x / s + y / s) & 1) ? '#fff' : '#111'; g.fillRect(x, y, s, s); }
      g.fillStyle = 'rgba(10,12,24,.82)'; g.fillRect(96, 20, w - 192, h - 40);
      g.fillStyle = '#fff'; g.font = 'italic 900 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, w / 2, h / 2 + 3);
    });
  }

  /* ---------------- main builder ---------------- */
  function build(levelIdx, renderer) {
    const L = LEVELS[levelIdx], th = L.theme;
    const track = TK.build(L), feats = TK.features(track, L);
    const { n, P, F, U, R, gap } = track;
    const w = L.width;
    const group = new T.Group();
    const rnd = TK.mulberry(L.id * 101 + 7);
    const disposables = [];
    const world = { L, th, track, feats, group, flash: 0, lightning: null, weather: null };

    // bounds
    const mn = V3(1e9, 1e9, 1e9), mx = V3(-1e9, -1e9, -1e9), ctr = V3();
    for (let i = 0; i < n; i++) { for (const [k, a] of [['x', 0], ['y', 1], ['z', 2]]) { const v = P[i * 3 + a]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; } }
    ctr.addVectors(mn, mx).multiplyScalar(0.5);
    world.bounds = { mn, mx, ctr };

    // lights
    const hemi = new T.HemisphereLight(lin(th.light.hemiSky), lin(th.light.hemiGround), th.light.hemiI);
    const sunDir = V3(...th.sky.sun).normalize();
    const dir = new T.DirectionalLight(lin(th.light.dir), th.light.dirI);
    dir.position.copy(sunDir).multiplyScalar(500);
    group.add(hemi, dir, dir.target);
    world.hemi = hemi; world.dir = dir; world.hemiI = th.light.hemiI; world.dirI = th.light.dirI;

    // sky dome + reflection env
    const sky = new T.Mesh(new T.SphereGeometry(3000, 32, 20), skyMaterial(th));
    sky.frustumCulled = false; sky.renderOrder = -1000;
    group.add(sky); world.sky = sky;
    const envScene = new T.Scene();
    const envSky = new T.Mesh(new T.SphereGeometry(50, 32, 20), skyMaterial(th));
    envScene.add(envSky);
    const pm = new T.PMREMGenerator(renderer);
    world.envRT = pm.fromScene(envScene, 0.02); pm.dispose();
    world.env = world.envRT.texture;
    envSky.geometry.dispose(); envSky.material.dispose();

    // ----- road -----
    const runs = []; let a = -1;
    for (let i = 0; i < n; i++) {
      if (!gap[i] && a < 0) a = i;
      if ((gap[i] || i === n - 1) && a >= 0) { runs.push([a, gap[i] ? i - 1 : i]); a = -1; }
    }
    const rtex = roadTexture(th.road.style, th);
    const style = th.road.style;
    const roadMat = new T.MeshStandardMaterial({ map: rtex, roughness: style === 'ice' ? 0.18 : style === 'wet' ? 0.25 : 0.62, metalness: style === 'metal' ? 0.5 : 0.12, envMap: world.env, envMapIntensity: style === 'ice' || style === 'wet' ? 0.9 : 0.35, side: T.DoubleSide });
    const roadTop = new T.Mesh(ribbon(track, [[-w / 2, 0, 0], [w / 2, 0, 1]], runs, 32), roadMat);
    const body = new T.Mesh(ribbon(track, [[-w / 2, 0], [-w / 2 - 0.4, -0.7], [-w * 0.28, -1.9], [w * 0.28, -1.9], [w / 2 + 0.4, -0.7], [w / 2, 0]], runs, 16),
      new T.MeshStandardMaterial({ color: lin('#1b1d26'), roughness: 0.55, metalness: 0.6, envMap: world.env, side: T.DoubleSide }));
    const railCol = lin(th.rail);
    const lipMat = new T.MeshBasicMaterial({ color: railCol, side: T.DoubleSide });
    const lipL = new T.Mesh(ribbon(track, [[-w / 2 - 0.35, 0], [-w / 2 - 0.35, 0.55], [-w / 2 + 0.15, 0.55], [-w / 2 + 0.15, 0]], runs, 16), lipMat);
    const lipR = new T.Mesh(ribbon(track, [[w / 2 + 0.35, 0], [w / 2 + 0.35, 0.55], [w / 2 - 0.15, 0.55], [w / 2 - 0.15, 0]], runs, 16), lipMat);
    const wallMat = new T.MeshBasicMaterial({ color: railCol, transparent: true, opacity: 0.3, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    const wallL = new T.Mesh(ribbon(track, [[-w / 2 + 0.05, 0.55], [-w / 2 + 0.05, 2.0]], runs, 16), wallMat);
    const wallR = new T.Mesh(ribbon(track, [[w / 2 - 0.05, 0.55], [w / 2 - 0.05, 2.0]], runs, 16), wallMat);
    [roadTop, body, lipL, lipR, wallL, wallR].forEach(m => { m.frustumCulled = false; group.add(m); });

    // gap lips (glowing take-off / landing lines)
    const lipGeo = new T.PlaneGeometry(w, 1.4); lipGeo.rotateX(-Math.PI / 2);
    const lipLine = new T.MeshBasicMaterial({ color: railCol, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false });
    const frameMat = (i, lat, up) => { const m = new T.Matrix4(); m.makeBasis(V3(R[i * 3], R[i * 3 + 1], R[i * 3 + 2]), V3(U[i * 3], U[i * 3 + 1], U[i * 3 + 2]), V3(-F[i * 3], -F[i * 3 + 1], -F[i * 3 + 2])); m.setPosition(P[i * 3] + R[i * 3] * lat + U[i * 3] * up, P[i * 3 + 1] + R[i * 3 + 1] * lat + U[i * 3 + 1] * up, P[i * 3 + 2] + R[i * 3 + 2] * lat + U[i * 3 + 2] * up); return m; };
    world.frameMat = frameMat;
    const place = (obj, i, lat, up) => { obj.matrixAutoUpdate = false; obj.matrix.copy(frameMat(i, lat, up)); obj.matrixWorldNeedsUpdate = true; return obj; };
    runs.forEach(([ra, rb], k) => {
      if (k > 0) group.add(place(new T.Mesh(lipGeo, lipLine), ra, 0, 0.09));
      if (k < runs.length - 1) group.add(place(new T.Mesh(lipGeo, lipLine), rb, 0, 0.09));
    });

    // support pillars
    if (['towers', 'mesas', 'lava'].includes(th.scenery)) {
      const items = [];
      for (let i = 40; i < n - 20; i += 46) {
        if (gap[i] || U[i * 3 + 1] < 0.85) continue;
        const y0 = P[i * 3 + 1] - 2;
        const h = y0 + 420;
        items.push({ pos: V3(P[i * 3], y0 - h / 2, P[i * 3 + 2]), sx: 1.7, sy: h, sz: 1.7 });
      }
      const pm2 = new T.MeshStandardMaterial({ color: lin('#232733'), roughness: 0.6, metalness: 0.6 });
      group.add(instanced(new T.CylinderGeometry(1, 1.3, 1, 8), pm2, items));
    }

    // start / finish arches
    const arch = (i, label) => {
      const g = new T.Group();
      const postMat = new T.MeshStandardMaterial({ color: lin('#2a2e3a'), roughness: 0.4, metalness: 0.7 });
      const post = new T.BoxGeometry(1.1, 10, 1.1);
      for (const s of [-1, 1]) { const m = new T.Mesh(post, postMat); m.position.set(s * (w / 2 + 0.9), 5, 0); g.add(m); }
      const banner = new T.Mesh(new T.PlaneGeometry(w + 2.4, 3.2), new T.MeshBasicMaterial({ map: checkerTex(label), side: T.DoubleSide }));
      banner.position.set(0, 9.4, 0); g.add(banner);
      const bar = new T.Mesh(new T.BoxGeometry(w + 3, 0.5, 0.8), new T.MeshBasicMaterial({ color: railCol })); bar.position.set(0, 11.1, 0); g.add(bar);
      const line = new T.Mesh(new T.PlaneGeometry(w, 2.2).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: canvasTex(128, 32, (c, ww, hh) => { for (let y = 0; y < hh; y += 16) for (let x = 0; x < ww; x += 16) { c.fillStyle = ((x / 16 + y / 16) & 1) ? '#fff' : '#111'; c.fillRect(x, y, 16, 16); } }), transparent: true, opacity: 0.9 }));
      line.position.y = 0.1; g.add(line);
      g.matrixAutoUpdate = false; g.matrix.copy(frameMat(i, 0, 0)); return g;
    };
    group.add(arch(Math.round(track.startS / DS), 'START'));
    group.add(arch(Math.round(track.finishS / DS), 'FINISH'));

    // ----- pickups -----
    const edgeCol = lin(th.road.edge);
    const padTex = chevronTex('#ffe45c');
    padTex.repeat.set(1, 1);
    const padGeo = new T.PlaneGeometry(7, 17); padGeo.rotateX(-Math.PI / 2);
    const padMat = new T.MeshBasicMaterial({ map: padTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    const padBase = new T.PlaneGeometry(7.6, 17.6); padBase.rotateX(-Math.PI / 2);
    const padBaseMat = new T.MeshBasicMaterial({ color: lin('#ff8a1f'), transparent: true, opacity: 0.28, blending: T.AdditiveBlending, depthWrite: false });
    feats.pads.forEach(p => { group.add(place(new T.Mesh(padBase, padBaseMat), p.i, p.lat, 0.07)); group.add(place(new T.Mesh(padGeo, padMat), p.i, p.lat, 0.1)); });
    world.padTex = padTex;

    const ringGeo = new T.TorusGeometry(6.2, 0.5, 10, 40);
    const ringMat = new T.MeshBasicMaterial({ color: edgeCol.clone().lerp(lin('#ffffff'), 0.25), transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false });
    const discGeo = new T.CircleGeometry(6.0, 32);
    const discMat = new T.MeshBasicMaterial({ color: edgeCol, transparent: true, opacity: 0.1, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    feats.rings.forEach(r => {
      const g = new T.Group(); g.add(new T.Mesh(ringGeo, ringMat), new T.Mesh(discGeo, discMat));
      place(g, r.i, r.lat, 5.0); r.mesh = g; r.base = g.matrix.clone(); r.fade = 0; group.add(g);
    });
    const orbGeo = new T.SphereGeometry(0.75, 12, 8);
    const orbMat = new T.MeshBasicMaterial({ color: lin('#ffe45c'), blending: T.AdditiveBlending, transparent: true, opacity: 0.95, depthWrite: false });
    feats.orbs.forEach(o => { const m = new T.Mesh(orbGeo, orbMat); place(m, o.i, o.lat, 1.7); o.mesh = m; o.base = m.matrix.clone(); group.add(m); });

    const hz = hazardTex(); hz.repeat.set(1, 1);
    const hazMat = new T.MeshStandardMaterial({ map: hz, roughness: 0.5, metalness: 0.4, emissive: lin('#ff2a10'), emissiveIntensity: 0.25 });
    const glowMat = new T.MeshBasicMaterial({ color: lin('#ff3a1a'), blending: T.AdditiveBlending, transparent: true, opacity: 0.8, depthWrite: false });
    feats.obst.forEach(o => {
      const g = new T.Group();
      if (o.type === 'bar') {
        const bar = new T.Mesh(new T.BoxGeometry(o.half * 2, 1.3, 1.3), hazMat); bar.position.y = 1.4; g.add(bar);
        for (const s of [-1, 1]) { const e = new T.Mesh(new T.SphereGeometry(0.8, 10, 8), glowMat); e.position.set(s * o.half, 1.4, 0); g.add(e); }
      } else {
        const b = new T.Mesh(new T.BoxGeometry(o.half * 2, 2.6, 2.4), hazMat); b.position.y = 1.3; g.add(b);
        const t = new T.Mesh(new T.BoxGeometry(o.half * 2.1, 0.25, 2.5), glowMat); t.position.y = 2.7; g.add(t);
      }
      g.matrixAutoUpdate = false; o.mesh = g; group.add(g);
    });
    world.obstLat = (o, t) => o.type === 'bar' ? Math.sin(t * o.freq + o.phase) * o.amp : o.lat;

    // ----- cloud sea / ground -----
    const dim = V3().subVectors(mx, mn);
    if (th.sea) {
      const s = th.sea, items = [], tex = puffTex();
      for (let i = 0; i < s.count; i++) {
        const sc = s.size * (0.5 + rnd() * 1.1);
        items.push({ pos: V3(ctr.x + (rnd() - 0.5) * (dim.x + 1700), mn.y + s.y + (rnd() - 0.5) * 50, ctr.z + (rnd() - 0.5) * (dim.z + 1700)), sx: sc, sy: 1, sz: sc, ry: rnd() * 6.28 });
      }
      const g = new T.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
      const m = new T.MeshBasicMaterial({ map: tex, color: lin(s.color), transparent: true, opacity: s.op, depthWrite: false });
      const im = instanced(g, m, items); im.renderOrder = -5; group.add(im);
    }
    if (th.ground) {
      const gtex = canvasTex(256, 256, (g, ww, hh) => { g.fillStyle = th.ground; g.fillRect(0, 0, ww, hh); const r = TK.mulberry(3); for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '255,230,190,' : '120,80,40,') + (0.05 + r() * 0.08) + ')'; g.beginPath(); g.ellipse(r() * ww, r() * hh, 12 + r() * 50, 4 + r() * 14, r() * 3, 0, 7); g.fill(); } }, true);
      gtex.repeat.set(30, 30);
      const gm = new T.Mesh(new T.PlaneGeometry(14000, 14000).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ map: gtex, roughness: 1, metalness: 0 }));
      gm.position.set(ctr.x, mn.y - 360, ctr.z); group.add(gm);
    }

    // ----- scenery -----
    const coarse = [];
    for (let i = 0; i < n; i += 6) coarse.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    const far = (p, r) => { const r2 = r * r; for (let i = 0; i < coarse.length; i += 3) { const dx = coarse[i] - p.x, dy = coarse[i + 1] - p.y, dz = coarse[i + 2] - p.z; if (dx * dx + dy * dy + dz * dz < r2) return false; } return true; };
    const spot = (latMin, latMax, dyMin, dyMax, rad) => {
      for (let k = 0; k < 30; k++) {
        const i = Math.floor(rnd() * (n - 1)), side = rnd() < 0.5 ? -1 : 1, lat = side * (latMin + rnd() * (latMax - latMin));
        const p = V3(P[i * 3] + R[i * 3] * lat, P[i * 3 + 1] + dyMin + rnd() * (dyMax - dyMin), P[i * 3 + 2] + R[i * 3 + 2] * lat);
        if (far(p, rad)) return p;
      }
      return null;
    };
    const sceneryMat = (o) => new T.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0, flatShading: true, envMap: world.env, envMapIntensity: 0.4 }, o));

    const kind = th.scenery;
    if (kind === 'islands' || kind === 'islands2') {
      const grassC = kind === 'islands' ? '#98a860' : '#58a84a', rockC = kind === 'islands' ? '#80706c' : '#7d828c';
      const rocks = [], grass = [], trees = [], debris = [];
      for (let k = 0; k < 40; k++) {
        const s = 14 + rnd() * 30, p = spot(50, 190, -70, 60, s * 1.5 + 26); if (!p) continue;
        rocks.push({ pos: p.clone(), sx: s, sy: s * (1.0 + rnd() * 0.9), sz: s, ry: rnd() * 6, color: jitterColor(rockC, rnd, 0.35) });
        grass.push({ pos: p.clone().setY(p.y + 0.05), sx: s, sy: 1.0, sz: s, ry: rnd() * 6, color: jitterColor(grassC, rnd, 0.3) });
        const tc = 2 + Math.floor(rnd() * 5);
        for (let q = 0; q < tc; q++) {
          const a = rnd() * 6.28, rr = rnd() * s * 0.65, ts = (0.5 + rnd() * 0.9) * s * 0.22;
          trees.push({ pos: V3(p.x + Math.cos(a) * rr, p.y + 0.2 * s + ts * 1.1, p.z + Math.sin(a) * rr), sx: ts, sy: ts * 1.6, sz: ts, color: jitterColor(kind === 'islands' ? '#4c6a3a' : '#2f7a3a', rnd, 0.5) });
        }
      }
      for (let k = 0; k < 60; k++) { const p = spot(30, 160, -90, 60, 12); if (!p) continue; const s = 1.5 + rnd() * 5; debris.push({ pos: p, sx: s, sy: s * 0.8, sz: s, rx: rnd() * 3, ry: rnd() * 3, color: jitterColor(rockC, rnd, 0.4) }); }
      const rockG = rough(new T.ConeGeometry(1, 1.8, 8, 2).rotateX(Math.PI).translate(0, -0.9, 0), 0.22, 11);
      const grassG = rough(new T.CylinderGeometry(1, 0.98, 0.24, 12, 1).translate(0, 0.12 * 1, 0), 0.06, 12);
      group.add(instanced(rockG, sceneryMat({ color: 0xffffff }), rocks));
      group.add(instanced(grassG, sceneryMat({ color: 0xffffff }), grass));
      group.add(instanced(rough(new T.ConeGeometry(1, 2, 6, 2), 0.1, 14), sceneryMat({ color: 0xffffff }), trees));
      group.add(instanced(rough(new T.IcosahedronGeometry(1, 0), 0.3, 15), sceneryMat({ color: 0xffffff }), debris));
    } else if (kind === 'towers') {
      const wtex = canvasTex(128, 128, (g, ww, hh) => {
        g.fillStyle = '#05060c'; g.fillRect(0, 0, ww, hh);
        const r = TK.mulberry(21), cols = ['#ffd9a0', '#9fe7ff', '#ff9fe0', '#fff6d0'];
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (r() < 0.42) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.globalAlpha = 0.5 + r() * 0.5; g.fillRect(x * 8 + 1, y * 8 + 2, 5, 4); }
        g.globalAlpha = 1;
      }, true);
      const bmat = new T.MeshStandardMaterial({ color: lin('#10131f'), emissive: 0xffffff, emissiveMap: wtex, emissiveIntensity: 1.25, roughness: 0.4, metalness: 0.6, envMap: world.env });
      const neon = ['#ff2fd0', '#00e5ff', '#ffe45c', '#7d6bff'];
      for (let k = 0; k < 52; k++) {
        const ww = 22 + rnd() * 30, dd = 22 + rnd() * 30, hgt = 400 + rnd() * 200;
        const p = spot(46, 240, -170, -8, Math.max(ww, dd) * 0.9 + 22); if (!p) continue;
        const g = new T.BoxGeometry(ww, hgt, dd).translate(0, -hgt / 2, 0);
        const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(ww, dd) / 9, uv.getY(i) * hgt / 9);
        const m = new T.Mesh(g, bmat); m.position.copy(p); group.add(m);
        const trim = new T.Mesh(new T.BoxGeometry(ww + 1.2, 1, dd + 1.2), new T.MeshBasicMaterial({ color: lin(neon[Math.floor(rnd() * neon.length)]) })); trim.position.copy(p).y += 0.5; group.add(trim);
        if (rnd() < 0.5) { const b = new T.Mesh(new T.CylinderGeometry(1.6, 3.2, 700, 8, 1, true), new T.MeshBasicMaterial({ color: lin(neon[Math.floor(rnd() * neon.length)]), transparent: true, opacity: 0.1, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide })); b.position.copy(p).y += 350; group.add(b); }
      }
    } else if (kind === 'storm') {
      const puffs = [];
      for (let k = 0; k < 46; k++) { const s = 60 + rnd() * 110, p = spot(180, 520, -60, 260, s * 0.9); if (!p) continue; puffs.push({ pos: p, sx: s * 1.5, sy: s * 0.7, sz: s * 1.5, ry: rnd() * 6, color: jitterColor('#3a4658', rnd, 0.5) }); }
      group.add(instanced(rough(new T.SphereGeometry(1, 9, 7), 0.35, 31), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), puffs));
      const pts = []; for (let k = 0; k < 12; k++) pts.push(0, 0, 0);
      const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
      const bolt = new T.Line(bg, new T.LineBasicMaterial({ color: 0xdfe9ff, transparent: true, opacity: 0.95, fog: false }));
      bolt.frustumCulled = false; bolt.visible = false; group.add(bolt);
      world.lightning = { bolt, next: 2 + rnd() * 3, life: 0 };
    } else if (kind === 'mesas') {
      const stripes = canvasTex(8, 128, (g, ww, hh) => { const cs = ['#b5502a', '#d97b3a', '#8e3d22', '#e0a060', '#a8452a', '#c76a35']; for (let y = 0; y < hh; y += 8) { g.fillStyle = cs[Math.floor(y / 8) % cs.length]; g.fillRect(0, y, ww, 8); } });
      const mm = new T.MeshStandardMaterial({ map: stripes, roughness: 1, flatShading: false });
      const items = [];
      for (let k = 0; k < 40; k++) { const r = 28 + rnd() * 50, hh = 200 + rnd() * 160, p = spot(60, 330, -80, 6, r * 1.3 + 24); if (!p) continue; items.push({ pos: p, sx: r, sy: hh, sz: r * (0.7 + rnd() * 0.6), ry: rnd() * 3 }); }
      group.add(instanced(new T.CylinderGeometry(1, 1.35, 1, 14, 1).translate(0, -0.5, 0), mm, items));
      const rocks = []; for (let k = 0; k < 50; k++) { const p = spot(40, 220, -60, 40, 12); if (!p) continue; const s = 3 + rnd() * 9; rocks.push({ pos: p, sx: s, sy: s * 0.8, sz: s, rx: rnd() * 3, ry: rnd() * 3, color: jitterColor('#b06a3a', rnd, 0.4) }); }
      group.add(instanced(rough(new T.IcosahedronGeometry(1, 0), 0.3, 41), sceneryMat({ color: 0xffffff }), rocks));
    } else if (kind === 'ice') {
      const peaks = [], spikes = [], shards = [];
      const peakG = rough(new T.ConeGeometry(1, 2.2, 7, 4).translate(0, -1.1, 0), 0.12, 51);
      gradientColors(peakG, -2.2, -0.2, lin('#5c6c80'), lin('#ffffff'));
      for (let k = 0; k < 34; k++) { const r = 40 + rnd() * 90, hh = 160 + rnd() * 240, p = spot(70, 360, -40, 12, r * 0.8 + 26); if (!p) continue; peaks.push({ pos: p, sx: r, sy: hh / 2.2, sz: r, ry: rnd() * 3, color: lin('#ffffff').multiplyScalar(0.85 + rnd() * 0.3) }); }
      for (let k = 0; k < 70; k++) { const s = 4 + rnd() * 12, p = spot(30, 200, -40, 70, s + 10); if (!p) continue; spikes.push({ pos: p, sx: s * 0.6, sy: s * 1.6, sz: s * 0.6, rx: (rnd() - 0.5) * 0.5, rz: (rnd() - 0.5) * 0.5, color: lin('#bfeaff').multiplyScalar(0.85 + rnd() * 0.3) }); }
      for (let k = 0; k < 40; k++) { const s = 3 + rnd() * 8, p = spot(30, 200, -50, 80, s + 10); if (!p) continue; shards.push({ pos: p, sx: s * 0.5, sy: s * 1.5, sz: s * 0.5, rx: rnd() * 3, ry: rnd() * 3, rz: rnd() * 3 }); }
      group.add(instanced(peakG, new T.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.8, flatShading: true }), peaks));
      group.add(instanced(rough(new T.ConeGeometry(1, 2, 5, 1), 0.1, 52), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.88, envMap: world.env, envMapIntensity: 1.1 }), spikes));
      group.add(instanced(new T.OctahedronGeometry(1, 0), new T.MeshStandardMaterial({ color: lin('#a5e6ff'), roughness: 0.1, metalness: 0.2, flatShading: true, transparent: true, opacity: 0.8, envMap: world.env, envMapIntensity: 1.2 }), shards));
    } else if (kind === 'space') {
      const rocks = [];
      for (let k = 0; k < 90; k++) { const s = 5 + Math.pow(rnd(), 2) * 50, p = spot(40, 420, -140, 160, s * 1.2 + 16); if (!p) continue; rocks.push({ pos: p, sx: s, sy: s * (0.6 + rnd() * 0.5), sz: s * (0.7 + rnd() * 0.5), rx: rnd() * 3, ry: rnd() * 3, rz: rnd() * 3, color: jitterColor('#7a7585', rnd, 0.5) }); }
      group.add(instanced(rough(new T.IcosahedronGeometry(1, 1), 0.4, 61), sceneryMat({ color: 0xffffff, roughness: 1 }), rocks));
      const ptex = canvasTex(512, 256, (g, ww, hh) => {
        const r = TK.mulberry(8); const cs = ['#c9763a', '#e6a45c', '#8a4a2a', '#f2c88a', '#a85a30'];
        for (let y = 0; y < hh; y += 4) { g.fillStyle = cs[Math.floor(r() * cs.length)]; g.globalAlpha = 0.55; g.fillRect(0, y, ww, 4 + r() * 6); }
        g.globalAlpha = 1; for (let i = 0; i < 70; i++) { g.fillStyle = 'rgba(255,240,220,' + r() * 0.12 + ')'; g.beginPath(); g.ellipse(r() * ww, r() * hh, 20 + r() * 70, 2 + r() * 6, 0, 0, 7); g.fill(); }
      });
      const pc = V3(ctr.x - 1200, ctr.y + 650, ctr.z - 1500);
      const planet = new T.Mesh(new T.SphereGeometry(520, 48, 32), new T.MeshStandardMaterial({ map: ptex, roughness: 1, emissiveMap: ptex, emissive: 0xffffff, emissiveIntensity: 0.28, fog: false }));
      planet.position.copy(pc); planet.rotation.z = 0.35; group.add(planet);
      const rtx = canvasTex(512, 8, (g, ww) => { const r = TK.mulberry(4); for (let x = 0; x < ww; x += 2) { g.fillStyle = 'rgba(' + (200 + r() * 55 | 0) + ',' + (170 + r() * 50 | 0) + ',140,' + (0.15 + r() * 0.6) + ')'; g.fillRect(x, 0, 2, 8); } });
      const ringG = new T.RingGeometry(640, 1000, 96, 1);
      const pos = ringG.attributes.position, uv = ringG.attributes.uv;
      for (let i = 0; i < pos.count; i++) { const rr = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, (rr - 640) / 360, 0.5); }
      const ring = new T.Mesh(ringG, new T.MeshBasicMaterial({ map: rtx, transparent: true, side: T.DoubleSide, depthWrite: false, fog: false }));
      ring.position.copy(pc); ring.rotation.set(-1.25, 0, 0.35); group.add(ring);
      const moon = new T.Mesh(new T.SphereGeometry(70, 24, 16), new T.MeshStandardMaterial({ color: lin('#cfd2d8'), roughness: 1, fog: false, emissive: lin('#303238'), emissiveIntensity: 0.6 }));
      moon.position.set(ctr.x + 1500, ctr.y + 350, ctr.z + 400); group.add(moon);
    } else if (kind === 'lava') {
      const spireG = rough(new T.ConeGeometry(1, 3.2, 7, 4).translate(0, -1.6, 0), 0.16, 71);
      gradientColors(spireG, -3.2, 0, lin('#1c0f0c'), lin('#ff5a14'));
      const spires = [];
      for (let k = 0; k < 46; k++) { const r = 18 + rnd() * 40, hh = 160 + rnd() * 240, p = spot(50, 300, -50, 10, r * 0.9 + 24); if (!p) continue; spires.push({ pos: p, sx: r, sy: hh / 3.2, sz: r, ry: rnd() * 3 }); }
      group.add(instanced(spireG, new T.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.9, flatShading: true, emissive: lin('#ff3a08'), emissiveIntensity: 0.3 }), spires));
      const ltex = canvasTex(256, 256, (g, ww, hh) => {
        g.fillStyle = '#ff6a10'; g.fillRect(0, 0, ww, hh); const r = TK.mulberry(7);
        for (let i = 0; i < 140; i++) { g.fillStyle = 'rgba(30,8,4,' + (0.5 + r() * 0.45) + ')'; g.beginPath(); const x = r() * ww, y = r() * hh, s = 8 + r() * 26; for (let a = 0; a < 6; a++) g.lineTo(x + Math.cos(a * 1.05 + r()) * s, y + Math.sin(a * 1.05 + r()) * s); g.fill(); }
        for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(255,230,120,' + r() * 0.5 + ')'; g.fillRect(r() * ww, r() * hh, 2 + r() * 6, 2 + r() * 3); }
      }, true);
      ltex.repeat.set(14, 14); world.lavaTex = ltex;
      const lm = new T.Mesh(new T.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: ltex, color: lin('#ff9a60') }));
      lm.position.set(ctr.x, mn.y - 300, ctr.z); group.add(lm);
      for (let k = 0; k < 14; k++) { const p = spot(120, 500, -300, -150, 40); if (!p) continue; const c = new T.Mesh(new T.CylinderGeometry(7, 13, 520, 10, 1, true), new T.MeshBasicMaterial({ color: lin('#ff6a20'), transparent: true, opacity: 0.2, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide })); c.position.copy(p).y += 120; group.add(c); }
    }

    // ----- weather -----
    if (th.weather) {
      const wcfg = th.weather, cnt = wcfg.count, size = 170, half = size / 2;
      const pos = new Float32Array(cnt * (wcfg.type === 'rain' ? 6 : 3));
      const base = new Float32Array(cnt * 3);
      for (let i = 0; i < cnt; i++) { base[i * 3] = (rnd() - 0.5) * size; base[i * 3 + 1] = (rnd() - 0.5) * size; base[i * 3 + 2] = (rnd() - 0.5) * size; }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      let obj;
      if (wcfg.type === 'rain') obj = new T.LineSegments(geo, new T.LineBasicMaterial({ color: lin(wcfg.color), transparent: true, opacity: 0.45, fog: true }));
      else obj = new T.Points(geo, new T.PointsMaterial({ color: lin(wcfg.color), size: wcfg.type === 'snow' ? 0.55 : wcfg.type === 'embers' ? 0.5 : 0.35, transparent: true, opacity: wcfg.type === 'dust' ? 0.35 : 0.9, depthWrite: false, blending: wcfg.type === 'embers' ? T.AdditiveBlending : T.NormalBlending, sizeAttenuation: true }));
      obj.frustumCulled = false; group.add(obj);
      world.weather = { obj, base, cnt, type: wcfg.type, size, half, pos, geo };
    }

    // ----- per-frame -----
    const tmp = V3();
    world.update = function (dt, time, cam, vel) {
      sky.position.copy(cam.position);
      sky.material.uniforms.time.value = time;
      padTex.offset.y = -time * 1.6;
      if (world.lavaTex) { world.lavaTex.offset.x = time * 0.004; world.lavaTex.offset.y = time * 0.006; }
      dir.position.copy(cam.position).addScaledVector(sunDir, 500); dir.target.position.copy(cam.position);
      dir.target.updateMatrixWorld();
      feats.rings.forEach(r => {
        if (r.got) { r.fade = Math.min(1, r.fade + dt * 3); const s = 1 + r.fade * 1.6; r.mesh.visible = r.fade < 1; _m.makeScale(s, s, s); r.mesh.matrix.copy(r.base).multiply(_m); }
        else { _m.makeRotationZ(time * 0.8); r.mesh.matrix.copy(r.base).multiply(_m); }
      });
      feats.orbs.forEach(o => { if (o.got) { o.mesh.visible = false; return; } _m.makeTranslation(0, Math.sin(time * 3 + o.i) * 0.25, 0); o.mesh.matrix.copy(_m).multiply(o.base); });
      feats.obst.forEach(o => { const lat = world.obstLat(o, time); o.mesh.matrix.copy(frameMat(o.i, lat, 0)); });
      // weather
      const wx = world.weather;
      if (wx) {
        const { base, cnt, size, half, pos, type } = wx;
        for (let i = 0; i < cnt; i++) {
          let x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
          if (type === 'rain') y -= 90 * dt; else if (type === 'snow') { y -= 6 * dt; x += Math.sin(time + i) * 2 * dt; } else if (type === 'embers') { y += 7 * dt; x += Math.sin(time * 1.3 + i) * 3 * dt; } else { x -= 5 * dt; y += Math.sin(time + i) * dt; }
          base[i * 3] = x; base[i * 3 + 1] = y; base[i * 3 + 2] = z;
          const wxp = ((x - cam.position.x) % size + size + half) % size - half + cam.position.x;
          const wyp = ((y - cam.position.y) % size + size + half) % size - half + cam.position.y;
          const wzp = ((z - cam.position.z) % size + size + half) % size - half + cam.position.z;
          base[i * 3] = wxp; base[i * 3 + 1] = wyp; base[i * 3 + 2] = wzp;
          if (type === 'rain') {
            pos[i * 6] = wxp; pos[i * 6 + 1] = wyp; pos[i * 6 + 2] = wzp;
            pos[i * 6 + 3] = wxp - vel.x * 0.012; pos[i * 6 + 4] = wyp + 2.4 - vel.y * 0.012; pos[i * 6 + 5] = wzp - vel.z * 0.012;
          } else { pos[i * 3] = wxp; pos[i * 3 + 1] = wyp; pos[i * 3 + 2] = wzp; }
        }
        wx.geo.attributes.position.needsUpdate = true;
      }
      // lightning
      const lt = world.lightning;
      if (lt) {
        lt.next -= dt;
        if (lt.next <= 0) {
          lt.next = 2.5 + Math.random() * 5; lt.life = 0.28;
          const fwd = tmp.copy(cam.getWorldDirection(V3())); fwd.y = 0; fwd.normalize();
          const rx = V3(-fwd.z, 0, fwd.x);
          const cx = cam.position.x + fwd.x * (500 + Math.random() * 500) + rx.x * (Math.random() - 0.5) * 900;
          const cz = cam.position.z + fwd.z * (500 + Math.random() * 500) + rx.z * (Math.random() - 0.5) * 900;
          const a = lt.bolt.geometry.attributes.position; let x = cx, z = cz;
          for (let k = 0; k < 12; k++) { const y = 380 - k * 42; x += (Math.random() - 0.5) * 70; z += (Math.random() - 0.5) * 70; a.setXYZ(k, x, y, z); }
          a.needsUpdate = true; world.flash = 1;
        }
        if (lt.life > 0) { lt.life -= dt; lt.bolt.visible = lt.life > 0 && Math.random() > 0.2; } else lt.bolt.visible = false;
      }
      world.flash = Math.max(0, world.flash - dt * 3.2);
      sky.material.uniforms.flash.value = world.flash * 0.7;
      hemi.intensity = world.hemiI * (1 + world.flash * 1.4);
    };

    world.dispose = function () {
      group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { ['map', 'emissiveMap'].forEach(k => m[k] && m[k].dispose()); m.dispose(); }); } });
      world.envRT.dispose();
    };
    return world;
  }

  root.SkyWorld = { build, lin, canvasTex };
})(window);
