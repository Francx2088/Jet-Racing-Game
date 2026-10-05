/* Sky Racing - the 8 levels (data only). */
(function (root) {
  'use strict';
  const S = len => ({ len });
  const T = (len, yaw, bank) => ({ len, yaw, bank });
  const P = (len, pitch) => ({ len, pitch });
  const CS = (len, roll) => ({ len, roll });
  const LOOP = (R, dir) => [
    { len: Math.PI * R, pitch: 180, yaw: 32 * Math.sign(dir), local: true, noscale: true, mix: 0.5 },
    { len: Math.PI * R, pitch: 180, yaw: -32 * Math.sign(dir), local: true, noscale: true, mix: 0.5 },
    { len: 40, pitch: -5, noscale: true }];
  const LOOPL = (R, dir) => [LOOP(R, dir), { len: 60, unroll: true }];   // loop that comes out with a level road
  const climb = (deg, len) => [P(30, deg), S(len), P(30, -deg)];
  const coil = (deg, len, yaw, bank) => [P(30, deg), T(len, yaw, bank), P(30, -deg)];
  const jump = len => [P(20, 7), { len: len / 2, gap: true }, { len: 20, pitch: -14, gap: true }, { len: len / 2, gap: true }, P(20, 7)];

  const LEVELS = [
    {
      id: 1, name: 'Sunrise Drift', tag: 'Warm up above the cloud sea', twist: 'Wide, forgiving road. Learn to chase boost pads.',
      scale: 2.4, width: 18, base: 64, aiSkill: 0.97, aiRubber: 0.1, ai: 5, car: 0,
      mech: { pads: 12, obst: 8, mix: ['cones', 'block', 'cones'], gateGap: 7, draft: 14 },
      cmds: [S(160), T(120, 55, 26), S(60), T(120, -65, 26), climb(10, 120), T(150, 95, 30), S(80), T(120, -50, 26), climb(-10, 120),
        T(140, 75, 30), S(120), T(130, -85, 30), S(100), T(110, 60, 28), S(120), T(100, -40, 24), S(200)],
      theme: {
        sky: { top: '#1f3f86', mid: '#e8836b', hor: '#ffd6a1', sun: [0.55, 0.16, -0.8], sunCol: '#ffd9a8', sunPow: 900, cloud: 0.5, cloudCol: '#ffd0c0', stars: 0 },
        fog: { color: '#f0b894', near: 220, far: 2300 }, light: { hemiSky: '#ffd9b8', hemiGround: '#7a5a6a', dir: '#ffcf9a', dirI: 1.15, hemiI: 0.75 },
        road: { base: '#30323c', line: '#ffffff', edge: '#ffb347', style: 'asphalt' }, rail: '#ffb347',
        sea: { color: '#ffd5c2', y: -160, op: 0.9, count: 150, size: 420 }, scenery: 'islands', weather: null, exposure: 0.95
      }
    },
    {
      id: 2, name: 'Cloud Canyon', tag: 'Leap the sky gaps', twist: 'Long jumps! Keep your line - the road disappears.',
      scale: 3, width: 17, base: 70, aiSkill: 0.98, aiRubber: 0.1, ai: 5, car: 2,
      mech: { pads: 12, obst: 10, mix: ['cones', 'gate', 'block', 'bar'], gateGap: 6.4, draft: 14 },
      cmds: [S(100), T(100, -70, 30), S(40), jump(34), T(100, 80, 30), climb(12, 80), T(120, -100, 32), S(50), jump(40), T(110, 60, 28),
        S(30), T(100, -60, 28), climb(-12, 80), T(130, 110, 32), S(60), jump(36), T(100, -50, 28), S(60), T(90, 40, 24), S(150)],
      theme: {
        sky: { top: '#1767cf', mid: '#62aef0', hor: '#e3f2ff', sun: [-0.3, 0.7, -0.65], sunCol: '#fff4d6', sunPow: 1200, cloud: 0.62, cloudCol: '#ffffff', stars: 0 },
        fog: { color: '#cfe6fb', near: 260, far: 2600 }, light: { hemiSky: '#bfe0ff', hemiGround: '#6f8aa6', dir: '#fff2d2', dirI: 1.3, hemiI: 0.85 },
        road: { base: '#383d48', line: '#ffffff', edge: '#37d1ff', style: 'asphalt' }, rail: '#37d1ff',
        sea: { color: '#ffffff', y: -170, op: 0.95, count: 190, size: 460 }, scenery: 'islands2', weather: null, exposure: 0.95
      }
    },
    {
      id: 3, name: 'Neon Skyline', tag: 'Rooftop S-bends after dark', twist: 'Tight chicanes and a corkscrew. Chain the boost pads.',
      scale: 3.3, width: 15, base: 77, aiSkill: 0.98, aiRubber: 0.1, ai: 5, car: 1,
      mech: { pads: 14, obst: 12, mix: ['gate', 'laser', 'block', 'cones'], gateGap: 5.4, draft: 14 },
      cmds: [S(120), T(90, 90, 34), T(90, -90, 34), S(40), T(90, 90, 34), T(90, -90, 34), climb(14, 80), CS(90, 360), S(40),
        T(120, -110, 34), S(60), T(80, 60, 30), T(80, -60, 30), climb(-14, 80), T(120, 100, 34), S(100), T(100, -90, 32), S(160)],
      theme: {
        sky: { top: '#04061a', mid: '#161a45', hor: '#7a3a8f', sun: [-0.5, 0.45, -0.7], sunCol: '#cfd8ff', sunPow: 2400, cloud: 0.25, cloudCol: '#3b2a6b', stars: 0.9 },
        fog: { color: '#2a1d55', near: 160, far: 1900 }, light: { hemiSky: '#6b6bff', hemiGround: '#2a1038', dir: '#a8b5ff', dirI: 0.7, hemiI: 0.8 },
        road: { base: '#14151d', line: '#ff2fd0', edge: '#00e5ff', style: 'neon' }, rail: '#ff2fd0',
        sea: { color: '#3a2a78', y: -250, op: 0.8, count: 120, size: 420 }, scenery: 'towers', weather: null, exposure: 1.1
      }
    },
    {
      id: 4, name: 'Storm Coil', tag: 'Crosswinds and lightning', twist: 'Gusts shove you sideways. Fight them through coils and a loop.',
      scale: 3.2, width: 15, base: 81, aiSkill: 0.99, aiRubber: 0.1, ai: 5, car: 3,
      mech: { pads: 12, obst: 12, mix: ['bar', 'spinner', 'cones', 'block'], gateGap: 5.4, draft: 14, gust: 12 },
      cmds: [S(100), coil(10, 260, 360, 38), S(60), LOOP(48, 50), S(80), T(120, -80, 32), T(120, 90, 32), coil(-10, 240, -270, 38),
        S(80), T(100, 50, 28), T(100, -90, 30), S(120), T(100, 60, 28), S(140)],
      theme: {
        sky: { top: '#141a28', mid: '#2f3b52', hor: '#6e7d92', sun: [0.2, 0.3, -0.9], sunCol: '#aab8cc', sunPow: 400, cloud: 0.95, cloudCol: '#4c5a70', stars: 0 },
        fog: { color: '#46546a', near: 140, far: 1500 }, light: { hemiSky: '#8fa3c0', hemiGround: '#2a3342', dir: '#b8c6dc', dirI: 0.9, hemiI: 0.85 },
        road: { base: '#262a33', line: '#dfe9ff', edge: '#8ac4ff', style: 'wet' }, rail: '#8ac4ff',
        sea: { color: '#2d3748', y: -190, op: 0.95, count: 170, size: 460 }, scenery: 'storm', weather: { type: 'rain', count: 520, color: '#b9cbe6' }, exposure: 1.0, lightning: true
      }
    },
    {
      id: 5, name: 'Desert Mirage', tag: 'Hairpins & slipstreams', twist: 'Hairpins and long jumps. Tuck in behind rivals for a slipstream tow.',
      scale: 3.5, width: 17, base: 86, aiSkill: 0.99, aiRubber: 0.1, ai: 5, car: 4,
      mech: { pads: 10, obst: 12, mix: ['gate', 'block', 'bar', 'cones'], gateGap: 5.6, draft: 28 },
      cmds: [S(100), T(100, 60, 30), jump(36), T(90, -170, 40), S(60), climb(14, 90), T(90, 170, 40), S(60), jump(44), T(100, -70, 30),
        climb(-14, 90), T(90, 120, 36), S(50), jump(40), T(110, -150, 38), S(80), T(80, 60, 30), S(160)],
      theme: {
        sky: { top: '#2a74cf', mid: '#f2a974', hor: '#ffe3b2', sun: [-0.4, 0.28, -0.85], sunCol: '#fff0c0', sunPow: 700, cloud: 0.2, cloudCol: '#ffe6cc', stars: 0 },
        fog: { color: '#f1c595', near: 240, far: 2500 }, light: { hemiSky: '#ffe2b8', hemiGround: '#a8754a', dir: '#ffe0a8', dirI: 1.35, hemiI: 0.8 },
        road: { base: '#4a3d34', line: '#ffe6bf', edge: '#ff7a2f', style: 'sand' }, rail: '#ff7a2f',
        sea: null, scenery: 'mesas', weather: { type: 'dust', count: 220, color: '#ffe0b0' }, exposure: 0.95, ground: '#d9a86a'
      }
    },
    {
      id: 6, name: 'Frozen Peaks', tag: 'The road is ice', twist: 'Your car SLIDES. Plan turns early and ride the downhills.',
      scale: 3.2, width: 16, base: 84, aiSkill: 1.01, aiRubber: 0.11, ai: 5, car: 5,
      mech: { pads: 12, obst: 12, mix: ['block', 'cones', 'gate', 'spinner'], gateGap: 5.6, draft: 16, ice: 1 },
      cmds: [S(100), climb(16, 120), T(110, 70, 26), T(110, -70, 26), climb(-20, 160), T(120, 100, 30), S(60), climb(14, 100), CS(100, -360),
        T(100, -90, 30), climb(-18, 140), T(100, 80, 30), T(100, -80, 30), S(60), T(90, 50, 26), S(160)],
      theme: {
        sky: { top: '#3578c2', mid: '#a8d3f0', hor: '#f0f9ff', sun: [0.5, 0.45, -0.75], sunCol: '#ffffff', sunPow: 1500, cloud: 0.4, cloudCol: '#ffffff', stars: 0 },
        fog: { color: '#dcecf7', near: 200, far: 2200 }, light: { hemiSky: '#dff2ff', hemiGround: '#8aa5bd', dir: '#ffffff', dirI: 1.3, hemiI: 0.95 },
        road: { base: '#4a6178', line: '#ffffff', edge: '#8ff3ff', style: 'ice' }, rail: '#8ff3ff',
        sea: { color: '#f2f8ff', y: -200, op: 0.9, count: 150, size: 440 }, scenery: 'ice', weather: { type: 'snow', count: 420, color: '#ffffff' }, exposure: 1.0
      }
    },
    {
      id: 7, name: 'Orbit Ring', tag: 'Zero-G stunt track', twist: 'Loops, corkscrews and super pads that pack extra nitro.',
      scale: 3.6, width: 14, base: 92, aiSkill: 1.01, aiRubber: 0.12, ai: 5, car: 6,
      mech: { pads: 12, obst: 14, mix: ['laser', 'spinner', 'gate', 'bar'], gateGap: 5.0, draft: 16, padMult: 1.6 },
      cmds: [S(100), LOOP(55, 50), S(60), T(100, 80, 32), LOOP(50, -50), S(60), CS(110, 360), T(100, -100, 34), climb(12, 100), T(100, 140, 36),
        climb(-12, 100), LOOP(60, 50), S(100), T(100, -60, 30), S(100)],
      theme: {
        sky: { top: '#000004', mid: '#0a1030', hor: '#26124a', sun: [0.6, 0.35, -0.7], sunCol: '#ffe6c0', sunPow: 3000, cloud: 0.0, cloudCol: '#000000', stars: 1.0, neb: '#6b2fd0' },
        fog: { color: '#05081a', near: 400, far: 3600 }, light: { hemiSky: '#5a6bff', hemiGround: '#120a2a', dir: '#fff0d8', dirI: 1.5, hemiI: 0.55 },
        road: { base: '#1b1e2c', line: '#7df9ff', edge: '#b36bff', style: 'metal' }, rail: '#7df9ff',
        sea: null, scenery: 'space', weather: null, exposure: 1.1
      }
    },
    {
      id: 8, name: 'Inferno Core', tag: 'Over the lava sea', twist: 'Narrow, fast, and full of hazards. Weave or crash.',
      scale: 3.6, width: 13, base: 98, aiSkill: 1.01, aiRubber: 0.12, ai: 5, car: 7,
      mech: { pads: 12, obst: 22, mix: ['bar', 'spinner', 'laser', 'gate', 'block'], gateGap: 4.6, draft: 16 },
      cmds: [S(100), T(100, 60, 30), S(40), T(100, -90, 34), jump(36), T(90, 120, 36), climb(12, 80), LOOP(50, 50), S(50), T(100, -100, 34),
        T(100, 100, 34), CS(100, 360), T(100, -150, 38), S(60), jump(40), T(100, 90, 34), climb(-12, 80), T(100, -70, 30), S(150)],
      theme: {
        sky: { top: '#140300', mid: '#5a1405', hor: '#ff6a1f', sun: [0.0, 0.2, -1.0], sunCol: '#ff9a50', sunPow: 300, cloud: 0.8, cloudCol: '#4a1a0e', stars: 0 },
        fog: { color: '#5a1a0a', near: 160, far: 1700 }, light: { hemiSky: '#ff8a50', hemiGround: '#3a0e04', dir: '#ff9d60', dirI: 1.2, hemiI: 0.8 },
        road: { base: '#1a1412', line: '#ffb347', edge: '#ff3d1f', style: 'basalt' }, rail: '#ff3d1f',
        sea: { color: '#2a0d06', y: -210, op: 0.9, count: 140, size: 440 }, scenery: 'lava', weather: { type: 'embers', count: 260, color: '#ff9a40' }, exposure: 1.1
      }
    },
    {
      id: 9, name: 'Aurora Run', tag: 'Night race under the northern lights', twist: 'Long jumps, a corkscrew and a spiral drop. Crosswinds push you around.',
      scale: 3.3, width: 16, base: 96, aiSkill: 1.0, aiRubber: 0.11, ai: 5, car: 8,
      mech: { pads: 13, obst: 14, mix: ['gate', 'cones', 'spinner', 'block', 'laser'], gateGap: 5.2, draft: 16, gust: 9 },
      cmds: [S(100), T(110, 60, 30), jump(40), T(100, -100, 34), S(50), climb(12, 90), CS(100, -360), T(110, 120, 36), jump(44), T(100, -70, 30),
        coil(-10, 240, -300, 38), S(60), T(100, 90, 32), jump(36), T(90, -60, 28), S(150)],
      theme: {
        sky: { top: '#020617', mid: '#0b1f3a', hor: '#1d4a5c', sun: [0.3, 0.25, -0.9], sunCol: '#cfe8ff', sunPow: 2600, cloud: 0.15, cloudCol: '#203a50', stars: 1.0, neb: '#2dffa0' },
        fog: { color: '#0c2233', near: 240, far: 2400 }, light: { hemiSky: '#7fd8ff', hemiGround: '#0a1a28', dir: '#bfe6ff', dirI: 0.95, hemiI: 0.8 },
        road: { base: '#2a3644', line: '#e8faff', edge: '#3dffb0', style: 'ice' }, rail: '#3dffb0',
        sea: { color: '#1a3a52', y: -200, op: 0.85, count: 150, size: 440 }, scenery: 'ice', weather: { type: 'snow', count: 380, color: '#e8f6ff' }, exposure: 1.1, blimps: 2
      }
    },
    {
      id: 10, name: 'Sky Citadel GP', tag: 'The grand finale at sunset', twist: 'Two loops, a corkscrew, a coil, jumps and every hazard. Win it all!',
      scale: 3.4, width: 14, base: 100, aiSkill: 1.01, aiRubber: 0.12, ai: 5, car: 9,
      mech: { pads: 20, obst: 28, mix: ['gate', 'bar', 'laser', 'spinner', 'block', 'cones'], gateGap: 4.8, draft: 16, padMult: 1.3 },
      cmds: [S(140), T(100, -70, 30), S(80), LOOPL(52, 1), S(90), T(100, 110, 34), S(70), jump(40), T(90, -120, 36), S(80), climb(14, 90), CS(90, 360), S(60), T(100, 90, 34),
        S(70), coil(10, 240, 360, 38), S(90), LOOPL(56, -1), S(90), T(100, -100, 34), S(60), jump(44), T(90, 80, 32), S(160)],
      theme: {
        sky: { top: '#2a1a5e', mid: '#ff7a59', hor: '#ffd08a', sun: [-0.6, 0.12, -0.8], sunCol: '#ffcf8a', sunPow: 700, cloud: 0.55, cloudCol: '#ffb09a', stars: 0 },
        fog: { color: '#f59a78', near: 220, far: 2400 }, light: { hemiSky: '#ffc9a8', hemiGround: '#5a3a6a', dir: '#ffc08a', dirI: 1.2, hemiI: 0.8 },
        road: { base: '#23202e', line: '#ffe6bf', edge: '#ffd23a', style: 'asphalt' }, rail: '#ffd23a',
        sea: { color: '#ffc3b0', y: -220, op: 0.9, count: 160, size: 440 }, scenery: 'towers', weather: null, exposure: 0.95, blimps: 3, balloons: 6
      }
    }
  ];

  // Race cars. u runs -1 (nose) .. +1 (tail); cab = [windshield base, roof front, roof rear, rear glass base].
  const CARS = [
    { name: 'Falcon GT3', type: 'GT3', len: 4.6, wid: 2.04, wr: 0.36, noseH: 0.6, hoodH: 0.78, beltH: 0.9, deckH: 0.96, tailH: 0.84, cab: [-0.3, -0.06, 0.28, 0.56], roofH: 1.22, cabW: 0.92,
      fender: 0.05, flare: 0.08, wing: 'gt', canards: true, livery: 'stripes', num: 7, color: '#ff6a12', accent: '#ffffff', trim: '#14151a' },
    { name: 'Viper LMP', type: 'Le Mans prototype', len: 4.8, wid: 2.0, wr: 0.37, noseH: 0.44, hoodH: 0.6, beltH: 0.72, deckH: 0.9, tailH: 0.86, cab: [-0.26, -0.08, 0.14, 0.4], roofH: 1.06, cabW: 0.6,
      fender: 0.12, flare: 0.06, wing: 'proto', fin: true, canards: true, livery: 'arrow', num: 3, color: '#ff2f8f', accent: '#15151c', trim: '#ffffff' },
    { name: 'Bolt WRC', type: 'Rally', len: 4.1, wid: 1.96, wr: 0.35, noseH: 0.66, hoodH: 0.86, beltH: 0.96, deckH: 1.0, tailH: 0.98, cab: [-0.24, 0.02, 0.66, 0.9], roofH: 1.44, cabW: 0.94, uF: -0.66, uR: 0.68,
      fender: 0.04, flare: 0.1, wing: 'rally', livery: 'band', num: 11, color: '#1f8fff', accent: '#ffe23a', trim: '#ffffff' },
    { name: 'Titan V8', type: 'Stock car', len: 5.0, wid: 2.0, wr: 0.38, noseH: 0.64, hoodH: 0.86, beltH: 0.96, deckH: 1.0, tailH: 0.98, cab: [-0.16, 0.06, 0.32, 0.56], roofH: 1.32, cabW: 0.92,
      fender: 0.03, flare: 0.04, wing: 'duck', livery: 'split', num: 48, color: '#f2c200', accent: '#101015', trim: '#ff3b30' },
    { name: 'Phantom DTM', type: 'Touring', len: 4.85, wid: 2.0, wr: 0.37, noseH: 0.6, hoodH: 0.82, beltH: 0.92, deckH: 0.98, tailH: 0.92, cab: [-0.26, -0.04, 0.32, 0.5], roofH: 1.3, cabW: 0.92,
      fender: 0.05, flare: 0.1, wing: 'gt', canards: true, livery: 'arrow', num: 22, color: '#262a36', accent: '#ffb347', trim: '#ffffff' },
    { name: 'Nova Hyper', type: 'Hypercar', len: 4.7, wid: 2.04, wr: 0.37, noseH: 0.5, hoodH: 0.68, beltH: 0.8, deckH: 0.9, tailH: 0.86, cab: [-0.34, -0.12, 0.18, 0.62], roofH: 1.12, cabW: 0.84,
      fender: 0.09, flare: 0.07, wing: 'swan', scoop: true, canards: true, livery: 'stripes', num: 1, color: '#eef7ff', accent: '#00c2ff', trim: '#15151c' },
    { name: 'Orbit LMH', type: 'Hypercar prototype', len: 4.75, wid: 2.0, wr: 0.37, noseH: 0.46, hoodH: 0.62, beltH: 0.74, deckH: 0.92, tailH: 0.88, cab: [-0.24, -0.06, 0.16, 0.42], roofH: 1.08, cabW: 0.62,
      fender: 0.12, flare: 0.06, wing: 'proto', fin: true, canards: true, livery: 'band', num: 9, color: '#8f5bff', accent: '#7df9ff', trim: '#101015' },
    { name: 'Inferno GT1', type: 'GT1', len: 4.7, wid: 2.06, wr: 0.38, noseH: 0.52, hoodH: 0.72, beltH: 0.86, deckH: 0.92, tailH: 0.86, cab: [-0.28, -0.08, 0.22, 0.5], roofH: 1.17, cabW: 0.88,
      fender: 0.1, flare: 0.1, wing: 'swan', scoop: true, canards: true, livery: 'split', num: 5, color: '#e3140e', accent: '#ffc247', trim: '#101015' },
    { name: 'Aurora RS', type: 'GT3', len: 4.65, wid: 2.04, wr: 0.36, noseH: 0.56, hoodH: 0.74, beltH: 0.88, deckH: 0.95, tailH: 0.86, cab: [-0.3, -0.07, 0.26, 0.56], roofH: 1.2, cabW: 0.9,
      fender: 0.07, flare: 0.09, wing: 'swan', canards: true, livery: 'band', num: 99, color: '#0fd6b0', accent: '#0a1426', trim: '#ffffff' },
    { name: 'Apex Prime', type: 'Hypercar prototype', len: 4.85, wid: 2.04, wr: 0.37, noseH: 0.44, hoodH: 0.6, beltH: 0.72, deckH: 0.9, tailH: 0.88, cab: [-0.25, -0.07, 0.15, 0.42], roofH: 1.06, cabW: 0.6,
      fender: 0.13, flare: 0.07, wing: 'proto', fin: true, canards: true, livery: 'stripes', num: 10, color: '#d9a21e', accent: '#101015', trim: '#ffffff' }
  ];
  // ---------------- Tracks 11 - 20 ----------------
  const car = (base, o) => Object.assign({}, CARS[base], o);
  CARS.push(
    car(0, { name: 'Lagoon GT3', num: 11, color: '#13c6c6', accent: '#ffe23a', trim: '#0b1a2a', livery: 'arrow' }),
    car(1, { name: 'Midnight LMP', num: 12, color: '#1b2a6b', accent: '#7df9ff', trim: '#ffffff', livery: 'stripes' }),
    car(2, { name: 'Dune WRC', num: 13, color: '#e0a050', accent: '#2a1a10', trim: '#ffffff', livery: 'split' }),
    car(3, { name: 'Glacier V8', num: 14, color: '#dff3ff', accent: '#1f6bff', trim: '#101015', livery: 'stripes' }),
    car(5, { name: 'Nebula Hyper', num: 15, color: '#ff4fd8', accent: '#2a0a40', trim: '#ffffff', livery: 'band' }),
    car(7, { name: 'Magma GT1', num: 16, color: '#ff5a1a', accent: '#121216', trim: '#ffc247', livery: 'arrow' }),
    car(4, { name: 'Storm DTM', num: 17, color: '#4a5568', accent: '#ffd23a', trim: '#ffffff', livery: 'band' }),
    car(8, { name: 'Sakura GT3', num: 18, color: '#ffb3d1', accent: '#ffffff', trim: '#c2185b', livery: 'stripes' }),
    car(6, { name: 'Grid LMH', num: 19, color: '#18ff9a', accent: '#101015', trim: '#ff2fd0', livery: 'split' }),
    car(9, { name: 'Champion Prime', num: 20, color: '#f5d76e', accent: '#7a1010', trim: '#ffffff', livery: 'arrow' })
  );
  LEVELS.push(
    {
      id: 11, name: 'Coral Lagoon', tag: 'Tropical islands over a turquoise sea', twist: 'Fast sweepers and two jumps between palm islands.',
      scale: 4.1, width: 17, base: 96, aiSkill: 1.0, aiRubber: 0.11, ai: 5, car: 10,
      mech: { pads: 12, obst: 10, mix: ['cones', 'block', 'gate', 'bar'], gateGap: 6.0, draft: 16 },
      cmds: [S(140), T(120, 70, 30), S(60), jump(40), T(110, -90, 32), S(60), climb(10, 90), T(120, 110, 34), S(70), T(100, -60, 28), jump(44),
        T(110, 80, 30), S(80), T(100, -100, 32), S(60), T(90, 50, 26), S(160)],
      theme: {
        sky: { top: '#1a8fe0', mid: '#7fd6f5', hor: '#e8fbff', sun: [0.4, 0.6, -0.7], sunCol: '#fff6d8', sunPow: 1100, cloud: 0.45, cloudCol: '#ffffff', stars: 0 },
        fog: { color: '#c6eef8', near: 260, far: 2600 }, light: { hemiSky: '#c8f0ff', hemiGround: '#3f8a8a', dir: '#fff4d8', dirI: 1.3, hemiI: 0.9 },
        road: { base: '#3a3f48', line: '#ffffff', edge: '#20e3c2', style: 'asphalt' }, rail: '#20e3c2',
        sea: { color: '#29c4c8', y: -170, op: 0.9, count: 170, size: 460 }, scenery: 'islands2', weather: null, exposure: 0.95, balloons: 6
      }
    },
    {
      id: 12, name: 'Midnight Express', tag: 'Blue neon city at midnight', twist: 'Laser gates and long boulevards. Time your line.',
      scale: 4.3, width: 15, base: 98, aiSkill: 1.0, aiRubber: 0.11, ai: 5, car: 11,
      mech: { pads: 13, obst: 14, mix: ['laser', 'gate', 'block', 'laser', 'bar'], gateGap: 5.2, draft: 16 },
      cmds: [S(140), T(90, 90, 34), S(50), T(90, -90, 34), S(80), climb(12, 90), T(110, -110, 34), CS(90, -360), S(60), T(100, 120, 34),
        S(70), T(80, -60, 30), T(80, 60, 30), climb(-12, 90), T(110, -90, 32), S(160)],
      theme: {
        sky: { top: '#020414', mid: '#0a1640', hor: '#1f4fa8', sun: [0.4, 0.4, -0.8], sunCol: '#cfe0ff', sunPow: 2600, cloud: 0.2, cloudCol: '#1a2a5a', stars: 0.9 },
        fog: { color: '#0e1d4a', near: 170, far: 1900 }, light: { hemiSky: '#5a8bff', hemiGround: '#0a0f2a', dir: '#a8c4ff', dirI: 0.75, hemiI: 0.85 },
        road: { base: '#12141d', line: '#7df9ff', edge: '#2f8fff', style: 'neon' }, rail: '#2f8fff',
        sea: { color: '#13245a', y: -250, op: 0.8, count: 120, size: 420 }, scenery: 'towers', weather: null, exposure: 1.1
      }
    },
    {
      id: 13, name: 'Sandstorm Pass', tag: 'Canyon run in a dust storm', twist: 'Strong side winds and hairpins between the mesas.',
      scale: 4.2, width: 17, base: 100, aiSkill: 1.01, aiRubber: 0.11, ai: 5, car: 12,
      mech: { pads: 12, obst: 12, mix: ['block', 'gate', 'cones', 'bar'], gateGap: 5.6, draft: 18, gust: 13 },
      cmds: [S(120), T(100, -60, 30), jump(36), T(90, 165, 40), S(60), climb(12, 90), T(90, -165, 40), S(60), jump(40), T(100, 80, 30),
        climb(-12, 90), T(90, -120, 36), S(70), T(100, 140, 38), S(160)],
      theme: {
        sky: { top: '#8a5a3a', mid: '#d99a5c', hor: '#f3cf9a', sun: [-0.3, 0.35, -0.85], sunCol: '#ffe2a8', sunPow: 300, cloud: 0.75, cloudCol: '#c98a50', stars: 0 },
        fog: { color: '#d8a46c', near: 150, far: 1600 }, light: { hemiSky: '#ffd8a8', hemiGround: '#8a5a30', dir: '#ffd8a0', dirI: 1.2, hemiI: 0.85 },
        road: { base: '#4a3d34', line: '#ffe6bf', edge: '#ff9a2f', style: 'sand' }, rail: '#ff9a2f',
        sea: null, scenery: 'mesas', weather: { type: 'dust', count: 420, color: '#ffd8a0' }, exposure: 0.95, ground: '#c9965a'
      }
    },
    {
      id: 14, name: 'Glacier Spiral', tag: 'Ice road up a frozen spiral', twist: 'The road is ice again, now with a spiral climb and a corkscrew.',
      scale: 4.2, width: 16, base: 98, aiSkill: 1.01, aiRubber: 0.11, ai: 5, car: 13,
      mech: { pads: 12, obst: 12, mix: ['cones', 'block', 'spinner', 'gate'], gateGap: 5.8, draft: 16, ice: 1 },
      cmds: [S(120), T(110, 70, 28), S(60), coil(10, 260, 340, 36), S(70), T(110, -90, 30), CS(100, 360), S(60), climb(-14, 120),
        T(110, 100, 30), S(60), T(100, -70, 28), S(160)],
      theme: {
        sky: { top: '#2a6fb8', mid: '#9fd0f0', hor: '#f2fbff', sun: [-0.5, 0.4, -0.75], sunCol: '#ffffff', sunPow: 1500, cloud: 0.35, cloudCol: '#ffffff', stars: 0 },
        fog: { color: '#d8ecf8', near: 220, far: 2300 }, light: { hemiSky: '#e2f4ff', hemiGround: '#8aa5bd', dir: '#ffffff', dirI: 1.25, hemiI: 0.95 },
        road: { base: '#4a6178', line: '#ffffff', edge: '#7fe6ff', style: 'ice' }, rail: '#7fe6ff',
        sea: { color: '#f2f8ff', y: -200, op: 0.9, count: 150, size: 440 }, scenery: 'ice', weather: { type: 'snow', count: 380, color: '#ffffff' }, exposure: 1.0, blimps: 2
      }
    },
    {
      id: 15, name: 'Nebula Drift', tag: 'Through a pink nebula', twist: 'Two loops and super pads in deep space.',
      scale: 4.5, width: 14, base: 102, aiSkill: 1.01, aiRubber: 0.12, ai: 5, car: 14,
      mech: { pads: 14, obst: 12, mix: ['laser', 'spinner', 'gate', 'bar'], gateGap: 5.0, draft: 16, padMult: 1.4 },
      cmds: [S(140), T(100, 80, 32), S(80), LOOPL(54, 1), S(90), T(100, -110, 34), S(60), CS(100, -360), S(60), T(100, 120, 34),
        S(80), LOOPL(58, -1), S(90), T(100, -80, 30), S(160)],
      theme: {
        sky: { top: '#05010f', mid: '#1a0a3a', hor: '#4a1460', sun: [-0.5, 0.3, -0.8], sunCol: '#ffd8f0', sunPow: 2800, cloud: 0.0, cloudCol: '#000000', stars: 1.0, neb: '#ff3fb4' },
        fog: { color: '#12051f', near: 400, far: 3600 }, light: { hemiSky: '#c05aff', hemiGround: '#14062a', dir: '#ffe0f4', dirI: 1.4, hemiI: 0.6 },
        road: { base: '#1d1a2c', line: '#ff8ae0', edge: '#ff3fb4', style: 'metal' }, rail: '#ff8ae0',
        sea: null, scenery: 'space', weather: null, exposure: 1.1
      }
    },
    {
      id: 16, name: 'Volcano Rim', tag: 'Around an erupting crater', twist: 'Jumps over lava, falling fireballs and tight hazards.',
      scale: 4.5, width: 13, base: 102, aiSkill: 1.02, aiRubber: 0.12, ai: 5, car: 15,
      mech: { pads: 13, obst: 18, mix: ['block', 'bar', 'spinner', 'gate', 'laser'], gateGap: 4.8, draft: 16 },
      cmds: [S(120), T(100, -70, 30), jump(38), T(90, 120, 36), S(60), climb(12, 80), T(100, -100, 34), jump(42), T(100, 90, 34),
        S(60), climb(-12, 80), T(90, -130, 36), S(60), jump(36), T(100, 70, 30), S(160)],
      theme: {
        sky: { top: '#1a0500', mid: '#6a1a05', hor: '#ff7a2a', sun: [0.4, 0.15, -0.9], sunCol: '#ffaa60', sunPow: 300, cloud: 0.85, cloudCol: '#3a120a', stars: 0 },
        fog: { color: '#601e0a', near: 160, far: 1700 }, light: { hemiSky: '#ff9a60', hemiGround: '#3a0e04', dir: '#ffa870', dirI: 1.2, hemiI: 0.8 },
        road: { base: '#1a1412', line: '#ffc247', edge: '#ff5a1f', style: 'basalt' }, rail: '#ff5a1f',
        sea: { color: '#2a0d06', y: -210, op: 0.9, count: 140, size: 440 }, scenery: 'lava', weather: { type: 'embers', count: 320, color: '#ffaa50' }, exposure: 1.1
      }
    },
    {
      id: 17, name: 'Thunder Valley', tag: 'Racing inside the storm', twist: 'Heavy rain, lightning, crosswinds and a loop.',
      scale: 4.3, width: 15, base: 102, aiSkill: 1.02, aiRubber: 0.12, ai: 5, car: 16,
      mech: { pads: 13, obst: 14, mix: ['bar', 'spinner', 'cones', 'block', 'gate'], gateGap: 5.2, draft: 16, gust: 14 },
      cmds: [S(130), T(110, 80, 32), S(70), LOOPL(50, 1), S(80), T(110, -100, 32), coil(10, 240, 300, 36), S(60), T(100, -80, 30),
        climb(-10, 90), T(110, 110, 32), S(60), T(90, -60, 28), S(160)],
      theme: {
        sky: { top: '#0e1320', mid: '#26324a', hor: '#5a6a82', sun: [0.2, 0.3, -0.9], sunCol: '#9fb0c8', sunPow: 400, cloud: 0.98, cloudCol: '#3a4658', stars: 0 },
        fog: { color: '#3a4860', near: 130, far: 1400 }, light: { hemiSky: '#8fa3c0', hemiGround: '#20283a', dir: '#b8c6dc', dirI: 0.85, hemiI: 0.85 },
        road: { base: '#22262f', line: '#dfe9ff', edge: '#a8c8ff', style: 'wet' }, rail: '#a8c8ff',
        sea: { color: '#28303f', y: -190, op: 0.95, count: 170, size: 460 }, scenery: 'storm', weather: { type: 'rain', count: 640, color: '#b9cbe6' }, exposure: 1.0
      }
    },
    {
      id: 18, name: 'Blossom Peaks', tag: 'Spring dawn over blossom islands', twist: 'Falling petals, balloons and a corkscrew over the clouds.',
      scale: 4.3, width: 16, base: 100, aiSkill: 1.02, aiRubber: 0.12, ai: 5, car: 17,
      mech: { pads: 13, obst: 14, mix: ['cones', 'gate', 'spinner', 'block'], gateGap: 5.4, draft: 16 },
      cmds: [S(130), T(110, -70, 30), S(60), climb(12, 90), CS(100, 360), T(110, 100, 32), jump(40), T(100, -90, 30), S(70),
        T(100, 120, 34), climb(-12, 90), T(110, -80, 30), S(70), T(90, 60, 26), S(160)],
      theme: {
        sky: { top: '#5a7fd0', mid: '#f3b4c8', hor: '#ffe8ef', sun: [0.5, 0.2, -0.8], sunCol: '#fff0f4', sunPow: 900, cloud: 0.5, cloudCol: '#ffe0ea', stars: 0 },
        fog: { color: '#f6cdd9', near: 240, far: 2400 }, light: { hemiSky: '#ffe0ea', hemiGround: '#8a6a7a', dir: '#fff0f0', dirI: 1.2, hemiI: 0.9 },
        road: { base: '#34323c', line: '#ffffff', edge: '#ff7fb0', style: 'asphalt' }, rail: '#ff7fb0',
        sea: { color: '#ffe6ee', y: -170, op: 0.9, count: 160, size: 440 }, scenery: 'islands', weather: { type: 'snow', count: 300, color: '#ffb8d0' }, exposure: 0.95, balloons: 8
      }
    },
    {
      id: 19, name: 'Cyber Grid', tag: 'Green neon data highway', twist: 'Spinners, sliding bars and lasers on a narrow grid.',
      scale: 4.5, width: 13, base: 104, aiSkill: 1.03, aiRubber: 0.12, ai: 5, car: 18,
      mech: { pads: 14, obst: 20, mix: ['spinner', 'bar', 'laser', 'gate', 'block'], gateGap: 4.8, draft: 16 },
      cmds: [S(130), T(90, 90, 34), T(90, -90, 34), S(60), climb(12, 80), CS(90, 360), S(60), T(100, -110, 34), S(60), T(80, 70, 30),
        T(80, -70, 30), LOOPL(50, 1), S(80), T(100, 100, 34), S(60), T(90, -60, 28), S(160)],
      theme: {
        sky: { top: '#010806', mid: '#052a1a', hor: '#0f6a3a', sun: [-0.4, 0.4, -0.8], sunCol: '#c8ffe0', sunPow: 2600, cloud: 0.15, cloudCol: '#0a3a22', stars: 0.8 },
        fog: { color: '#062a1a', near: 170, far: 1900 }, light: { hemiSky: '#3dffa0', hemiGround: '#02140a', dir: '#a8ffd0', dirI: 0.8, hemiI: 0.8 },
        road: { base: '#0c1410', line: '#3dffa0', edge: '#ff2fd0', style: 'neon' }, rail: '#3dffa0',
        sea: { color: '#0a3a22', y: -250, op: 0.8, count: 120, size: 420 }, scenery: 'towers', weather: null, exposure: 1.1
      }
    },
    {
      id: 20, name: 'Champions Finale', tag: 'The ultimate race in golden light', twist: 'Every trick in one race: loops, coils, jumps and all hazards. Become the champion!',
      scale: 3.4, width: 14, base: 106, aiSkill: 1.03, aiRubber: 0.12, ai: 5, car: 19,
      mech: { pads: 20, obst: 26, mix: ['gate', 'bar', 'laser', 'spinner', 'block', 'cones'], gateGap: 4.8, draft: 16, padMult: 1.3 },
      cmds: [S(140), T(100, 70, 30), S(80), LOOPL(52, -1), S(90), T(100, -110, 34), S(70), jump(40), T(90, 120, 36), S(80), climb(14, 90), CS(90, -360),
        S(60), T(100, -90, 34), S(70), coil(-10, 240, -360, 38), S(90), LOOPL(56, 1), S(90), T(100, 100, 34), S(60), jump(44), T(90, -80, 32), S(160)],
      theme: {
        sky: { top: '#3a5ab8', mid: '#ffc46a', hor: '#fff0c8', sun: [0.5, 0.15, -0.8], sunCol: '#ffe2a0', sunPow: 700, cloud: 0.5, cloudCol: '#ffe6b8', stars: 0 },
        fog: { color: '#f8d898', near: 230, far: 2500 }, light: { hemiSky: '#ffe4b0', hemiGround: '#7a5a3a', dir: '#ffd890', dirI: 1.25, hemiI: 0.85 },
        road: { base: '#26232c', line: '#ffffff', edge: '#ffc23a', style: 'asphalt' }, rail: '#ffc23a',
        sea: { color: '#fff0d0', y: -200, op: 0.9, count: 170, size: 460 }, scenery: 'islands', weather: null, exposure: 0.95, blimps: 3, balloons: 8
      }
    }
  );

  const AI_COLORS = ['#e8e8ee', '#1f6bff', '#18c46b', '#f2c200', '#a64dff', '#ff4a4a', '#00c8c8', '#ff8a1f'];

  root.SkyLevels = { LEVELS, CARS, AI_COLORS };
  if (typeof module !== 'undefined') module.exports = root.SkyLevels;
})(typeof window !== 'undefined' ? window : globalThis);
