// ROADSTER RUSH: a three-lane endless runner built around what the 2026
// flying Roadster actually showed at its reveal:
//   cold-gas thrusters fed by rechargeable COPV air tanks -> thrust hop + pressure gauge
//   the mid-air 360-degree "kick flip"                    -> second thrust in the air
//   downward corner thrusters cushioning the landing      -> hold to hover, soft landings
//   front side-facing thrusters                           -> lane shifts while airborne
//   2G underbody suction fans (drove upside down)         -> lock onto tunnel ceilings
//   rear thrusters, 0-60 in well under a second           -> Overdrive pickup
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sfx } from './audio.js';
import { Particles } from './fx.js';
import { createRoadster } from './roadster.js';
import {
  CEIL_Y, BEAM_Y, createEnvironment, makeBarrier, makeTraffic, makeSemi, makeRamp, makeGantry,
  makeTunnel, makeBarricade, makePipe, makeCharge, makeCanister, makeOverdrive,
} from './world.js';

// ---------------------------------------------------------------- constants
const LANES = [-3, 0, 3];
const CAR_H = 1.1, CAR_W = 1.8, CAR_L = 4.4;
const GRAV = 40;
const HOP_V = 14, FLIP_V = 15;
const COST = { hop: 18, flip: 26, airShift: 6, hoverPerSec: 32 };
const REGEN = { ground: 16, ceiling: 10 };
const BASE_SPEED = 24, MAX_SPEED = 62;
const SPAWN_AHEAD = 270;
const OD_TIME = 4.5, OD_MULT = 1.6;

// ---------------------------------------------------------------- renderer / scene
const container = document.getElementById('game-container');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 4, 9);

const env = createEnvironment(scene);
const car = createRoadster();
scene.add(car.root);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
car.root.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial) { o.material.envMap = envTex; o.material.needsUpdate = true; } });

const fx = new Particles(scene);
const sfx = new Sfx();

// ---------------------------------------------------------------- DOM
const $ = (id) => document.getElementById(id);
const ui = {
  menu: $('menu'), hud: $('hud'), pause: $('pause'), over: $('gameover'),
  score: $('score'), mult: $('mult'), charges: $('charges'), dist: $('dist'), speed: $('speed'),
  pFill: $('pressure-fill'), psi: $('psi'), gauge: $('gauge'), state: $('state'), toast: $('toast'), hint: $('hint'),
  od: $('od-bar'), odFill: $('od-fill'),
  finalScore: $('final-score'), finalDist: $('final-dist'), finalCharges: $('final-charges'), finalBest: $('final-best'),
  newBest: $('new-best'), cause: $('cause'), menuBest: $('menu-best'),
};

function loadBest() { try { return Number(localStorage.getItem('roadsterRushBest')) || 0; } catch (e) { return 0; } }
function saveBest(v) { try { localStorage.setItem('roadsterRushBest', String(v)); } catch (e) { /* storage unavailable */ } }
let best = loadBest();
ui.menuBest.textContent = best ? `Best: ${best.toLocaleString()}` : '';

// ---------------------------------------------------------------- state
let s;
const objs = [];

function freshState() {
  return {
    mode: 'play', t: 0,
    speed: BASE_SPEED, dist: 0, score: 0, mult: 1, charges: 0,
    lane: 1, prevLane: 1, x: 0,
    y: 0, vy: 0, grounded: true, supportObj: null, jumps: 0,
    inverted: false, ceilT: 0,
    pressure: 100,
    rollA: 0, rollFrom: 0, rollTo: 0, rollT: 1, rollDur: 1, flipping: false, flipDone: false,
    pitch: 0, lean: 0,
    od: 0, bumpCD: 0, crashT: 0, crashSpin: new THREE.Vector3(),
    fxHop: 0, fxFlip: 0, fxLeft: 0, fxRight: 0, cushion: false,
    shake: 0, camY: 0, fov: 62,
    cursor: -45, lastType: 'free', genSinceCan: 0, genSinceOD: 0, segCount: 0,
    hints: {}, held: false, holdTouch: false, airTime: 0, roofBonusFor: null,
  };
}

// ---------------------------------------------------------------- object helpers
function add(o) {
  o.mesh.position.set(o.x, o.y ?? 0, o.z);
  scene.add(o.mesh);
  objs.push(o);
  return o;
}
function obstacle(kind, mesh, x, z, len, w, yb, yt, landable = false, extra = {}) {
  return add({ kind, mesh, x, z, len, w, yb, yt, landable, ...extra });
}
function pickup(kind, x, y, z) {
  const mesh = kind === 'charge' ? makeCharge() : kind === 'canister' ? makeCanister() : makeOverdrive();
  return add({ kind, pickup: true, mesh, x, y, z, len: 1, w: 1, spin: Math.random() * 6 });
}
function chargeLine(lane, z, n, gap, yFn) {
  for (let i = 0; i < n; i++) pickup('charge', LANES[lane], typeof yFn === 'function' ? yFn(i, n) : yFn, z - i * gap);
}
function clearWorld() {
  for (const o of objs) scene.remove(o.mesh);
  objs.length = 0;
}
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------------------------------------------------------------- level generation
function difficulty() { return Math.min(1, s.dist / 4500); }

