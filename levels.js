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
  const climb = (deg, len) => [P(30, deg), S(len), P(30, -deg)];
  const coil = (deg, len, yaw, bank) => [P(30, deg), T(len, yaw, bank), P(30, -deg)];
  const jump = len => [P(20, 7), { len: len / 2, gap: true }, { len: 20, pitch: -14, gap: true }, { len: len / 2, gap: true }, P(20, 7)];

  const LEVELS = [
    {
      id: 1, name: 'Sunrise Drift', tag: 'Warm up above the cloud sea', twist: 'Wide, forgiving road. Learn to chase boost pads.',
      scale: 2.4, width: 18, base: 64, aiSkill: 1.04, aiRubber: 0.1, ai: 5, car: 0,
      mech: { pads: 12, obst: 8, mix: ['cones', 'block', 'cones'], gateGap: 7, draft: 14, regen: 2 },
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
      scale: 3, width: 17, base: 70, aiSkill: 1.06, aiRubber: 0.1, ai: 5, car: 2,
      mech: { pads: 12, obst: 10, mix: ['cones', 'gate', 'block', 'bar'], gateGap: 6.4, draft: 14, regen: 2 },
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
      scale: 3.3, width: 15, base: 77, aiSkill: 1.07, aiRubber: 0.11, ai: 5, car: 1,
      mech: { pads: 14, obst: 12, mix: ['gate', 'laser', 'block', 'cones'], gateGap: 5.4, draft: 14, regen: 2 },
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
      scale: 3.2, width: 15, base: 81, aiSkill: 1.08, aiRubber: 0.11, ai: 5, car: 3,
      mech: { pads: 12, obst: 12, mix: ['bar', 'spinner', 'cones', 'block'], gateGap: 5.4, draft: 14, gust: 12, regen: 2 },
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
      id: 5, name: 'Desert Mirage', tag: 'Hairpins & slipstreams', twist: 'Stick behind rivals: drafting fills your nitro fast.',
      scale: 3.5, width: 17, base: 86, aiSkill: 1.1, aiRubber: 0.12, ai: 5, car: 4,
      mech: { pads: 10, obst: 12, mix: ['gate', 'block', 'bar', 'cones'], gateGap: 5.6, draft: 28, regen: 2 },
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
      scale: 3.2, width: 16, base: 84, aiSkill: 1.1, aiRubber: 0.12, ai: 5, car: 5,
      mech: { pads: 12, obst: 12, mix: ['block', 'cones', 'gate', 'spinner'], gateGap: 5.6, draft: 16, ice: 1, regen: 2 },
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
      id: 7, name: 'Orbit Ring', tag: 'Zero-G stunt track', twist: 'Loops, corkscrews and free nitro regen. Go full throttle.',
      scale: 3.6, width: 14, base: 92, aiSkill: 1.12, aiRubber: 0.12, ai: 5, car: 6,
      mech: { pads: 12, obst: 14, mix: ['laser', 'spinner', 'gate', 'bar'], gateGap: 5.0, draft: 16, regen: 9 },
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
      scale: 3.6, width: 13, base: 98, aiSkill: 1.14, aiRubber: 0.13, ai: 5, car: 7,
      mech: { pads: 12, obst: 22, mix: ['bar', 'spinner', 'laser', 'gate', 'block'], gateGap: 4.6, draft: 16, regen: 2 },
      cmds: [S(100), T(100, 60, 30), S(40), T(100, -90, 34), jump(36), T(90, 120, 36), climb(12, 80), LOOP(50, 50), S(50), T(100, -100, 34),
        T(100, 100, 34), CS(100, 360), T(100, -150, 38), S(60), jump(40), T(100, 90, 34), climb(-12, 80), T(100, -70, 30), S(150)],
      theme: {
        sky: { top: '#140300', mid: '#5a1405', hor: '#ff6a1f', sun: [0.0, 0.2, -1.0], sunCol: '#ff9a50', sunPow: 300, cloud: 0.8, cloudCol: '#4a1a0e', stars: 0 },
        fog: { color: '#5a1a0a', near: 160, far: 1700 }, light: { hemiSky: '#ff8a50', hemiGround: '#3a0e04', dir: '#ff9d60', dirI: 1.2, hemiI: 0.8 },
        road: { base: '#1a1412', line: '#ffb347', edge: '#ff3d1f', style: 'basalt' }, rail: '#ff3d1f',
        sea: { color: '#2a0d06', y: -210, op: 0.9, count: 140, size: 440 }, scenery: 'lava', weather: { type: 'embers', count: 260, color: '#ff9a40' }, exposure: 1.1
      }
    }
  ];

  const CARS = [
    { name: 'Falcon GT', len: 4.5, wid: 1.86, belt: 0.92, roof: 1.32, cabF: 0.30, cabR: -0.42, nose: 0.55, tail: 0.68, wing: 'lip', wr: 0.37, color: '#ff7a1a', accent: '#ffffff', stripe: true },
    { name: 'Viper RS', len: 4.4, wid: 1.96, belt: 0.84, roof: 1.2, cabF: 0.12, cabR: -0.5, nose: 0.46, tail: 0.66, wing: 'wing', wr: 0.38, color: '#ff2fa8', accent: '#101018', stripe: true },
    { name: 'Bolt', len: 3.9, wid: 1.78, belt: 0.98, roof: 1.46, cabF: 0.44, cabR: -0.62, nose: 0.66, tail: 0.84, wing: 'lip', wr: 0.35, color: '#2fa8ff', accent: '#ffffff', stripe: false },
    { name: 'Titan V8', len: 4.8, wid: 1.95, belt: 0.98, roof: 1.4, cabF: 0.05, cabR: -0.42, nose: 0.74, tail: 0.9, wing: 'duck', wr: 0.4, color: '#e8c21a', accent: '#15151a', stripe: true },
    { name: 'Phantom', len: 4.9, wid: 1.86, belt: 0.92, roof: 1.38, cabF: 0.36, cabR: -0.5, nose: 0.62, tail: 0.78, wing: 'lip', wr: 0.37, color: '#2c2f3a', accent: '#ffb347', stripe: false },
    { name: 'Nova X', len: 4.6, wid: 2.0, belt: 0.78, roof: 1.12, cabF: 0.02, cabR: -0.52, nose: 0.4, tail: 0.6, wing: 'wing', wr: 0.38, color: '#e8fbff', accent: '#00d4ff', stripe: true },
    { name: 'Orbit Z', len: 4.5, wid: 1.96, belt: 0.8, roof: 1.16, cabF: 0.1, cabR: -0.5, nose: 0.42, tail: 0.62, wing: 'wing', wr: 0.37, color: '#9d6bff', accent: '#7df9ff', stripe: true },
    { name: 'Inferno RT', len: 4.6, wid: 1.98, belt: 0.82, roof: 1.18, cabF: 0.08, cabR: -0.5, nose: 0.44, tail: 0.64, wing: 'wing', wr: 0.38, color: '#e01a12', accent: '#ffb347', stripe: true }
  ];
  const AI_COLORS = ['#e8e8ee', '#1f6bff', '#18c46b', '#f2c200', '#a64dff', '#ff4a4a', '#00c8c8', '#ff8a1f'];

  root.SkyLevels = { LEVELS, CARS, AI_COLORS };
  if (typeof module !== 'undefined') module.exports = root.SkyLevels;
})(typeof window !== 'undefined' ? window : globalThis);
