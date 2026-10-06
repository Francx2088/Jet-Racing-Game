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
      if (style === 'coral') { for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '255,240,200,' : '40,200,190,') + (0.04 + rnd() * 0.07) + ')'; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 6 + rnd() * 22, 3 + rnd() * 8, rnd() * 3, 0, 7); g.fill(); } }
      if (style === 'stone') { g.strokeStyle = 'rgba(70,40,20,0.35)'; g.lineWidth = 2; for (let y = 0; y < h; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 48) % 2 ? 0 : 40; x < w; x += 80) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 48); g.stroke(); } } }
      if (style === 'crystal') { for (let i = 0; i < 160; i++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '200,150,255,' : '150,240,255,') + (0.15 + rnd() * 0.4) + ')'; const x = rnd() * w, y = rnd() * h, k = 1 + rnd() * 3; g.beginPath(); g.moveTo(x, y - k * 2); g.lineTo(x + k, y); g.lineTo(x, y + k * 2); g.lineTo(x - k, y); g.fill(); } }
      if (style === 'wood') { for (let y = 0; y < h; y += 32) { g.fillStyle = 'rgba(' + (90 + rnd() * 40 | 0) + ',' + (50 + rnd() * 25 | 0) + ',30,0.55)'; g.fillRect(0, y, w, 30); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y + 30, w, 2); } }
      if (style === 'grid') { g.strokeStyle = 'rgba(61,255,160,0.45)'; g.lineWidth = 1.5; g.shadowColor = '#3dffa0'; g.shadowBlur = 6; for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } for (let x = 16; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } g.shadowBlur = 0; }
      if (style === 'gold') { for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(255,' + (190 + rnd() * 60 | 0) + ',80,' + (0.1 + rnd() * 0.35) + ')'; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); } }
      if (style === 'obsidian') { g.strokeStyle = 'rgba(255,60,120,0.5)'; g.lineWidth = 1.4; g.shadowColor = '#ff3a7a'; g.shadowBlur = 6; for (let i = 0; i < 12; i++) { let x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 60; y += 10 + rnd() * 50; g.lineTo(x, y); } g.stroke(); } g.shadowBlur = 0; }
      if (style === 'chrome') { for (let x = 20; x < w - 20; x += 8) { g.fillStyle = 'rgba(255,255,255,' + (0.03 + rnd() * 0.06) + ')'; g.fillRect(x, 0, 3, h); } }
      if (style === 'void') { for (let i = 0; i < 260; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.2 + rnd() * 0.6) + ')'; g.fillRect(rnd() * w, rnd() * h, 1, 1); } }
      g.fillStyle = r.line;
      g.globalAlpha = 0.28; g.fillRect(63, 0, 2, h); g.fillRect(191, 0, 2, h);
      g.globalAlpha = 0.9; for (let y = 0; y < h; y += 128) g.fillRect(124, y + 8, 8, 64);
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

  function build(levelIdx, renderer) {
    const L = LEVELS[levelIdx], th = L.theme;
    const track = TK.build(L), feats = TK.features(track, L);
    const { n, P, F, U, R, gap } = track;
    const w = L.width;
    const group = new T.Group();
    const rnd = TK.mulberry(L.id * 101 + 7);
    const disposables = [];
    const world = { L, th, track, feats, group, flash: 0, lightning: null, weather: null };

    const mn = V3(1e9, 1e9, 1e9), mx = V3(-1e9, -1e9, -1e9), ctr = V3();
    for (let i = 0; i < n; i++) { for (const [k, a] of [['x', 0], ['y', 1], ['z', 2]]) { const v = P[i * 3 + a]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; } }
    ctr.addVectors(mn, mx).multiplyScalar(0.5);
    world.bounds = { mn, mx, ctr };

    const hemi = new T.HemisphereLight(lin(th.light.hemiSky), lin(th.light.hemiGround), th.light.hemiI);
    const sunDir = V3(...th.sky.sun).normalize();
    const dir = new T.DirectionalLight(lin(th.light.dir), th.light.dirI);
    dir.position.copy(sunDir).multiplyScalar(500);
    group.add(hemi, dir, dir.target);
    world.hemi = hemi; world.dir = dir; world.hemiI = th.light.hemiI; world.dirI = th.light.dirI;

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

    const runs = []; let a = -1;
    for (let i = 0; i < n; i++) {
      if (!gap[i] && a < 0) a = i;
      if ((gap[i] || i === n - 1) && a >= 0) { runs.push([a, gap[i] ? i - 1 : i]); a = -1; }
    }
    const rtex = roadTexture(th.road.style, th);
    const style = th.road.style;
    const roadMat = new T.MeshStandardMaterial({ map: rtex, roughness: style === 'ice' ? 0.18 : style === 'wet' ? 0.25 : (style === 'chrome' || style === 'obsidian' || style === 'crystal') ? 0.3 : 0.62, metalness: style === 'metal' || style === 'chrome' ? 0.5 : style === 'gold' ? 0.35 : 0.12, envMap: world.env, envMapIntensity: style === 'ice' || style === 'wet' ? 0.9 : 0.35, side: T.DoubleSide });
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

    const lipGeo = new T.PlaneGeometry(w, 1.4); lipGeo.rotateX(-Math.PI / 2);
    const lipLine = new T.MeshBasicMaterial({ color: railCol, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false });
    const frameMat = (i, lat, up) => { const m = new T.Matrix4(); m.makeBasis(V3(R[i * 3], R[i * 3 + 1], R[i * 3 + 2]), V3(U[i * 3], U[i * 3 + 1], U[i * 3 + 2]), V3(-F[i * 3], -F[i * 3 + 1], -F[i * 3 + 2])); m.setPosition(P[i * 3] + R[i * 3] * lat + U[i * 3] * up, P[i * 3 + 1] + R[i * 3 + 1] * lat + U[i * 3 + 1] * up, P[i * 3 + 2] + R[i * 3 + 2] * lat + U[i * 3 + 2] * up); return m; };
    world.frameMat = frameMat;
    const place = (obj, i, lat, up) => { obj.matrixAutoUpdate = false; obj.matrix.copy(frameMat(i, lat, up)); obj.matrixWorldNeedsUpdate = true; return obj; };
    runs.forEach(([ra, rb], k) => {
      if (k > 0) group.add(place(new T.Mesh(lipGeo, lipLine), ra, 0, 0.09));
      if (k < runs.length - 1) group.add(place(new T.Mesh(lipGeo, lipLine), rb, 0, 0.09));
    });

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

    const edgeCol = lin(th.road.edge);
    const padTex = chevronTex('#ffe45c');
    padTex.repeat.set(1, 1);
    const padGeo = new T.PlaneGeometry(7, 17); padGeo.rotateX(-Math.PI / 2);
    const padMat = new T.MeshBasicMaterial({ map: padTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    const padBase = new T.PlaneGeometry(7.6, 17.6); padBase.rotateX(-Math.PI / 2);
    const padBaseMat = new T.MeshBasicMaterial({ color: lin('#ff8a1f'), transparent: true, opacity: 0.28, blending: T.AdditiveBlending, depthWrite: false });
    feats.pads.forEach(p => { group.add(place(new T.Mesh(padBase, padBaseMat), p.i, p.lat, 0.07)); group.add(place(new T.Mesh(padGeo, padMat), p.i, p.lat, 0.1)); });
    world.padTex = padTex;

    const hz = hazardTex(); hz.repeat.set(1, 1);
    const hazMat = new T.MeshStandardMaterial({ map: hz, roughness: 0.5, metalness: 0.4, emissive: lin('#ff2a10'), emissiveIntensity: 0.25 });
    const glowMat = new T.MeshBasicMaterial({ color: lin('#ff3a1a'), blending: T.AdditiveBlending, transparent: true, opacity: 0.8, depthWrite: false });
    const greenMat = new T.MeshBasicMaterial({ color: lin('#3dff8a'), blending: T.AdditiveBlending, transparent: true, opacity: 0.9, depthWrite: false });
    const postMat = new T.MeshStandardMaterial({ color: lin('#262a36'), roughness: 0.4, metalness: 0.7 });
    const coneTex = canvasTex(16, 64, (g, ww, hh) => { g.fillStyle = '#ff6a14'; g.fillRect(0, 0, ww, hh); g.fillStyle = '#fff'; g.fillRect(0, 20, ww, 9); g.fillRect(0, 38, ww, 6); });
    const coneMat = new T.MeshStandardMaterial({ map: coneTex, roughness: 0.6 });
    const coneGeo = new T.ConeGeometry(0.5, 1.15, 12);
    const boxG = new T.BoxGeometry(1, 1, 1), cylG = new T.CylinderGeometry(1, 1, 1, 14);
    const mk = (geo, mat, x, y, z, sx, sy, sz, parent) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m; };
    const warnGeo = new T.PlaneGeometry(w, 3.2); warnGeo.rotateX(-Math.PI / 2);
    const hzW = hazardTex(); hzW.repeat.set(w / 4, 0.8);
    const warnMat = new T.MeshBasicMaterial({ map: hzW, transparent: true, opacity: 0.5, depthWrite: false });
    feats.obst.forEach(o => {
      const g = new T.Group();
      if (o.type === 'bar') {
        mk(boxG, hazMat, 0, 1.4, 0, o.half * 2, 1.3, 1.3, g);
        for (const s of [-1, 1]) mk(new T.SphereGeometry(0.8, 10, 8), glowMat, s * o.half, 1.4, 0, 1, 1, 1, g);
      } else if (o.type === 'block') {
        mk(boxG, hazMat, 0, 1.3, 0, o.half * 2, 2.6, 2.4, g);
        mk(boxG, glowMat, 0, 2.7, 0, o.half * 2.1, 0.25, 2.5, g);
      } else if (o.type === 'cones') {
        [[-1.5, 0.4], [0.2, -0.5], [1.4, 0.3], [0, 1.0], [-0.6, -1.0]].forEach(([x, z]) => mk(coneGeo, coneMat, x * o.half / 1.6, 0.58, z, 1, 1, 1, g));
      } else if (o.type === 'spinner') {
        mk(cylG, postMat, 0, 0.8, 0, 0.8, 1.6, 0.8, g);
        mk(new T.SphereGeometry(0.9, 10, 8), glowMat, 0, 1.7, 0, 1, 1, 1, g);
        const arm = new T.Group(); arm.position.y = 1.5; g.add(arm);
        mk(boxG, hazMat, 0, 0, 0, o.arm * 2, 0.55, 0.75, arm);
        for (const s of [-1, 1]) mk(new T.SphereGeometry(0.55, 10, 8), glowMat, s * o.arm, 0, 0, 1, 1, 1, arm);
        o.arm3d = arm;
      } else if (o.type === 'gate') {
        const L0 = -w / 2, gl = o.gapLat - o.gap / 2, gr = o.gapLat + o.gap / 2, R0 = w / 2;
        mk(boxG, hazMat, (L0 + gl) / 2, 1.6, 0, gl - L0, 3.2, 2.2, g);
        mk(boxG, hazMat, (gr + R0) / 2, 1.6, 0, R0 - gr, 3.2, 2.2, g);
        mk(boxG, glowMat, (L0 + gl) / 2, 3.3, 0, gl - L0, 0.25, 2.3, g);
        mk(boxG, glowMat, (gr + R0) / 2, 3.3, 0, R0 - gr, 0.25, 2.3, g);
        for (const x of [gl, gr]) mk(boxG, greenMat, x, 1.6, 0, 0.22, 3.2, 2.3, g);
        mk(boxG, greenMat, o.gapLat, 3.7, 0, o.gap, 0.14, 0.14, g);
      } else if (o.type === 'laser') {
        const x0 = o.side < 0 ? -w / 2 : w / 2 - o.ext, x1 = o.side < 0 ? -w / 2 + o.ext : w / 2;
        mk(boxG, postMat, o.side < 0 ? -w / 2 - 0.2 : w / 2 + 0.2, 1.4, 0, 0.7, 2.8, 0.7, g);
        mk(boxG, postMat, o.side < 0 ? x1 : x0, 1.4, 0, 0.5, 2.8, 0.5, g);
        const beam = mk(boxG, new T.MeshBasicMaterial({ color: lin('#ff2a2a'), blending: T.AdditiveBlending, transparent: true, opacity: 0.9, depthWrite: false }), (x0 + x1) / 2, 1.1, 0, x1 - x0, 0.28, 0.28, g);
        const beam2 = mk(boxG, new T.MeshBasicMaterial({ color: lin('#ff2a2a'), blending: T.AdditiveBlending, transparent: true, opacity: 0.9, depthWrite: false }), (x0 + x1) / 2, 2.0, 0, x1 - x0, 0.28, 0.28, g);
        o.beams = [beam, beam2];
      }
      g.matrixAutoUpdate = false; o.mesh = g; group.add(g);
      if (o.type !== 'cones') {
        group.add(place(new T.Mesh(warnGeo, warnMat), Math.max(2, o.i - 22), 0, 0.075));
        const gantry = new T.Group();
        for (const sx of [-1, 1]) mk(boxG, glowMat, sx * (w / 2 + 1.1), 4.8, 0, 0.35, 9.6, 0.35, gantry);
        mk(boxG, new T.MeshBasicMaterial({ color: lin('#ff3a1a'), transparent: true, opacity: 0.45, blending: T.AdditiveBlending, depthWrite: false }), 0, 9.5, 0, w + 2.6, 0.28, 0.28, gantry);
        gantry.matrixAutoUpdate = false; place(gantry, o.i, 0, 0); group.add(gantry);
      }
    });
    world.blocked = (o, t) => {
      switch (o.type) {
        case 'bar': { const l = Math.sin(t * o.freq + o.phase) * o.amp; return [[l - o.half, l + o.half]]; }
        case 'spinner': { const e = Math.abs(Math.cos(t * o.freq + o.phase)) * o.arm + 0.7; return [[o.lat - e, o.lat + e]]; }
        case 'gate': return [[-w / 2 - 6, o.gapLat - o.gap / 2], [o.gapLat + o.gap / 2, w / 2 + 6]];
        case 'laser': return ((t + o.phase) % o.period) / o.period < o.duty ? [o.side < 0 ? [-w / 2 - 6, -w / 2 + o.ext] : [w / 2 - o.ext, w / 2 + 6]] : [];
        default: return [[o.lat - o.half, o.lat + o.half]];
      }
    };

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

    const anims = []; world.anims = anims;
    const basic = (hex, o) => new T.MeshBasicMaterial(Object.assign({ color: lin(hex) }, o || {}));
    const glow = (hex, op) => basic(hex, { transparent: true, opacity: op === undefined ? 0.8 : op, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    const std = (hex, o) => new T.MeshStandardMaterial(Object.assign({ color: lin(hex), roughness: 0.7, metalness: 0.1, envMap: world.env, envMapIntensity: 0.5 }, o || {}));
    const trackSpots = (every, test) => { const out = []; for (let i = 160; i < n - 120; i += every) { let ok = true; for (let d = -10; d <= 10; d += 2) { const j = i + d; if (gap[j] || U[j * 3 + 1] < 0.85) { ok = false; break; } } for (const o of feats.obst) if (Math.abs(o.i - i) < 24) ok = false; if (ok && (!test || test(i))) out.push(i); } return out; };

    if (kind === 'tropical') {
      const wave = canvasTex(256, 256, (g, ww, hh) => {
        const gr = g.createLinearGradient(0, 0, ww, hh); gr.addColorStop(0, '#0fb5c4'); gr.addColorStop(1, '#1a8fd0'); g.fillStyle = gr; g.fillRect(0, 0, ww, hh);
        const r = TK.mulberry(17); for (let i = 0; i < 120; i++) { g.strokeStyle = 'rgba(255,255,255,' + (0.08 + r() * 0.25) + ')'; g.lineWidth = 1 + r() * 2; g.beginPath(); const x = r() * ww, y = r() * hh; g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 4, x + 20 + r() * 20, y); g.stroke(); }
      }, true);
      wave.repeat.set(40, 40); anims.push(t => { wave.offset.set(t * 0.004, t * 0.002); });
      const ocean = new T.Mesh(new T.PlaneGeometry(14000, 14000).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ map: wave, roughness: 0.25, metalness: 0.3, envMap: world.env, envMapIntensity: 1.2 }));
      ocean.position.set(ctr.x, mn.y - 120, ctr.z); group.add(ocean);
      const sand = [], trunks = [], fronds = [], lights = [];
      for (let k = 0; k < 36; k++) {
        const s = 16 + rnd() * 26, p = spot(60, 260, -60, 20, s + 26); if (!p) continue;
        sand.push({ pos: p.clone(), sx: s, sy: 1, sz: s * (0.7 + rnd() * 0.5), ry: rnd() * 6, color: jitterColor('#f2dca0', rnd, 0.2) });
        const pc = 2 + Math.floor(rnd() * 4);
        for (let q = 0; q < pc; q++) {
          const a = rnd() * 6.28, rr = rnd() * s * 0.5, hgt = 9 + rnd() * 9, lean = (rnd() - 0.5) * 0.5;
          const base = V3(p.x + Math.cos(a) * rr, p.y + 1, p.z + Math.sin(a) * rr);
          trunks.push({ pos: base.clone().setY(base.y + hgt / 2), sx: 0.5, sy: hgt, sz: 0.5, rz: lean, color: jitterColor('#8a6a40', rnd, 0.3) });
          const top = base.clone().add(V3(-Math.sin(lean) * hgt, hgt, 0));
          for (let f = 0; f < 6; f++) fronds.push({ pos: top.clone(), sx: 0.6, sy: 0.15, sz: 7, ry: f * 1.05 + rnd(), rx: 0.45, color: jitterColor('#2fa84a', rnd, 0.4) });
        }
        if (rnd() < 0.18) lights.push(p.clone());
      }
      group.add(instanced(new T.CylinderGeometry(1, 1.15, 2, 16).translate(0, 0, 0), std('#ffffff', { roughness: 1 }), sand));
      group.add(instanced(new T.CylinderGeometry(0.7, 1, 1, 6), std('#ffffff', { roughness: 1 }), trunks));
      group.add(instanced(new T.BoxGeometry(1, 1, 1).translate(0, 0, 0.5), std('#ffffff', { roughness: 0.9, side: T.DoubleSide }), fronds));
      const stripe = canvasTex(16, 64, (g, ww, hh) => { for (let y = 0; y < hh; y += 16) { g.fillStyle = (y / 16) % 2 ? '#ffffff' : '#e8322a'; g.fillRect(0, y, ww, 16); } });
      lights.forEach(p => { const lh = new T.Mesh(new T.CylinderGeometry(2.2, 3, 30, 14), new T.MeshStandardMaterial({ map: stripe, roughness: 0.6 })); lh.position.copy(p).y += 16; group.add(lh); const lamp = new T.Mesh(new T.SphereGeometry(2.6, 12, 8), glow('#fff2b0', 0.9)); lamp.position.copy(p).y += 33; group.add(lamp); });
    } else if (kind === 'hologram') {
      const ringCols = ['#2f8fff', '#7df9ff', '#ff2fd0', '#a06bff'];
      for (let k = 0; k < 22; k++) {
        const p = spot(80, 340, -40, 140, 60); if (!p) continue;
        const r = 30 + rnd() * 50, ring = new T.Mesh(new T.TorusGeometry(r, 1.2 + rnd() * 1.5, 8, 64), glow(ringCols[k % 4], 0.75));
        ring.position.copy(p); ring.rotation.set(rnd() * 3, rnd() * 3, 0); group.add(ring);
        const sp = (rnd() - 0.5) * 0.3; anims.push(t => { ring.rotation.y += sp * 0.016; ring.rotation.x += sp * 0.008; });
      }
      const railY = mn.y - 90, railM = basic('#1b2a6b'), trainM = std('#d8e2ff', { metalness: 0.8, roughness: 0.2, emissive: lin('#2f8fff'), emissiveIntensity: 0.35 });
      for (let k = 0; k < 6; k++) {
        const z = ctr.z + (k - 2.5) * dim.z / 5, len = dim.x + 1600;
        const rail = new T.Mesh(new T.BoxGeometry(len, 2, 6), railM); rail.position.set(ctr.x, railY - k * 25, z); group.add(rail);
        const edge = new T.Mesh(new T.BoxGeometry(len, 0.6, 0.6), glow('#7df9ff', 0.9)); edge.position.set(ctr.x, railY - k * 25 + 1.4, z + 3); group.add(edge);
        const train = new T.Group();
        for (let c = 0; c < 5; c++) { mk(boxG, trainM, c * 26, 0, 0, 24, 6, 7, train); mk(boxG, glow('#7df9ff', 0.9), c * 26, 1, 3.6, 22, 1.2, 0.2, train); }
        train.position.set(ctr.x, railY - k * 25 + 5, z); group.add(train);
        const spd = (110 + rnd() * 80) * (k % 2 ? 1 : -1), x0 = ctr.x - len / 2;
        anims.push(t => { train.position.x = x0 + (((t * spd) % len) + len) % len; });
      }
    } else if (kind === 'pyramids') {
      const gy = mn.y - 360;
      const pyrG = new T.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
      const stone = canvasTex(64, 64, (g, ww, hh) => { g.fillStyle = '#d9b27a'; g.fillRect(0, 0, ww, hh); g.strokeStyle = 'rgba(90,60,30,.35)'; for (let y = 0; y < hh; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(ww, y); g.stroke(); } }, true);
      stone.repeat.set(12, 12);
      const pyrs = [], obel = [];
      for (let k = 0; k < 18; k++) { const h = 220 + rnd() * 160, p = spot(h * 0.9, h * 2.4, -10, 10, h * 1.05); if (!p) continue; const hh = Math.min(h, p.y - gy - 30); pyrs.push({ pos: V3(p.x, gy, p.z), sx: hh * 1.5, sy: hh, sz: hh * 1.5, ry: rnd() * 0.4 }); }
      for (let k = 0; k < 24; k++) { const p = spot(60, 280, -10, 10, 30); if (!p) continue; const h = 200 + rnd() * 160; obel.push({ pos: V3(p.x, gy + h / 2, p.z), sx: 7, sy: h, sz: 7 }); }
      group.add(instanced(pyrG, new T.MeshStandardMaterial({ map: stone, roughness: 1, flatShading: true }), pyrs));
      group.add(instanced(new T.CylinderGeometry(0.55, 1, 1, 4, 1).rotateY(Math.PI / 4), std('#c99a5a', { flatShading: true, roughness: 1 }), obel));
      group.add(instanced(new T.ConeGeometry(1, 1.2, 4).rotateY(Math.PI / 4), std('#ffd27a', { metalness: 0.8, roughness: 0.25, emissive: lin('#b8861a'), emissiveIntensity: 0.3 }), obel.map(o => ({ pos: V3(o.pos.x, o.pos.y + o.sy / 2 + 5, o.pos.z), sx: 5, sy: 9, sz: 5 }))));
      const dunes = []; for (let k = 0; k < 40; k++) { dunes.push({ pos: V3(ctr.x + (rnd() - 0.5) * (dim.x + 3000), gy - 20, ctr.z + (rnd() - 0.5) * (dim.z + 3000)), sx: 200 + rnd() * 300, sy: 40 + rnd() * 50, sz: 120 + rnd() * 200, ry: rnd() * 3 }); }
      group.add(instanced(new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#e2b878', { roughness: 1 }), dunes));
    } else if (kind === 'crystal') {
      const prism = new T.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0), tip = new T.ConeGeometry(1, 1, 6).translate(0, 0.5, 0);
      const a = [], b = [];
      for (let k = 0; k < 40; k++) {
        const p = spot(60, 300, -80, 80, 40); if (!p) continue;
        const c = 3 + Math.floor(rnd() * 4);
        for (let q = 0; q < c; q++) {
          const r = 3 + rnd() * 7, h = 20 + rnd() * 60, tilt = (rnd() - 0.5) * 0.9, ry = rnd() * 6, col = lin(rnd() < 0.5 ? '#b47bff' : '#5fe6ff').multiplyScalar(0.8 + rnd() * 0.4);
          a.push({ pos: p.clone(), sx: r, sy: h, sz: r, rz: tilt, ry, color: col });
          b.push({ pos: p.clone().add(V3(-Math.sin(tilt) * h, Math.cos(tilt) * h, 0)), sx: r, sy: r * 2.4, sz: r, rz: tilt, ry, color: col });
        }
      }
      const cm = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.82, emissive: lin('#5a2aa0'), emissiveIntensity: 0.6, envMap: world.env, envMapIntensity: 1.4, flatShading: true });
      group.add(instanced(prism, cm, a)); group.add(instanced(tip, cm, b));
      for (let k = 0; k < 14; k++) { const p = spot(40, 200, 10, 90, 20); if (!p) continue; const sh = new T.Mesh(new T.OctahedronGeometry(4 + rnd() * 5, 0), glow(rnd() < 0.5 ? '#c8a0ff' : '#7df9ff', 0.6)); sh.position.copy(p); group.add(sh); const sp = 0.3 + rnd() * 0.6, y0 = p.y; anims.push(t => { sh.rotation.y = t * sp; sh.position.y = y0 + Math.sin(t * sp + k) * 4; }); }
    } else if (kind === 'blackhole') {
      const bh = V3(ctr.x + 900, ctr.y + 500, ctr.z - 1800);
      const hole = new T.Mesh(new T.SphereGeometry(240, 40, 24), basic('#000000', { fog: false })); hole.position.copy(bh); group.add(hole);
      const diskTex = canvasTex(512, 8, (g, ww) => { const gr = g.createLinearGradient(0, 0, ww, 0); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.15, 'rgba(255,210,140,.95)'); gr.addColorStop(0.5, 'rgba(255,90,170,.6)'); gr.addColorStop(1, 'rgba(120,40,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, ww, 8); });
      const diskG = new T.RingGeometry(270, 900, 128, 1); const dp = diskG.attributes.position, duv = diskG.attributes.uv;
      for (let i = 0; i < dp.count; i++) duv.setXY(i, (Math.hypot(dp.getX(i), dp.getY(i)) - 270) / 630, 0.5);
      const disk = new T.Mesh(diskG, new T.MeshBasicMaterial({ map: diskTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
      disk.position.copy(bh); disk.rotation.set(-1.25, 0.2, 0); group.add(disk);
      const halo = new T.Mesh(new T.TorusGeometry(250, 10, 12, 96), basic('#ffe0b0', { transparent: true, opacity: 0.9, blending: T.AdditiveBlending, fog: false }));
      halo.position.copy(bh); halo.lookAt(V3(ctr.x, ctr.y, ctr.z)); group.add(halo);
      anims.push(t => { disk.rotation.z = t * 0.05; });
      const hullM = std('#c9cfdc', { metalness: 0.85, roughness: 0.25 });
      for (let k = 0; k < 4; k++) {
        const p = spot(160, 500, 40, 200, 90); if (!p) continue;
        const st = new T.Group(); st.position.copy(p);
        st.add(new T.Mesh(new T.TorusGeometry(40, 4, 10, 48), hullM)); mk(cylG, hullM, 0, 0, 0, 8, 60, 8, st);
        for (let q = 0; q < 4; q++) { const sp = mk(boxG, hullM, 0, 0, 0, 80, 2, 2, st); sp.rotation.z = q * Math.PI / 4; }
        mk(new T.TorusGeometry(40, 1, 6, 48), glow('#ff8ae0', 0.9), 0, 0, 0, 1.06, 1.06, 1.06, st);
        st.rotation.x = rnd() * 1.2; group.add(st); const sp = 0.1 + rnd() * 0.15; anims.push(t => { st.rotation.z = t * sp; });
      }
      for (let k = 0; k < 6; k++) {
        const p = spot(200, 600, 100, 300, 50); if (!p) continue;
        const cm = new T.Group(); mk(new T.SphereGeometry(4, 10, 8), glow('#ffffff', 1), 0, 0, 0, 1, 1, 1, cm);
        const tl = mk(new T.ConeGeometry(4, 90, 10, 1, true), glow('#8ad8ff', 0.4), 0, 45, 0, 1, 1, 1, cm); tl.rotation.x = Math.PI;
        cm.position.copy(p); cm.rotation.z = 1.2; group.add(cm);
        const base = p.clone(), ph = rnd() * 10; anims.push(t => { const q = ((t * 0.05 + ph) % 1); cm.position.set(base.x + q * 900, base.y - q * 300, base.z); });
      }
    } else if (kind === 'volcano') {
      const cone = gradientColors(rough(new T.ConeGeometry(1, 1, 18, 6, true).translate(0, 0.5, 0), 0.04, 77), 0, 1, lin('#2a1c18'), lin('#3a2620'));
      const vols = [];
      for (let k = 0; k < 8; k++) { const p = spot(220, 700, -10, 10, 220); if (!p) continue; const h = 380 + rnd() * 260; vols.push({ p: V3(p.x, mn.y - 380, p.z), h, r: h * 0.8 }); }
      vols.forEach((v, k) => {
        const m = new T.Mesh(cone, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: T.DoubleSide }));
        m.position.copy(v.p); m.scale.set(v.r, v.h, v.r); group.add(m);
        const top = v.p.clone(); top.y += v.h * 0.97;
        const crater = new T.Mesh(new T.CircleGeometry(v.r * 0.07, 24).rotateX(-Math.PI / 2), glow('#ffb040', 1)); crater.position.copy(top); group.add(crater);
        const plume = new T.Mesh(new T.CylinderGeometry(30, 10, 260, 12, 1, true), glow('#ff6a20', 0.25)); plume.position.copy(top).y += 130; group.add(plume);
        for (let q = 0; q < 3; q++) { const st = new T.Mesh(new T.BoxGeometry(6, v.h * 0.7, 2), glow('#ff5a14', 0.7)); const a = rnd() * 6.28; st.position.set(top.x + Math.cos(a) * v.r * 0.35, v.p.y + v.h * 0.6, top.z + Math.sin(a) * v.r * 0.35); st.rotation.set(Math.sin(a) * 0.62, 0, -Math.cos(a) * 0.62); group.add(st); }
        const bombs = [];
        for (let q = 0; q < 8; q++) { const b = new T.Mesh(new T.SphereGeometry(5, 8, 6), glow('#ffcf60', 1)); group.add(b); bombs.push({ b, a: rnd() * 6.28, s: 0.7 + rnd() * 0.6, ph: rnd() }); }
        anims.push(t => { bombs.forEach(o => { const q = (t * 0.25 * o.s + o.ph) % 1, d = q * 160; o.b.position.set(top.x + Math.cos(o.a) * d, top.y + 260 * q - 300 * q * q, top.z + Math.sin(o.a) * d); }); });
      });
      const lm = new T.Mesh(new T.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), basic('#4a1a10')); lm.position.set(ctr.x, mn.y - 380, ctr.z); group.add(lm);
    } else if (kind === 'tornado') {
      const swirl = canvasTex(128, 256, (g, ww, hh) => { g.clearRect(0, 0, ww, hh); for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(200,210,220,' + (0.1 + Math.random() * 0.3) + ')'; g.lineWidth = 2 + Math.random() * 6; g.beginPath(); const y = Math.random() * hh; g.moveTo(0, y); g.bezierCurveTo(ww * 0.3, y - 30, ww * 0.7, y + 30, ww, y - 10); g.stroke(); } }, true);
      for (let k = 0; k < 5; k++) {
        const p = spot(260, 700, -100, -60, 120); if (!p) continue;
        const tw = new T.Mesh(new T.CylinderGeometry(90, 8, 520, 24, 8, true).translate(0, 260, 0), new T.MeshBasicMaterial({ map: swirl, transparent: true, opacity: 0.75, depthWrite: false, side: T.DoubleSide, color: lin('#8a96a8') }));
        tw.position.copy(p).y -= 200; group.add(tw);
        const sp = 1.2 + rnd(), x0 = p.x, z0 = p.z, ph = rnd() * 6; anims.push(t => { tw.rotation.y = t * sp; tw.position.x = x0 + Math.sin(t * 0.1 + ph) * 120; tw.position.z = z0 + Math.cos(t * 0.13 + ph) * 120; });
      }
      const rockG = rough(new T.ConeGeometry(1, 1.4, 8, 2).rotateX(Math.PI).translate(0, -0.7, 0), 0.2, 88);
      const towerM = std('#e8edf2', { metalness: 0.4, roughness: 0.4 });
      for (let k = 0; k < 14; k++) {
        const p = spot(60, 260, -40, 40, 40); if (!p) continue;
        const s = 10 + rnd() * 10, g = new T.Group(); g.position.copy(p);
        const rk = new T.Mesh(rockG, std('#5a5f68', { flatShading: true })); rk.scale.set(s, s, s); g.add(rk);
        mk(new T.CylinderGeometry(0.6, 1.2, 1, 10), towerM, 0, 18, 0, 1, 36, 1, g);
        const hub = new T.Group(); hub.position.set(0, 36, 1.4); g.add(hub);
        for (let q = 0; q < 3; q++) { const bl = mk(boxG, towerM, 0, 8, 0, 1.2, 16, 0.25, hub); const arm = new T.Group(); arm.rotation.z = q * 2.094; arm.add(bl); hub.add(arm); }
        g.rotation.y = rnd() * 6; group.add(g); const sp = 1.5 + rnd(); anims.push(t => { hub.rotation.z = t * sp; });
      }
      const pts = []; for (let k = 0; k < 12; k++) pts.push(0, 0, 0);
      const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
      const bolt = new T.Line(bg, new T.LineBasicMaterial({ color: 0xe8fff0, transparent: true, opacity: 0.95, fog: false }));
      bolt.frustumCulled = false; bolt.visible = false; group.add(bolt);
      world.lightning = { bolt, next: 2 + rnd() * 3, life: 0 };
    } else if (kind === 'zen') {
      const red = std('#c8241c', { roughness: 0.5 }), black = std('#1a1414', { roughness: 0.6 });
      trackSpots(140).forEach(i => {
        const g = new T.Group();
        for (const sx of [-1, 1]) mk(cylG, red, sx * (w / 2 + 1.8), 7, 0, 0.8, 14, 0.8, g);
        mk(boxG, black, 0, 14.6, 0, w + 8, 1.0, 1.4, g); mk(boxG, red, 0, 12.6, 0, w + 5, 0.8, 1.0, g);
        g.matrixAutoUpdate = false; place(g, i, 0, 0); group.add(g);
      });
      const isl = [], cano = [], trunks = [];
      for (let k = 0; k < 30; k++) {
        const s = 14 + rnd() * 22, p = spot(60, 240, -60, 40, s + 30); if (!p) continue;
        isl.push({ pos: p.clone(), sx: s, sy: s * 1.2, sz: s, ry: rnd() * 6, color: jitterColor('#7a6a6a', rnd, 0.3) });
        if (rnd() < 0.35) {
          const pg = new T.Group(); pg.position.copy(p).y += 1;
          for (let f = 0; f < 4; f++) { const sz = 9 - f * 1.7; mk(boxG, std('#f2e6d0'), 0, f * 5 + 2, 0, sz, 4, sz, pg); const roof = mk(new T.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4), std('#2a3a4a'), 0, f * 5 + 4.6, 0, sz * 0.95, 2.2, sz * 0.95, pg); roof.castShadow = false; }
          group.add(pg);
        }
        const tc = 2 + Math.floor(rnd() * 3);
        for (let q = 0; q < tc; q++) { const a = rnd() * 6.28, rr = rnd() * s * 0.55, h = 5 + rnd() * 4; const b = V3(p.x + Math.cos(a) * rr, p.y, p.z + Math.sin(a) * rr); trunks.push({ pos: b.clone().setY(b.y + h / 2), sx: 0.6, sy: h, sz: 0.6, color: lin('#4a3028') }); cano.push({ pos: b.clone().setY(b.y + h + 2), sx: 5 + rnd() * 3, sy: 3.5 + rnd() * 2, sz: 5 + rnd() * 3, color: jitterColor('#ff9fc4', rnd, 0.25) }); }
      }
      group.add(instanced(rough(new T.ConeGeometry(1, 1.6, 8, 2).rotateX(Math.PI).translate(0, -0.8, 0), 0.2, 66), std('#ffffff', { flatShading: true }), isl));
      group.add(instanced(new T.CylinderGeometry(0.6, 1, 1, 6), std('#ffffff'), trunks));
      group.add(instanced(rough(new T.IcosahedronGeometry(1, 1), 0.25, 67), std('#ffffff', { flatShading: true, emissive: lin('#ff6fa8'), emissiveIntensity: 0.12 }), cano));
      trackSpots(90).forEach((i, k) => { const lt = new T.Group(); mk(boxG, std('#9a9a92'), 0, 1.2, 0, 1.2, 2.4, 1.2, lt); mk(boxG, glow('#ffd28a', 0.9), 0, 3, 0, 1.4, 1.2, 1.4, lt); mk(new T.ConeGeometry(1.4, 1, 4).rotateY(Math.PI / 4), std('#7a7a72'), 0, 4.1, 0, 1, 1, 1, lt); lt.matrixAutoUpdate = false; place(lt, i, (k % 2 ? 1 : -1) * (w / 2 + 3), 0); group.add(lt); });
    } else if (kind === 'digital') {
      const gridTex = canvasTex(128, 128, (g, ww, hh) => { g.fillStyle = '#010806'; g.fillRect(0, 0, ww, hh); g.strokeStyle = '#3dffa0'; g.lineWidth = 2; g.shadowColor = '#3dffa0'; g.shadowBlur = 6; g.strokeRect(1, 1, ww - 2, hh - 2); }, true);
      gridTex.repeat.set(160, 160);
      const floor = new T.Mesh(new T.PlaneGeometry(16000, 16000).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: gridTex })); floor.position.set(ctr.x, mn.y - 140, ctr.z); group.add(floor);
      anims.push(t => { gridTex.offset.y = -t * 0.02; });
      const shapes = [new T.IcosahedronGeometry(1, 0), new T.BoxGeometry(1.4, 1.4, 1.4), new T.OctahedronGeometry(1, 0), new T.TetrahedronGeometry(1.2, 0), new T.DodecahedronGeometry(1, 0)].map(g2 => new T.EdgesGeometry(g2));
      const cols = ['#3dffa0', '#ff2fd0', '#7df9ff'];
      for (let k = 0; k < 30; k++) {
        const p = spot(60, 320, -30, 160, 40); if (!p) continue;
        const s = 12 + rnd() * 30, m = new T.LineSegments(shapes[k % shapes.length], new T.LineBasicMaterial({ color: lin(cols[k % 3]), transparent: true, opacity: 0.9 }));
        m.position.copy(p); m.scale.setScalar(s); group.add(m); const sp = 0.2 + rnd() * 0.5; anims.push(t => { m.rotation.set(t * sp, t * sp * 0.7, 0); });
      }
      const N = 160, pos = new Float32Array(N * 6), base = [];
      for (let k = 0; k < N; k++) { const p = spot(30, 260, -60, 60, 10) || V3(ctr.x, ctr.y, ctr.z); base.push({ x: p.x, z: p.z, y0: p.y + 120, sp: 40 + rnd() * 60, ph: rnd() * 300 }); }
      const dg = new T.BufferGeometry(); dg.setAttribute('position', new T.BufferAttribute(pos, 3));
      const streams = new T.LineSegments(dg, new T.LineBasicMaterial({ color: lin('#3dffa0'), transparent: true, opacity: 0.6 })); streams.frustumCulled = false; group.add(streams);
      anims.push(t => { base.forEach((b, k) => { const y = b.y0 - ((t * b.sp + b.ph) % 300); pos.set([b.x, y, b.z, b.x, y + 14, b.z], k * 6); }); dg.attributes.position.needsUpdate = true; });
    } else if (kind === 'stadium') {
      const crowd = canvasTex(256, 64, (g, ww, hh) => { g.fillStyle = '#2a2a3a'; g.fillRect(0, 0, ww, hh); const cs = ['#ff3b30', '#ffd23a', '#2f8fff', '#ffffff', '#3dff8a', '#ff8ae0']; for (let y = 4; y < hh; y += 8) for (let x = 2; x < ww; x += 5) { g.fillStyle = cs[(Math.random() * cs.length) | 0]; g.fillRect(x, y + Math.random() * 2, 3, 4); } }, true);
      const standM = new T.MeshStandardMaterial({ map: crowd, roughness: 0.9 }), frameM = std('#d8dce6', { metalness: 0.6, roughness: 0.4 });
      trackSpots(260).forEach((i, k) => {
        const side = k % 2 ? 1 : -1, g = new T.Group();
        for (let t2 = 0; t2 < 5; t2++) { const tier = mk(boxG, standM, 0, t2 * 3 + 1.5, t2 * 3.2, 60, 3, 3.2, g); tier.material = standM; }
        mk(boxG, frameM, 0, 20, 7, 64, 0.8, 20, g);
        for (const x of [-30, 30]) mk(cylG, frameM, x, 10, 14, 0.8, 20, 0.8, g);
        g.matrixAutoUpdate = false; const m = frameMat(i, side * (w / 2 + 34), -2); m.multiply(new T.Matrix4().makeRotationY(side > 0 ? -Math.PI / 2 : Math.PI / 2)); g.matrix.copy(m); group.add(g);
      });
      const pts = []; for (let k = 0; k <= 24; k++) { const t2 = k / 24; pts.push(new T.Vector2(t2 < 0.2 ? 18 - t2 * 40 : t2 < 0.55 ? 8 - (t2 - 0.2) * 14 : t2 < 0.95 ? 3 + Math.sin((t2 - 0.55) / 0.4 * Math.PI) * 22 : 2, t2 * 90)); }
      const trophy = new T.Mesh(new T.LatheGeometry(pts, 40), std('#ffd25a', { metalness: 1, roughness: 0.18, envMapIntensity: 1.6, emissive: lin('#7a5a10'), emissiveIntensity: 0.25 }));
      frameAt0: { const fi = Math.max(0, n - 260); trophy.position.set(P[fi * 3] + R[fi * 3] * 80, P[fi * 3 + 1] + 10, P[fi * 3 + 2] + R[fi * 3 + 2] * 80); }
      group.add(trophy); anims.push(t => { trophy.rotation.y = t * 0.3; });
      const flagCols = ['#ff3b30', '#ffd23a', '#2f8fff', '#3dff8a'];
      trackSpots(120).forEach((i, k) => { const f = new T.Group(); mk(cylG, frameM, 0, 6, 0, 0.18, 12, 0.18, f); const fl = mk(new T.PlaneGeometry(4, 2.4), basic(flagCols[k % 4], { side: T.DoubleSide }), 2, 10.6, 0, 1, 1, 1, f); anims.push(t => { fl.rotation.y = Math.sin(t * 4 + k) * 0.4; }); f.matrixAutoUpdate = false; place(f, i, (k % 2 ? 1 : -1) * (w / 2 + 2.4), 0); group.add(f); });
      for (let k = 0; k < 10; k++) { const p = spot(100, 400, -200, -100, 40); if (!p) continue; const b = new T.Mesh(new T.CylinderGeometry(2, 14, 700, 10, 1, true).translate(0, 350, 0), glow('#fff2c0', 0.12)); b.position.copy(p); group.add(b); const ph = rnd() * 6; anims.push(t => { b.rotation.z = Math.sin(t * 0.4 + ph) * 0.35; b.rotation.x = Math.cos(t * 0.3 + ph) * 0.25; }); }
    }

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

    const SPONSORS = ['CRAZY RACERS', 'NITRO+', 'AERO OIL', 'TURBO X', 'CLOUD 9', 'APEX', 'VELOCITY', 'JETSTREAM'];
    const bannerTex = (txt, bg, fg, w2, h2) => canvasTex(w2 || 512, h2 || 96, (c, ww, hh) => {
      c.fillStyle = bg; c.fillRect(0, 0, ww, hh);
      c.fillStyle = fg; c.fillRect(0, 0, ww, hh * 0.08); c.fillRect(0, hh * 0.92, ww, hh * 0.08);
      c.font = 'italic 900 ' + Math.round(hh * 0.62) + 'px "Saira Condensed","Arial Narrow",Impact,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = fg; c.fillText(txt, ww / 2, hh * 0.54);
    });
    const banners = SPONSORS.map((t, k) => new T.MeshBasicMaterial({ map: bannerTex(t, k % 2 ? '#101320' : th.rail, k % 2 ? th.rail : '#101320'), side: T.DoubleSide, fog: true }));
    const okSpot = i => {
      if (i < 120 || i > n - 120) return false;
      for (let d = -14; d <= 14; d += 2) { const j = i + d; if (gap[j] || U[j * 3 + 1] < 0.85 || Math.abs(F[j * 3 + 1]) > 0.35) return false; }
      for (const o of feats.obst) if (Math.abs(o.i - i) < 26) return false;
      return true;
    };
    const trussM = new T.MeshStandardMaterial({ color: lin('#2b2f3c'), roughness: 0.45, metalness: 0.75 });
    const neonM = new T.MeshBasicMaterial({ color: railCol });
    let gi = 0;
    for (let i = 260; i < n - 160; i += 300) {
      let j = -1; for (let d = 0; d < 60; d += 4) { if (okSpot(i + d)) { j = i + d; break; } if (okSpot(i - d)) { j = i - d; break; } }
      if (j < 0) continue;
      const gt = new T.Group();
      for (const sx of [-1, 1]) {
        mk(boxG, trussM, sx * (w / 2 + 1.6), 5.8, 0, 0.9, 11.6, 0.9, gt);
        mk(boxG, neonM, sx * (w / 2 + 1.6), 5.8, 0.46, 0.12, 11.6, 0.04, gt);
      }
      mk(boxG, trussM, 0, 11.2, 0, w + 4.4, 0.8, 1.1, gt);
      const bn = new T.Mesh(new T.PlaneGeometry(w + 3.6, 2.2), banners[gi++ % banners.length]); bn.position.set(0, 9.6, 0.58); gt.add(bn);
      const bn2 = bn.clone(); bn2.position.z = -0.58; gt.add(bn2);
      mk(boxG, neonM, 0, 8.4, 0.58, w + 3.6, 0.12, 0.05, gt);
      gt.matrixAutoUpdate = false; place(gt, j, 0, 0); group.add(gt);
    }
    const boardG = new T.PlaneGeometry(9, 3.6);
    for (let i = 200, side = 1; i < n - 140; i += 170, side = -side) {
      if (!okSpot(i)) continue;
      const b = new T.Group();
      mk(cylG, trussM, 0, 3.0, 0, 0.25, 6, 0.25, b);
      const face = new T.Mesh(boardG, banners[(i / 170 | 0) % banners.length]); face.position.set(0, 7.3, 0); face.rotation.y = side * 0.35; b.add(face);
      const rim = mk(boxG, neonM, 0, 5.4, 0, 9, 0.1, 0.1, b); rim.rotation.y = side * 0.35;
      b.matrixAutoUpdate = false; place(b, i, side * (w / 2 + 5.5), 0); group.add(b);
    }

    const flyers = []; world.flyers = flyers;
    const stripeTex = (a, b) => canvasTex(64, 128, (c, ww, hh) => { for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? a : b; c.fillRect(k * ww / 8, 0, ww / 8 + 1, hh); } });
    const addBalloons = (count, cols) => {
      for (let k = 0; k < count; k++) {
        const p = spot(70, 320, 20, 140, 30); if (!p) continue;
        const gb = new T.Group();
        const env2 = new T.Mesh(new T.SphereGeometry(7, 24, 16), new T.MeshStandardMaterial({ map: stripeTex(cols[k % cols.length], '#fff6e6'), roughness: 0.7 }));
        env2.scale.set(1, 1.18, 1); gb.add(env2);
        mk(new T.CylinderGeometry(2.2, 1.2, 3, 12), env2.material, 0, -8.2, 0, 1, 1, 1, gb);
        mk(boxG, new T.MeshStandardMaterial({ color: lin('#6b4a2b'), roughness: 1 }), 0, -11.5, 0, 2, 1.6, 2, gb);
        gb.position.copy(p); group.add(gb);
        flyers.push({ o: gb, base: p.clone(), ph: rnd() * 6, sp: 0.15 + rnd() * 0.2, kind: 'drift' });
      }
    };
    const addBlimps = count => {
      const skin = canvasTex(256, 64, (c, ww, hh) => { c.fillStyle = '#e9edf5'; c.fillRect(0, 0, ww, hh); c.fillStyle = th.rail; c.fillRect(0, hh * 0.62, ww, hh * 0.14); c.fillStyle = '#16192a'; c.font = 'italic 900 26px "Saira Condensed",Impact,sans-serif'; c.textAlign = 'center'; c.fillText('CRAZY RACERS', ww / 2, hh * 0.5); });
      for (let k = 0; k < count; k++) {
        const p = spot(120, 360, 40, 150, 50); if (!p) continue;
        const gb = new T.Group();
        const hull = new T.Mesh(new T.SphereGeometry(6, 28, 16), new T.MeshStandardMaterial({ map: skin, roughness: 0.5, metalness: 0.1 }));
        hull.scale.set(4, 1, 1); hull.rotation.y = Math.PI / 2; gb.add(hull);
        for (const [x, y, z, sx, sy, sz] of [[0, 4, 20, 0.3, 6, 5], [0, -4, 20, 0.3, 6, 5], [4, 0, 20, 6, 0.3, 5], [-4, 0, 20, 6, 0.3, 5]]) mk(boxG, new T.MeshStandardMaterial({ color: lin(th.rail) }), x, y, z, sx, sy, sz, gb);
        mk(boxG, new T.MeshStandardMaterial({ color: lin('#30343f') }), 0, -6.4, 0, 2.4, 1.6, 6, gb);
        gb.position.copy(p); group.add(gb);
        flyers.push({ o: gb, base: p.clone(), ph: rnd() * 6, sp: 0.03 + rnd() * 0.03, r: 60 + rnd() * 80, kind: 'orbit' });
      }
    };
    const addTraffic = (count, glow) => {
      const body = new T.MeshStandardMaterial({ color: lin('#1a1d2b'), roughness: 0.3, metalness: 0.8 });
      const lit = new T.MeshBasicMaterial({ color: lin(glow) }), tail = new T.MeshBasicMaterial({ color: lin('#ff2a3a') });
      for (let k = 0; k < count; k++) {
        const p = spot(40, 260, 10, 90, 20); if (!p) continue;
        const gb = new T.Group();
        mk(boxG, body, 0, 0, 0, 2.2, 0.8, 4.6, gb); mk(boxG, lit, 0, 0, -2.32, 1.8, 0.18, 0.05, gb); mk(boxG, tail, 0, 0, 2.32, 1.8, 0.18, 0.05, gb);
        mk(boxG, lit, 0, -0.45, 0, 1.6, 0.05, 3.6, gb);
        gb.position.copy(p); group.add(gb);
        flyers.push({ o: gb, base: p.clone(), ph: rnd() * 6, sp: 0.25 + rnd() * 0.3, r: 120 + rnd() * 200, kind: 'orbit', face: true });
      }
    };
    const addShips = count => {
      const hullM = new T.MeshStandardMaterial({ color: lin('#c9cfdc'), roughness: 0.35, metalness: 0.8, envMap: world.env });
      const jet = new T.MeshBasicMaterial({ color: lin('#7df9ff'), blending: T.AdditiveBlending, transparent: true, depthWrite: false });
      for (let k = 0; k < count; k++) {
        const p = spot(80, 420, -60, 160, 30); if (!p) continue;
        const gb = new T.Group();
        const nose = mk(new T.ConeGeometry(1.4, 7, 10), hullM, 0, 0, 0, 1, 1, 1, gb); nose.rotation.x = -Math.PI / 2;
        mk(boxG, hullM, 0, 0, 1.5, 9, 0.3, 2.4, gb);
        const fl = mk(new T.ConeGeometry(0.9, 4, 10), jet, 0, 0, 5.2, 1, 1, 1, gb); fl.rotation.x = -Math.PI / 2;
        gb.position.copy(p); group.add(gb);
        flyers.push({ o: gb, base: p.clone(), ph: rnd() * 6, sp: 0.2 + rnd() * 0.25, r: 150 + rnd() * 250, kind: 'orbit', face: true });
      }
    };
    const addMeteors = count => {
      const rock = new T.MeshStandardMaterial({ color: lin('#2a120a'), emissive: lin('#ff4a10'), emissiveIntensity: 0.9, roughness: 1, flatShading: true });
      const tailM = new T.MeshBasicMaterial({ color: lin('#ff8a30'), blending: T.AdditiveBlending, transparent: true, opacity: 0.55, depthWrite: false });
      for (let k = 0; k < count; k++) {
        const p = spot(80, 400, 120, 260, 30); if (!p) continue;
        const gb = new T.Group();
        mk(rough(new T.IcosahedronGeometry(3, 0), 0.8, 90 + k), rock, 0, 0, 0, 1, 1, 1, gb);
        const tl = mk(new T.CylinderGeometry(2.6, 0.1, 30, 8, 1, true), tailM, 0, 15, 0, 1, 1, 1, gb);
        gb.rotation.z = 0.5; group.add(gb);
        flyers.push({ o: gb, base: p.clone(), ph: rnd() * 10, sp: 1, kind: 'fall' });
      }
    };
    if (kind === 'islands') { addBalloons(12, ['#ff6a3d', '#ffb347', '#3dbbff', '#ff4b8f']); addBlimps(1); }
    else if (kind === 'islands2') { addBlimps(4); addBalloons(6, ['#ff4b3a', '#2f8fff', '#ffd23a']); }
    else if (kind === 'towers') addTraffic(26, '#7df9ff');
    else if (kind === 'storm') addBlimps(2);
    else if (kind === 'mesas') { addBalloons(8, ['#ff6a3d', '#2a74cf', '#ffd23a', '#18c46b']); addBlimps(2); }
    else if (kind === 'ice') { addBlimps(3); addBalloons(5, ['#ff3b30', '#2f8fff']); }
    else if (kind === 'space') addShips(12);
    else if (kind === 'lava') addMeteors(10);
    if (th.blimps) addBlimps(th.blimps);
    if (th.balloons) addBalloons(th.balloons, ['#ff6a3d', '#ffd23a', '#2f8fff', '#ff4b8f']);
    const updateFlyers = (time, dt) => {
      for (const f of flyers) {
        if (f.kind === 'drift') f.o.position.set(f.base.x + Math.sin(time * f.sp + f.ph) * 6, f.base.y + Math.sin(time * f.sp * 1.7 + f.ph) * 3, f.base.z + Math.cos(time * f.sp + f.ph) * 6);
        else if (f.kind === 'orbit') {
          const a = time * f.sp + f.ph, x = f.base.x + Math.cos(a) * f.r, z = f.base.z + Math.sin(a) * f.r;
          f.o.position.set(x, f.base.y + Math.sin(a * 2) * 4, z);
          f.o.rotation.y = -a + (f.face ? 0 : Math.PI / 2);
        } else if (f.kind === 'fall') {
          const t = ((time * 0.12 + f.ph) % 1);
          f.o.position.set(f.base.x - t * 160, f.base.y - t * 320, f.base.z);
          f.o.visible = t < 0.95;
        }
      }
    };

    const tmp = V3();
    world.update = function (dt, time, cam, vel) {
      sky.position.copy(cam.position);
      updateFlyers(time, dt);
      for (const a of anims) a(time, dt);
      sky.material.uniforms.time.value = time;
      padTex.offset.y = -time * 1.6;
      if (world.lavaTex) { world.lavaTex.offset.x = time * 0.004; world.lavaTex.offset.y = time * 0.006; }
      dir.position.copy(cam.position).addScaledVector(sunDir, 500); dir.target.position.copy(cam.position);
      dir.target.updateMatrixWorld();
      feats.obst.forEach(o => {
        let lat = o.lat || 0;
        if (o.type === 'bar') lat = Math.sin(time * o.freq + o.phase) * o.amp;
        if (o.type === 'gate' || o.type === 'laser') lat = 0;
        o.mesh.matrix.copy(frameMat(o.i, lat, 0));
        if (o.arm3d) o.arm3d.rotation.y = time * o.freq + o.phase;
        if (o.beams) { const on = ((time + o.phase) % o.period) / o.period < o.duty; const op = on ? 0.95 : 0.1 + 0.05 * Math.sin(time * 14); o.beams.forEach(b => { b.material.opacity = op; }); }
      });
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