function genSegment(z0) {
  const d = difficulty();
  const gap = THREE.MathUtils.clamp(s.speed * 0.85, 24, 46) - d * 4;
  const zs = z0 - gap;
  s.segCount++;

  let type;
  if (s.segCount < 3) type = 'row';
  else {
    const r = Math.random();
    const afterTrucks = s.lastType === 'trucks';
    if (!afterTrucks && s.lastType !== 'tunnel' && s.segCount > 5 && r < 0.17) type = 'tunnel';
    else if (r < 0.42 && s.lastType !== 'trucks') type = 'trucks';
    else if (!afterTrucks && r < 0.58) type = 'gantry';
    else if (r < 0.66) type = 'free';
    else type = 'row';
  }
  s.lastType = type;

  let len;
  const needCan = s.genSinceCan > 260;
  const needOD = s.genSinceOD > 950 && s.dist > 400;
  const placeBonus = (lane, z, y = 0.9) => {
    if (needOD) { pickup('od', LANES[lane], y + 0.3, z); s.genSinceOD = 0; return true; }
    if (needCan) { pickup('canister', LANES[lane], y, z); s.genSinceCan = 0; return true; }
    return false;
  };

  if (type === 'row') {
    const kinds = [];
    const nObs = Math.random() < 0.25 + d * 0.5 ? 3 : Math.random() < 0.6 ? 2 : 1;
    const lanes = shuffle([0, 1, 2]);
    for (let i = 0; i < 3; i++) kinds[lanes[i]] = i < nObs ? (Math.random() < 0.5 ? 'barrier' : 'car') : 'empty';
    if (nObs === 3 && !kinds.includes('barrier')) kinds[lanes[0]] = 'barrier';
    let bonusPlaced = false;
    for (let l = 0; l < 3; l++) {
      const x = LANES[l];
      if (kinds[l] === 'barrier') {
        obstacle('barrier', makeBarrier(), x, zs, 0.6, 2.7, 0, 1.15, true);
        if (Math.random() < 0.5) chargeLine(l, zs + 8, 7, 2.7, (i, n) => 0.8 + 2.2 * Math.sin(Math.PI * i / (n - 1)));
      } else if (kinds[l] === 'car') {
        const m = makeTraffic();
        obstacle('car', m, x, zs - 1.6, 4.5, 2.0, 0, 1.55, true);
      } else {
        if (!bonusPlaced) bonusPlaced = placeBonus(l, zs);
        if (!bonusPlaced && Math.random() < 0.7) chargeLine(l, zs + 6, 6, 2.6, 0.8);
      }
    }
    len = gap + 7;
  } else if (type === 'trucks') {
    const semiLen = 15 + d * 4;
    const lanes = shuffle([0, 1, 2]);
    const nSemi = Math.random() < 0.35 + d * 0.4 ? 2 : 1;
    let rampDone = false;
    for (let i = 0; i < 3; i++) {
      const l = lanes[i], x = LANES[l];
      if (i < nSemi) {
        const ramped = !rampDone && (i === 0 ? Math.random() < 0.75 : Math.random() < 0.3);
        const cz = zs - 10 - semiLen / 2;
        obstacle('semi', makeSemi(semiLen), x, cz, semiLen, 2.6, 0, 4.0, true);
        if (ramped) {
          rampDone = true;
          obstacle('ramp', makeRamp(10, 4.0), x, zs - 5, 10, 2.5, 0, 4.0, true, { rampH: 4.0 });
          chargeLine(l, cz + semiLen / 2 - 1, 6, 2.5, 4.8);
        } else {
          chargeLine(l, cz + semiLen / 2 + 4, 6, 2.6, (i2, n) => 1.5 + 4.2 * Math.sin(Math.PI * Math.min(1, i2 / (n - 1)) * 0.9));
        }
      } else if (Math.random() < 0.5) {
        obstacle('barrier', makeBarrier(), x, zs - 6, 0.6, 2.7, 0, 1.15, true);
      } else if (!placeBonus(l, zs - 6)) {
        chargeLine(l, zs - 2, 6, 2.6, 0.8);
      }
    }
    len = gap + 10 + semiLen + 6;
  } else if (type === 'gantry') {
    const lanes = shuffle([0, 1, 2]);
    const nPanels = Math.random() < 0.2 + d * 0.35 ? 3 : Math.random() < 0.55 ? 2 : 1;
    const panelLanes = lanes.slice(0, nPanels);
    const g = makeGantry(panelLanes.map((l) => LANES[l]));
    add({ kind: 'deco', nocollide: true, mesh: g, x: 0, z: zs, len: 1, w: 12 });
    for (const l of panelLanes) {
      obstacle('panel', new THREE.Group(), LANES[l], zs, 0.3, 2.7, 1.5, BEAM_Y, false);
      chargeLine(l, zs + 4, 4, 2.6, 0.7);
    }
    obstacle('beam', new THREE.Group(), 0, zs, 0.4, 11.6, BEAM_Y, BEAM_Y + 0.5, false);
    for (const l of lanes.slice(nPanels)) {
      if (Math.random() < 0.4 + d * 0.3) obstacle('barrier', makeBarrier(), LANES[l], zs, 0.6, 2.7, 0, 1.15, true);
    }
    len = gap + 4;
  } else if (type === 'tunnel') {
    const L = Math.round(105 + d * 50);
    const cz = zs - L / 2;
    add({ kind: 'tunnel', nocollide: true, mesh: makeTunnel(L), x: 0, z: cz, len: L, w: 12 });
    obstacle('portal', new THREE.Group(), 0, zs, 1.2, 12.4, CEIL_Y, 30, false);
    const step = Math.max(26, s.speed * 0.8);
    let open = (Math.random() * 3) | 0;
    let z = zs - 22;
    let first = true;
    while (z > zs - L + 16) {
      // Floor: two of three lanes blocked by barricades.
      open = Math.random() < 0.6 ? (open + (Math.random() < 0.5 ? 1 : 2)) % 3 : open;
      for (let l = 0; l < 3; l++) {
        if (l !== open) obstacle('barricade', makeBarricade(), LANES[l], z, 2.2, 2.8, 0, 2.8, false);
      }
      chargeLine(open, z + 6, 4, 2.4, 0.8);
      // Ceiling: pipe bundles to dodge while inverted, and rich charge lines up there.
      const pipeLane = (Math.random() * 3) | 0;
      if (!first && Math.random() < 0.45 + d * 0.4) obstacle('pipe', makePipe(), LANES[pipeLane], z + step / 2, 0.9, 2.8, CEIL_Y - 1.4, CEIL_Y, false);
      const cl = (pipeLane + 1 + ((Math.random() * 2) | 0)) % 3;
      chargeLine(cl, z + step * 0.35, 5, 2.4, CEIL_Y - 0.6);
      first = false;
      z -= step;
    }
    len = gap + L + 12;
  } else { // free: zig-zag charges and a bonus
    const lane = (Math.random() * 3) | 0;
    if (!placeBonus(lane, zs - 4)) {
      let l = lane;
      for (let i = 0; i < 10; i++) {
        if (i % 4 === 3) l = THREE.MathUtils.clamp(l + (Math.random() < 0.5 ? -1 : 1), 0, 2);
        pickup('charge', LANES[l], 0.8, zs - i * 2.6);
      }
    }
    len = gap + 26;
  }
  s.genSinceCan += len;
  s.genSinceOD += len;
  return len;
}

function generate() {
  while (s.cursor > -SPAWN_AHEAD) s.cursor -= genSegment(s.cursor);
}

// ---------------------------------------------------------------- feedback
let toastTimer = 0;
function toast(text, cls = '') {
  ui.toast.textContent = text;
  ui.toast.className = 'toast show ' + cls;
  toastTimer = 1.1;
}
let hintTimer = 0;
function hint(key, text) {
  if (s.hints[key]) return;
  s.hints[key] = true;
  ui.hint.innerHTML = text;
  ui.hint.classList.add('show');
  hintTimer = 3.6;
}
function addScore(pts, label, cls) {
  s.score += pts * s.mult;
  if (label) toast(`${label} +${Math.round(pts * s.mult)}`, cls);
}
function bumpMult() { s.mult = Math.min(8, s.mult + 1); }

// ---------------------------------------------------------------- roll animation
function startRoll(to, dur) {
  s.rollFrom = s.rollA; s.rollTo = to; s.rollT = 0; s.rollDur = dur;
}
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- actions
function actUp() {
  if (s.mode !== 'play') return;
  if (s.inverted) return;
  if (s.grounded) {
    if (s.pressure < COST.hop) { lowPressure(); return; }
    s.pressure -= COST.hop;
    s.vy = HOP_V; s.grounded = false; s.jumps = 1; s.supportObj = null;
    s.fxHop = 0.28;
    sfx.thrust(0.8);
    dust(10);
  } else if (s.jumps < 2) {
    if (s.pressure < COST.flip) { lowPressure(); return; }
    s.pressure -= COST.flip;
    s.vy = Math.max(s.vy, 0) * 0.2 + FLIP_V;
    s.jumps = 2;
    s.fxFlip = 0.4;
    const dir = s.lane > s.prevLane ? -1 : s.lane < s.prevLane ? 1 : -1;
    startRoll(s.rollA + dir * TAU, 0.55);
    s.flipping = true; s.flipDone = false;
    sfx.kickflip();
  }
}

function actDown() {
  if (s.mode !== 'play') return;
  if (s.inverted) releaseCeiling(true);
}

function actLane(dir) {
  if (s.mode !== 'play') return;
  const nl = THREE.MathUtils.clamp(s.lane + dir, 0, 2);
  if (nl === s.lane) return;
  s.prevLane = s.lane;
  s.lane = nl;
  if (!s.grounded && !s.inverted) {
    // Airborne: the front side-facing thrusters push the car sideways.
    s.pressure = Math.max(0, s.pressure - COST.airShift);
    if (dir > 0) s.fxLeft = 0.2; else s.fxRight = 0.2;
    sfx.sidePuff();
  }
}

function lowPressure() {
  sfx.fizz();
  toast('LOW PRESSURE', 'warn');
  ui.gauge.classList.remove('flash'); void ui.gauge.offsetWidth; ui.gauge.classList.add('flash');
}

function releaseCeiling(manual) {
  s.inverted = false;
  s.vy = -1.5; s.jumps = 2; s.grounded = false;
  startRoll(s.rollA + Math.PI, 0.42);
  car.fans(false);
  sfx.sidePuff();
  if (!manual) toast('TUNNEL EXIT — RELEASE', 'info');
}

function crash(cause) {
  if (s.od > 0) return false;
  s.mode = 'crashing';
  s.crashT = 0;
  s.crashSpin.set(rnd(-4, 4), rnd(-3, 3), rnd(-6, 6));
  s.vy = 8;
  s.shake = 1.2;
  sfx.crash();
  ui.cause.textContent = cause;
  for (let i = 0; i < 40; i++) {
    const p = car.root.position;
    fx.emit(new THREE.Vector3(p.x + rnd(-1, 1), p.y + rnd(-0.5, 0.8), p.z + rnd(-2, 2)),
      new THREE.Vector3(rnd(-6, 6), rnd(1, 9), rnd(-6, 6)),
      { color: i % 3 ? 0x9a9aa0 : 0xffb070, size: rnd(0.5, 1.2), grow: 3, life: rnd(0.6, 1.4), alpha: 0.8, additive: i % 3 === 0 });
  }
  return true;
}

function smash(o) {
  o.nocollide = true;
  o.fly = new THREE.Vector3(Math.sign(o.x - s.x || rnd(-1, 1)) * rnd(6, 12), rnd(8, 14), -rnd(5, 15));
  o.flySpin = new THREE.Vector3(rnd(-5, 5), rnd(-5, 5), rnd(-5, 5));
  s.shake = Math.max(s.shake, 0.4);
  addScore(50, 'SMASH', 'od');
  sfx.smash();
}

// ---------------------------------------------------------------- particles helpers
const tmpV = new THREE.Vector3(), tmpD = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
function dust(n) {
  for (let i = 0; i < n; i++) {
    fx.emit(new THREE.Vector3(s.x + rnd(-1, 1), s.y + 0.1, rnd(-2, 2)),
      new THREE.Vector3(rnd(-3, 3), rnd(0.5, 2.5), rnd(0, 4)),
      { color: 0xd8b48a, size: 0.6, grow: 3, life: 0.7, alpha: 0.45 });
  }
}
function emitPlumes() {
  car.body.getWorldQuaternion(tmpQ);
  for (const g of Object.keys(car.thrusters)) {
    for (const th of car.thrusters[g]) {
      if (th.level < 0.25 || Math.random() > th.level * 0.9) continue;
      tmpV.copy(th.pos); car.body.localToWorld(tmpV);
      tmpD.copy(th.dir).applyQuaternion(tmpQ);
      fx.emit(tmpV, tmpD.clone().multiplyScalar(rnd(7, 12)).add(new THREE.Vector3(rnd(-0.6, 0.6), rnd(-0.6, 0.6), rnd(-0.6, 0.6))),
        { color: 0xeaf6ff, size: 0.35, grow: 4, life: 0.45, alpha: 0.5 * th.level });
    }
  }
}

// ---------------------------------------------------------------- core update
function overlapX(o) { return Math.abs(o.x - s.x) < o.w / 2 + CAR_W / 2 - 0.12; }
function overlapZ(z, o) { return Math.abs(z) < o.len / 2 + CAR_L / 2 - 0.25; }
function topAt(o) {
  if (o.kind === 'ramp') {
    // Sample under the front wheels so the car tops out exactly as its nose
    // reaches the trailer roof.
    const t = THREE.MathUtils.clamp((o.z + o.len / 2 + CAR_L / 2 - 0.25) / o.len, 0, 1);
    return t * o.rampH;
  }
  return o.yt;
}
function currentTunnel() {
  for (const o of objs) if (o.kind === 'tunnel' && o.z - o.len / 2 < 0 && o.z + o.len / 2 > 0) return o;
  return null;
}

function update(dt) {
  s.t += dt;
  const d = difficulty();
  s.speed = Math.min(MAX_SPEED, BASE_SPEED + s.dist / 140);
  if (s.od > 0) s.od -= dt;
  const eff = s.speed * (s.od > 0 ? OD_MULT : 1);
  const move = eff * dt;
  s.dist += move;
  s.cursor += move;
  s.score += move * s.mult * 0.5;
  if (s.bumpCD > 0) s.bumpCD -= dt;

  // World scroll.
  for (const o of objs) {
    o.z += move;
    if (o.fly) {
      o.fly.y -= GRAV * dt;
      o.mesh.position.x += o.fly.x * dt; o.mesh.position.y += o.fly.y * dt; o.mesh.position.z = o.z + (o.flyZ = (o.flyZ || 0) + o.fly.z * dt);
      o.mesh.rotation.x += o.flySpin.x * dt; o.mesh.rotation.y += o.flySpin.y * dt; o.mesh.rotation.z += o.flySpin.z * dt;
    } else {
      o.mesh.position.z = o.z;
    }
    if (o.pickup) { o.spin += dt * 3; o.mesh.rotation.y = o.spin; o.mesh.position.y = o.y + Math.sin(o.spin * 1.3) * 0.12; }
  }
  env.update(dt, move);

  // Lateral motion.
  const tx = LANES[s.lane];
  s.x += (tx - s.x) * Math.min(1, dt * 13);
  s.lean += ((tx - s.x) * -0.09 - s.lean) * Math.min(1, dt * 12);

  const tunnel = currentTunnel();
  const prevBottom = s.y;

  // Vertical motion.
  let hovering = false;
  if (s.inverted) {
    s.y = CEIL_Y - CAR_H;
    s.ceilT += dt;
    if (s.ceilT > 1) { s.ceilT -= 1; addScore(60, 'INVERTED', 'info'); }
    if (!tunnel || tunnel.z - tunnel.len / 2 > -9) releaseCeiling(false);
  } else {
    let g = GRAV;
    const wantsHover = (s.held || s.holdTouch) && !s.grounded && s.vy < 0 && s.jumps >= 1;
    if (wantsHover && s.pressure > 0.5) {
      hovering = true;
      g = GRAV * 0.22;
      s.vy = Math.max(s.vy, -6);
      s.pressure = Math.max(0, s.pressure - COST.hoverPerSec * dt);
      car.fire('down', 0.6);
    }
    s.vy -= g * dt;
    s.y += s.vy * dt;

    // Find supporting surface beneath the car: road, ramp, roofs.
    let support = 0, supObj = null;
    for (const o of objs) {
      if (!o.landable || o.nocollide || o.pickup) continue;
      if (!overlapX(o) || !overlapZ(o.z, o)) continue;
      const top = topAt(o);
      const tol = o.kind === 'ramp' ? 0.9 : 0.45;
      if (prevBottom >= top - tol && top > support) { support = top; supObj = o; }
    }
    const above = s.y - support;
    // Downward thrusters cushion a hard landing.
    if (!s.grounded && s.vy < -11 && above < 1.6 && above > 0) {
      s.vy *= Math.pow(0.02, dt);
      car.fire('down', 0.9);
      if (!s.cushion) { s.cushion = true; sfx.cushion(); }
    }
    if (s.y <= support) {
      if (!s.grounded) land(supObj, prevBottom - s.y);
      s.y = support; s.vy = 0; s.grounded = true; s.jumps = 0; s.supportObj = supObj;
    } else if (above > 0.06) {
      if (s.grounded) { s.grounded = false; s.jumps = Math.max(s.jumps, 1); s.vy = Math.min(s.vy, 0); }
      s.supportObj = null;
    }

    // Suction fans grab the tunnel ceiling.
    if (tunnel && !s.grounded && s.y + CAR_H >= CEIL_Y) {
      if (s.vy > 0) {
        s.inverted = true; s.vy = 0; s.y = CEIL_Y - CAR_H; s.ceilT = 0;
        const target = Math.PI + TAU * Math.round((s.rollA - Math.PI) / TAU);
        startRoll(target, 0.22);
        s.flipping = false;
        car.fans(true);
        sfx.suctionLock();
        addScore(150, 'SUCTION LOCK · 2G', 'info');
        bumpMult();
      } else {
        s.y = CEIL_Y - CAR_H;
      }
    }
  }

  // Collisions.
  const carBottom = s.y, carTop = s.y + CAR_H;
  for (const o of objs) {
    if (o.nocollide || o.pickup) continue;
    if (!overlapX(o) || !overlapZ(o.z, o)) continue;
    if (o.landable && carBottom >= topAt(o) - (o.kind === 'ramp' ? 0.9 : 0.45)) continue;
    if (carTop <= o.yb + 0.05 || carBottom >= o.yt) continue;
    if (s.od > 0 && o.kind !== 'portal' && o.kind !== 'beam') { smash(o); continue; }
    if (s.od > 0) continue;
    const wasOverlapZ = overlapZ(o.z - move, o);
    if (wasOverlapZ && Math.abs(s.x - tx) > 0.25) {
      if (s.bumpCD <= 0) {
        // Side swipe: bounce back to the previous lane.
        s.lane = s.prevLane; s.prevLane = s.lane;
        s.bumpCD = 0.35; s.shake = 0.5; s.mult = 1;
        s.pressure = Math.max(0, s.pressure - 10);
        sfx.bump();
        toast('SIDESWIPE', 'warn');
      }
      continue;
    }
    const causes = {
      barrier: 'Hit a barrier. Thrust (↑) to hop over.',
      car: 'Rear-ended a parked car. Hop over it or land on its roof.',
      semi: 'Hit a semi. Use the ramp, or thrust twice to kickflip onto its roof.',
      ramp: 'Clipped the ramp edge.',
      panel: 'Flew into a LOW-clearance slab. Stay on the ground under gantries.',
      beam: 'Flew into a gantry crossbeam.',
      barricade: 'Hit a tunnel barricade. Switch lanes, or kickflip up and drive on the ceiling.',
      pipe: 'Hit a ceiling pipe while inverted. Shift lanes, or drop (↓) to the floor.',
      portal: 'Flew into the tunnel portal. Be on the ground when entering tunnels.',
    };
    if (crash(causes[o.kind] || 'Crashed.')) return;
  }

  // Pickups.
  for (const o of objs) {
    if (!o.pickup || o.taken) continue;
    if (Math.abs(o.x - s.x) > 1.4 || Math.abs(o.z) > 2.4) continue;
    if (o.y < carBottom - 0.6 || o.y > carTop + 0.6) continue;
    o.taken = true; o.mesh.visible = false;
    if (o.kind === 'charge') { s.charges++; s.score += 10 * s.mult; sfx.charge(); }
    else if (o.kind === 'canister') { s.pressure = Math.min(100, s.pressure + 55); sfx.refill(); toast('COPV REFILL', 'info'); }
    else { s.od = OD_TIME; sfx.overdrive(); toast('OVERDRIVE', 'od'); bumpMult(); }
  }

  // Pressure recompression (onboard compressor, no fuel).
  if (s.grounded) s.pressure = Math.min(100, s.pressure + REGEN.ground * dt);
  else if (s.inverted) s.pressure = Math.min(100, s.pressure + REGEN.ceiling * dt);

  // Contextual hints for the first encounter.
  for (const o of objs) {
    if (o.z < -95 || o.z > -20) continue;
    if (o.kind === 'portal') hint('tunnel', 'TUNNEL — enter on the ground. Thrust <b>twice</b> to reach the ceiling: suction fans lock on and you drive inverted.');
    else if (o.kind === 'semi' && !objs.some((r) => r.kind === 'ramp' && Math.abs(r.x - o.x) < 0.1 && Math.abs(r.z - o.z) < 20)) hint('tall', 'TALL SEMI — thrust, then thrust again mid-air to <b>kickflip</b> onto its roof.');
    else if (o.kind === 'panel') hint('low', 'LOW CLEARANCE — stay on the road, or switch lanes.');
    else if (o.kind === 'ramp') hint('ramp', 'RAMP — drive up onto the trailer roofs.');
  }

  // Despawn.
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    if (o.z - o.len / 2 > 18 || (o.fly && o.mesh.position.y < -10)) { scene.remove(o.mesh); objs.splice(i, 1); }
  }
  generate();

  if (!s.grounded && !s.inverted) s.airTime += dt; else s.airTime = 0;

  // Thruster visuals.
  if (s.fxHop > 0) { s.fxHop -= dt; car.fire('down', 1); car.fire('rear', 0.5); }
  if (s.fxFlip > 0) { s.fxFlip -= dt; car.fire('down', 1); car.fire('left', 0.9); car.fire('right', 0.9); }
  if (s.fxLeft > 0) { s.fxLeft -= dt; car.fire('left', 1); }
  if (s.fxRight > 0) { s.fxRight -= dt; car.fire('right', 1); }
  if (s.od > 0) car.fire('rear', 1);
  sfx.loop(eff, s.inverted, hovering, true);
  s.hovering = hovering;
  updateCarVisual(dt, eff);
}

function land(supObj, impact) {
  s.cushion = false;
  const hard = impact > 0.25;
  sfx.land(hard ? 1 : 0.5);
  if (hard) dust(8);
  if (s.flipping) {
    s.flipping = false;
    if (s.flipDone) { addScore(250, 'KICKFLIP', 'good'); bumpMult(); }
    else { startRoll(TAU * Math.round(s.rollA / TAU), 0.12); toast('SKETCHY LANDING', 'warn'); }
  }
  if (supObj && supObj.kind === 'semi' && s.roofBonusFor !== supObj) {
    s.roofBonusFor = supObj;
    addScore(100, 'ROOFTOP', 'good');
  }
}

function updateRoll(dt) {
  if (s.rollT < s.rollDur) {
    s.rollT += dt;
    const k = Math.min(1, s.rollT / s.rollDur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    s.rollA = s.rollFrom + (s.rollTo - s.rollFrom) * e;
    if (k >= 1) {
      s.rollA = s.rollTo;
      if (s.flipping) s.flipDone = true;
      if (!s.inverted) s.rollA = 0; else s.rollA = Math.PI;
    }
  }
}

function updateCarVisual(dt, eff) {
  updateRoll(dt);
  car.root.position.set(s.x, s.y + CAR_H / 2, 0);
  car.root.rotation.set(0, s.lean * 0.6, 0);
  let pitchT = 0;
  if (s.grounded && s.supportObj && s.supportObj.kind === 'ramp') pitchT = Math.atan2(s.supportObj.rampH, s.supportObj.len);
  else if (!s.grounded && !s.inverted) pitchT = THREE.MathUtils.clamp(s.vy / eff, -0.4, 0.4) * 0.8;
  s.pitch += (pitchT - s.pitch) * Math.min(1, dt * 10);
  car.pitch.rotation.x = s.pitch;
  car.roll.rotation.z = s.rollA + s.lean;
  car.update(dt, eff);
  emitPlumes();
}

function updateCrash(dt) {
  s.crashT += dt;
  s.speed *= Math.pow(0.15, dt);
  const move = s.speed * dt;
  for (const o of objs) { o.z += move; o.mesh.position.z = o.z; }
  env.update(dt, move);
  s.vy -= GRAV * dt;
  s.y = Math.max(0, s.y + s.vy * dt);
  if (s.y === 0) s.vy = Math.abs(s.vy) * 0.3;
  car.root.position.y = s.y + CAR_H / 2;
  car.root.rotation.x += s.crashSpin.x * dt;
  car.root.rotation.y += s.crashSpin.y * dt;
  car.roll.rotation.z += s.crashSpin.z * dt;
  s.crashSpin.multiplyScalar(Math.pow(0.3, dt));
  car.update(dt, s.speed);
  if (Math.random() < 0.5) {
    fx.emit(car.root.position.clone().add(new THREE.Vector3(rnd(-0.5, 0.5), 0.3, rnd(-1, 1))), new THREE.Vector3(rnd(-1, 1), rnd(1, 3), 2), { color: 0x6c6c72, size: 0.8, grow: 3, life: 1.2, alpha: 0.5 });
  }
  sfx.loop(0, false, false, false);
  if (s.crashT > 1.4) gameOver();
}

// ---------------------------------------------------------------- camera / HUD
function updateCamera(dt) {
  const inMenu = !s || s.mode === 'menu';
  if (inMenu) {
    const t = performance.now() / 1000;
    camera.position.set(Math.sin(t * 0.25) * 7, 2.2 + Math.sin(t * 0.4) * 0.4, Math.cos(t * 0.25) * 7 - 1);
    camera.lookAt(0, 0.7, 0);
    return;
  }
  // Inside a tunnel the camera has to stay under the roof; when inverted it
  // drops low and looks up at the car on the ceiling.
  const inTunnel = objs.some((o) => o.kind === 'tunnel' && o.z - o.len / 2 < 8.4 && o.z + o.len / 2 > -2);
  const camYT = s.inverted ? -1.3 : s.y * 0.6;
  s.camY += (camYT - s.camY) * Math.min(1, dt * 5);
  const tx = s.x * 0.75, tz = 8.4;
  let ty = 3.6 + s.camY;
  if (inTunnel) ty = Math.min(ty, CEIL_Y - 0.9);
  camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 8);
  camera.position.y += (ty - camera.position.y) * Math.min(1, dt * 6);
  camera.position.z = tz;
  if (s.shake > 0) {
    s.shake = Math.max(0, s.shake - dt * 2);
    camera.position.x += rnd(-1, 1) * s.shake * 0.3;
    camera.position.y += rnd(-1, 1) * s.shake * 0.3;
  }
  camera.lookAt(s.x * 0.85, s.inverted ? 3.2 : 1.1 + s.camY * 0.9, -10);
  const fovT = s.od > 0 ? 76 : 62 + (s.speed - BASE_SPEED) * 0.12;
  s.fov += (fovT - s.fov) * Math.min(1, dt * 3);
  camera.fov = s.fov; camera.updateProjectionMatrix();
}

function updateHud(dt) {
  ui.score.textContent = Math.floor(s.score).toLocaleString();
  ui.mult.textContent = `×${s.mult}`;
  ui.mult.classList.toggle('hot', s.mult > 1);
  ui.charges.textContent = s.charges;
  ui.dist.textContent = `${Math.floor(s.dist).toLocaleString()} m`;
  const mph = Math.round(s.speed * (s.od > 0 ? OD_MULT : 1) * 3.7);
  ui.speed.textContent = mph;
  ui.pFill.style.width = `${s.pressure}%`;
  ui.pFill.classList.toggle('low', s.pressure < COST.flip);
  ui.psi.textContent = `${Math.round(s.pressure * 60).toLocaleString()} psi`;
  let st = 'DRIVE';
  if (s.mode === 'crashing') st = 'CRASH';
  else if (s.inverted) st = 'INVERTED · FANS 2G';
  else if (s.hovering) st = 'HOVER';
  else if (!s.grounded) st = s.flipping ? 'KICKFLIP' : 'AIRBORNE';
  else if (s.supportObj && s.supportObj.kind === 'semi') st = 'ROOF RUN';
  ui.state.textContent = st;
  ui.od.style.display = s.od > 0 ? 'block' : 'none';
  if (s.od > 0) ui.odFill.style.width = `${(s.od / OD_TIME) * 100}%`;
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) ui.toast.classList.remove('show'); }
  if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) ui.hint.classList.remove('show'); }
}

// ---------------------------------------------------------------- game flow
function show(el, on) { el.classList.toggle('hidden', !on); }

function startGame() {
  sfx.init();
  clearWorld();
  fx.clear();
  car.reset();
  s = freshState();
  generate();
  show(ui.menu, false); show(ui.over, false); show(ui.pause, false); show(ui.hud, true);
  ui.toast.classList.remove('show'); ui.hint.classList.remove('show');
  hint('start', 'Thrust <b>↑</b> to hop · <b>↑↑</b> kickflip · hold <b>↑</b> to hover · <b>← →</b> lanes · <b>↓</b> drop from ceiling');
  last = performance.now();
}

function gameOver() {
  s.mode = 'over';
  const sc = Math.floor(s.score);
  const isBest = sc > best;
  if (isBest) { best = sc; saveBest(best); }
  ui.finalScore.textContent = sc.toLocaleString();
  ui.finalDist.textContent = `${Math.floor(s.dist).toLocaleString()} m`;
  ui.finalCharges.textContent = s.charges;
  ui.finalBest.textContent = best.toLocaleString();
  show(ui.newBest, isBest);
  show(ui.over, true);
  ui.menuBest.textContent = `Best: ${best.toLocaleString()}`;
}

function togglePause() {
  if (!s) return;
  if (s.mode === 'play') { s.mode = 'paused'; show(ui.pause, true); sfx.loop(0, false, false, false); }
  else if (s.mode === 'paused') { s.mode = 'play'; show(ui.pause, false); last = performance.now(); }
}

function toMenu() {
  clearWorld(); fx.clear(); car.reset();
  s = { mode: 'menu' };
  show(ui.over, false); show(ui.pause, false); show(ui.hud, false); show(ui.menu, true);
  car.root.position.set(0, CAR_H / 2, 0);
}

// ---------------------------------------------------------------- input
const keyMap = {
  ArrowUp: 'up', KeyW: 'up', Space: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};
window.addEventListener('keydown', (e) => {
  const a = keyMap[e.code];
  if (a || e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyM') { sfx.setMuted(!sfx.muted); return; }
  if (!s || s.mode === 'menu') { if (e.code === 'Enter' || e.code === 'Space') startGame(); return; }
  if (s.mode === 'over') { if (e.code === 'Enter' || e.code === 'Space') startGame(); else if (e.code === 'Escape') toMenu(); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); return; }
  if (s.mode !== 'play' || e.repeat) return;
  if (a === 'up') { s.held = true; actUp(); }
  else if (a === 'down') actDown();
  else if (a === 'left') actLane(-1);
  else if (a === 'right') actLane(1);
});
window.addEventListener('keyup', (e) => {
  if (keyMap[e.code] === 'up' && s) s.held = false;
});
window.addEventListener('blur', () => { if (s && s.mode === 'play') togglePause(); });

// Touch: swipe for lanes/up/down, tap = thrust, press-and-hold = hover.
let touch = null;
renderer.domElement.addEventListener('touchstart', (e) => {
  if (!s || s.mode !== 'play') return;
  const t = e.changedTouches[0];
  touch = { x: t.clientX, y: t.clientY, time: performance.now(), done: false };
  e.preventDefault();
}, { passive: false });
renderer.domElement.addEventListener('touchmove', (e) => {
  if (!touch || touch.done || !s || s.mode !== 'play') return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  if (Math.hypot(dx, dy) > 34) {
    touch.done = true;
    if (Math.abs(dx) > Math.abs(dy)) actLane(dx > 0 ? 1 : -1);
    else if (dy < 0) { actUp(); touch.hoverable = true; }
    else actDown();
  }
  e.preventDefault();
}, { passive: false });
renderer.domElement.addEventListener('touchend', () => {
  if (touch && !touch.done && s && s.mode === 'play' && performance.now() - touch.time < 260) actUp();
  touch = null;
  if (s) s.holdTouch = false;
});
setInterval(() => {
  if (touch && s && s.mode === 'play' && (touch.hoverable || !touch.done) && performance.now() - touch.time > 260) s.holdTouch = true;
}, 50);

$('start-btn').addEventListener('click', startGame);
$('retry-btn').addEventListener('click', startGame);
$('menu-btn').addEventListener('click', toMenu);
$('resume-btn').addEventListener('click', togglePause);
$('quit-btn').addEventListener('click', toMenu);
$('pause-btn').addEventListener('click', togglePause);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- main loop
let last = performance.now();
s = { mode: 'menu' };
car.root.position.set(0, CAR_H / 2, 0);

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (s.mode === 'play') { update(dt); fx.update(dt, s.speed * (s.od > 0 ? OD_MULT : 1) * dt); updateHud(dt); }
  else if (s.mode === 'crashing') { updateCrash(dt); fx.update(dt, s.speed * dt); updateHud(dt); }
  else if (s.mode === 'menu') {
    const mv = 14 * dt;
    env.update(dt, mv);
    car.update(dt, 14);
    car.fire('rear', 0.25 + 0.2 * Math.sin(now / 300));
    fx.update(dt, mv);
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Hook used by the automated playtest scripts (harmless in normal play).
window.__rr = {
  get state() { return s; }, objs, startGame, step: (dt) => update(dt), actUp, actDown, actLane, clearWorld,
  spawn: { obstacle, pickup, makeBarrier, makeTraffic, makeSemi, makeRamp, makeTunnel, makeBarricade, makePipe, genSegment },
};
