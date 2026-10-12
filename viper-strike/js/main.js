// Viper Strike — helicopter vs tank combat. Two roles share one combat simulation:
//   PILOT : fly the gunship and stop an escaping tank convoy.
//   TANK  : command an AA tank in the convoy and shoot down hunting gunships.
import * as THREE from 'three';
import { Helicopter } from './heli.js';
import { Tank, PLAYER_VEHICLES } from './tank.js';
import { FIELD, MAP_INFO, buildWorld } from './world.js';
import { Effects } from './effects.js';
import { Sfx } from './audio.js';
import { setVehicleEnv } from './materials.js';
import { makeSkyTexture } from './textures.js';

/* ------------------------------------------------------------------ */
/*  Tuning                                                             */
/* ------------------------------------------------------------------ */
// Pilot weapons
const GUN_INTERVAL = 0.08, BULLET_SPEED = 320, BULLET_DAMAGE = 5;
const MISSILE_DAMAGE = 65, MISSILE_RANGE = 600;
// Hellfire magazine: 4 rounds fired one per press; spent rounds rearm one at a time
const MISSILE_MAX = 4, MISSILE_REARM = 3.5, MISSILE_GAP = 0.35;
const FLARE_MAX = 4, FLARE_RECHARGE = 8, FLARE_COOLDOWN = 1.0;
// Enemy/allied tank weapons
// Every main-gun tank (player or NPC) fires the same high-velocity airburst shell; NPC damage is lower for balance.
const FLAK_RANGE = 340, SHELL_SPEED = 550, AI_SHELL_DIRECT = 26, AI_SHELL_SPLASH = 11, ALLY_SHELL_DIRECT = 70, ALLY_SHELL_SPLASH = 28;
const SAM_DAMAGE = 45, SAM_RANGE = 380;
// Tunguska twin 30 mm: rapid-fire straight rounds, like the helicopter's chin gun
const TGUN_INTERVAL = 0.08, TGUN_SPEED = 360, TGUN_DMG_PLAYER = 5, TGUN_DMG_AI = 1.2;
const PSAM_COOLDOWN = 5, PSAM_DAMAGE = 110, LOCK_RADIUS = 130, LOCK_TIME = 0.7, LOCK_RANGE = 520;
const SMOKE_MAX = 3, SMOKE_RECHARGE = 12;
// AI gunships
const AIH_HP = 180, AIH_GUN_DMG = 2.5, AIH_MISSILE_DMG = 40;
const AIH_REARM = 8;   // seconds per missile for AI aircraft (slower than the player's 3.5 s)
const TANK_HP_ALLY = { standard: 220, heavy: 320, elite: 260 };

const CAM_MODES = {
  pilot: ['CHASE', 'FAR CHASE', 'COCKPIT', 'TACTICAL', 'CINEMATIC'],
  tank: ['CHASE', 'CLOSE', 'GUNNER', 'TACTICAL', 'CINEMATIC'],
};

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const wrapAngle = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const FLIP_Y = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

/* ------------------------------------------------------------------ */
/*  Renderer                                                           */
/* ------------------------------------------------------------------ */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('game-container').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 5000);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;
const clock = new THREE.Clock();
const sfx = new Sfx();
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

/* ------------------------------------------------------------------ */
/*  Input                                                              */
/* ------------------------------------------------------------------ */
const keys = {};
const mouse = { x: window.innerWidth / 2, y: window.innerHeight * 0.5, down: false };
const isKey = (...c) => c.some((k) => keys[k]);
const inPlay = () => G && !paused && G.state === 'play';

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (G && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Space' && inPlay()) fireSecondary();
  if (e.code === 'KeyF' && inPlay()) deployDecoys(G.player, true);
  if (e.code === 'KeyC' && G && !paused && G.state !== 'over') cycleCamera();
  if (e.code === 'Escape' && G && G.state === 'play') togglePause();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; });
window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mousedown', (e) => {
  if (!G || (e.target.closest && e.target.closest('button'))) return;
  if (e.button === 0) mouse.down = true;
  if (e.button === 2 && inPlay()) fireSecondary();
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; });
window.addEventListener('contextmenu', (e) => { if (G) e.preventDefault(); });

/* ------------------------------------------------------------------ */
/*  Menu                                                               */
/* ------------------------------------------------------------------ */
// tanks / helis: every tank and every helicopter on the map, including the player's own vehicle (1–13 each)
const settings = { role: 'pilot', tanks: 6, helis: 3, map: 'desert', vehicle: 'tunguska' };
let menuActive = true;

function composition(n) {
  const elite = n >= 4 ? Math.max(1, Math.round(n * 0.25)) : 1;
  const heavy = Math.floor((n - elite) * 0.3);
  return { elite, heavy, standard: n - elite - heavy, allowed: n <= 2 ? 0 : Math.max(1, Math.floor(n / 3)) };
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const ROLE_TEXT = {
  pilot: {
    tagline: 'Attack helicopter &middot; stop the convoy before it escapes',
    preview: 'AH-64D APACHE LONGBOW',
    loadout: [['M230 30mm', 'Chin-mounted chain gun'], ['HELLFIRE ×4', 'Tracking missiles, fire one at a time'], ['FLARES', 'Decoy heat-seeking SAMs']],
    controls: [['W S', 'Cyclic fwd / back'], ['A D', 'Pedals / bank turn'], ['E Q', 'Collective up / down'], ['Mouse', 'Aim'], ['L-Click', 'Gun'], ['Space / R-Click', 'Missile'], ['F', 'Flares'], ['C', 'Camera'], ['Esc', 'Pause']],
  },
  tank: {
    tagline: 'AA tank commander &middot; survive the gunships and reach extraction',
    preview: 'TUNGUSKA-CLASS AIR-DEFENCE TRACK',
    loadout: [['TWIN 30mm', 'Rapid-fire autocannons'], ['9M311 SAM', 'Lock-on surface-to-air missiles'], ['SMOKE', 'Screens you from guided missiles']],
    controls: [['W S', 'Throttle / reverse'], ['A D', 'Steer hull'], ['Mouse', 'Aim turret'], ['L-Click', 'Autocannons'], ['Space / R-Click', 'Fire locked SAM'], ['F', 'Smoke screen'], ['C', 'Camera'], ['Esc', 'Pause']],
  },
};

function refreshMenu() {
  document.querySelectorAll('.map-card').forEach((c) => c.classList.toggle('selected', c.dataset.map === settings.map));
  document.querySelectorAll('.role-card').forEach((c) => c.classList.toggle('selected', c.dataset.role === settings.role));
  $('tank-count').value = settings.tanks;
  $('tank-count-val').textContent = settings.tanks;
  $('heli-count').value = settings.helis;
  $('heli-count-val').textContent = settings.helis;
  if (settings.role === 'pilot') {
    const c = composition(settings.tanks);
    const wing = settings.helis - 1;
    $('density-info').innerHTML = `Your Apache${wing ? ` + <b>${plural(wing, 'wingman', 'wingmen')}</b>` : ' flying alone'} vs <b class="elite">${plural(settings.tanks, 'enemy tank', 'enemy tanks')}</b>`
      + ` <span class="sub-info">(${c.standard} T-72B3 · ${c.heavy} T-90 · ${c.elite} Tunguska SAM) · max <b>${c.allowed}</b> may escape</span>`;
  } else {
    const allies = settings.tanks - 1;
    $('density-info').innerHTML = `Your tank${allies ? ` + <b>${plural(allies, 'allied tank', 'allied tanks')}</b>` : ' alone'} vs <b class="elite">${plural(settings.helis, 'enemy gunship', 'enemy gunships')}</b>`;
  }
  const R = { ...ROLE_TEXT[settings.role] };
  const tankRole = settings.role === 'tank';
  $('vehicle-cards').classList.toggle('hidden', !tankRole);
  document.querySelectorAll('.vehicle-card').forEach((c) => c.classList.toggle('selected', c.dataset.vehicle === settings.vehicle));
  if (tankRole) {
    const V = PLAYER_VEHICLES[settings.vehicle];
    R.preview = `${V.name.toUpperCase()} · ${V.hp} HP`;
    if (!V.sam) {
      R.loadout = [[V.name.includes('M1') ? '120mm M256' : '125mm 2A46', 'High-velocity airburst rounds'], ['NO MISSILES', 'Lead your shots with the main gun'], ['SMOKE', 'Screens you from guided missiles']];
      R.controls = R.controls.map(([k, d]) => (k === 'L-Click' ? [k, 'Main gun'] : k === 'Space / R-Click' ? null : [k, d])).filter(Boolean);
    }
  }
  $('tagline').innerHTML = R.tagline;
  $('preview-label').textContent = R.preview;
  $('loadout').innerHTML = R.loadout.map(([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`).join('');
  $('controls-help').innerHTML = R.controls.map(([k, d]) => `<span>${k.split(' / ').map((x) => x.split(' ').map((y) => `<kbd>${y}</kbd>`).join('')).join(' / ')} ${d}</span>`).join('');
}
document.querySelectorAll('.map-card').forEach((c) => c.addEventListener('click', () => { settings.map = c.dataset.map; refreshMenu(); rebuildPreview(); }));
document.querySelectorAll('.role-card').forEach((c) => c.addEventListener('click', () => { settings.role = c.dataset.role; refreshMenu(); rebuildPreview(); }));
$('vehicle-cards').innerHTML = Object.entries(PLAYER_VEHICLES).map(([key, v]) => `
  <button class="card vehicle-card" data-vehicle="${key}">
    <h4>${v.short}</h4><p>${v.desc}</p>
    <span class="tag ${v.sam ? '' : 'gun'}">${v.sam ? 'SAM + 30mm' : 'MAIN GUN'}</span>
  </button>`).join('');
document.querySelectorAll('.vehicle-card').forEach((c) => c.addEventListener('click', () => { settings.vehicle = c.dataset.vehicle; refreshMenu(); rebuildPreview(); }));
$('tank-count').addEventListener('input', (e) => { settings.tanks = +e.target.value; refreshMenu(); });
$('heli-count').addEventListener('input', (e) => { settings.helis = +e.target.value; refreshMenu(); });
$('start-btn').addEventListener('click', startMission);
$('again-btn').addEventListener('click', startMission);
$('menu-btn').addEventListener('click', backToMenu);
$('resume-btn').addEventListener('click', togglePause);
$('quit-btn').addEventListener('click', backToMenu);

// 3D preview
const prevCanvas = $('preview');
const prevRenderer = new THREE.WebGLRenderer({ canvas: prevCanvas, antialias: true, alpha: true });
prevRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
prevRenderer.toneMapping = THREE.ACESFilmicToneMapping;
const prevScene = new THREE.Scene();
prevScene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.5));
const pSun = new THREE.DirectionalLight(0xfff0dd, 2.4); pSun.position.set(8, 12, 6); prevScene.add(pSun);
const pRim = new THREE.DirectionalLight(0x9aff8a, 1.0); pRim.position.set(-8, 3, -10); prevScene.add(pRim);
const prevCam = new THREE.PerspectiveCamera(30, 2, 0.1, 200);
let prevModel = null;
const prevSky = makeSkyTexture([[0, '#4f6f92'], [0.42, '#c9d6de'], [0.5, '#a8987e'], [1, '#3a3630']]);
prevSky.mapping = THREE.EquirectangularReflectionMapping;
const prevEnv = new THREE.PMREMGenerator(prevRenderer).fromEquirectangular(prevSky).texture;

function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
      for (const k of ['map', 'emissiveMap']) if (m[k]) m[k].dispose();
      m.dispose();
    });
  });
}
function rebuildPreview() {
  if (prevModel) { prevScene.remove(prevModel.group); disposeObject(prevModel.group); }
  setVehicleEnv(prevEnv);
  if (settings.role === 'pilot') {
    prevModel = new Helicopter({ theme: settings.map, withHpBar: false });
    prevCam.position.set(15, 5, 16); prevCam.lookAt(0, -0.2, -2.6);
  } else {
    prevModel = new Tank({ typeKey: 'elite', theme: settings.map, friendly: true, model: settings.vehicle });
    prevCam.position.set(12, 5.5, 13); prevCam.lookAt(0, 1.4, 0.8);
  }
  prevScene.add(prevModel.group);
}
function previewLoop(t) {
  if (!menuActive) return;
  requestAnimationFrame(previewLoop);
  const w = prevCanvas.clientWidth, h = prevCanvas.clientHeight, pr = prevRenderer.getPixelRatio();
  if (w && h && (prevCanvas.width !== Math.floor(w * pr) || prevCanvas.height !== Math.floor(h * pr))) {
    prevRenderer.setSize(w, h, false);
    prevCam.aspect = w / h;
    prevCam.updateProjectionMatrix();
  }
  if (prevModel && prevModel.kind === 'heli') {
    prevModel.yaw = t * 0.0004;
    prevModel.roll = Math.sin(t * 0.0009) * 0.12;
    prevModel.pitch = Math.sin(t * 0.0006) * 0.06;
    prevModel.pos.y = Math.sin(t * 0.0015) * 0.4;
    prevModel.syncVisual(1 / 60, t / 1000);
  } else if (prevModel) {
    prevModel.yaw = t * 0.0005;
    prevModel.turretYaw = Math.sin(t * 0.0011) * 0.8;
    prevModel.barrelElev = 0.35 + Math.sin(t * 0.0013) * 0.3;
    prevModel.speed = 4;
    prevModel.syncVisual(1 / 60, t / 1000);
  }
  prevRenderer.render(prevScene, prevCam);
}

/* ------------------------------------------------------------------ */
/*  HUD refs                                                           */
/* ------------------------------------------------------------------ */
const H = {};
['hud', 'hud-obj-title', 'hud-r1-label', 'hud-r1', 'hud-r2-label', 'hud-r2', 'hud-r3-label', 'hud-r3', 'hud-score', 'hud-time',
  'hud-unit-name', 'hud-hp-fill', 'hud-hp-text', 'hud-f1-label', 'hud-f1', 'hud-f1-unit', 'hud-spd', 'hud-hdg', 'hud-vsi-row', 'hud-vsi', 'hud-vsi-text',
  'hud-w1-label', 'hud-missile-fill', 'hud-missile-state', 'hud-missile-pips', 'hud-lock', 'hud-w2-label', 'hud-flares', 'hud-flare-state', 'hud-cam',
  'killfeed', 'center-msg', 'sub-msg', 'warning', 'alt-warning', 'bounds-warning', 'crosshair', 'lock-reticle', 'lock-zone', 'damage-vignette', 'radar',
].forEach((id) => { H[id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())] = $(id); });
H.reticleText = document.querySelector('#lock-reticle span');
H.rc = H.radar.getContext('2d');

/* ------------------------------------------------------------------ */
/*  Shared meshes                                                      */
/* ------------------------------------------------------------------ */
const bulletGeo = new THREE.BoxGeometry(0.14, 0.14, 2.6);
const bulletMatP = new THREE.MeshBasicMaterial({ color: 0xffe27a, toneMapped: false });
const bulletMatE = new THREE.MeshBasicMaterial({ color: 0xff6a4a, toneMapped: false });
const flareGeo = new THREE.SphereGeometry(0.6, 10, 8);
const tracerGeo = new THREE.CylinderGeometry(0.12, 0.05, 7, 8).rotateX(Math.PI / 2);   // streak ≈ distance covered per frame
const tracerMat = new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

function makeMissileMesh(bodyColor, noseColor, scale = 1) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.5, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.4, roughness: 0.5 })));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: noseColor, roughness: 0.5 }));
  nose.position.z = 0.97;
  g.add(nose);
  const finMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.35), finMat);
    const a = (i * Math.PI) / 2;
    fin.position.set(Math.sin(a) * 0.18, Math.cos(a) * 0.18, -0.55);
    fin.rotation.z = a;
    g.add(fin);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.2, 8).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, toneMapped: false }));
  flame.position.z = -1.3;
  g.add(flame);
  g.userData.flame = flame;
  g.scale.setScalar(scale);
  return g;
}

/* ------------------------------------------------------------------ */
/*  Lifecycle                                                          */
/* ------------------------------------------------------------------ */
let G = null;
let paused = false;

async function startMission() {
  $('loading').classList.remove('hidden');
  try { await Promise.race([document.fonts.load('64px "Black Ops One"'), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* ignore */ }
  await new Promise((r) => setTimeout(r, 30));
  sfx.init();
  if (G) disposeGame();
  menuActive = false;
  ['menu', 'results', 'pause'].forEach((id) => $(id).classList.add('hidden'));
  H.hud.classList.remove('hidden');
  document.body.classList.add('in-game');
  G = createGame({ ...settings });
  setupHud();
  paused = false;
  mouse.down = false;
  clock.getDelta();
  if (G.role === 'pilot') sfx.startRotor();
  $('loading').classList.add('hidden');
}

function backToMenu() {
  if (G) disposeGame();
  paused = false;
  sfx.stopRotor();
  ['results', 'pause'].forEach((id) => $(id).classList.add('hidden'));
  H.hud.classList.add('hidden');
  document.body.classList.remove('in-game');
  $('menu').classList.remove('hidden');
  menuActive = true;
  requestAnimationFrame(previewLoop);
}

function togglePause() {
  if (!G || G.state === 'over') return;
  paused = !paused;
  $('pause').classList.toggle('hidden', !paused);
  document.body.classList.toggle('in-game', !paused);
  sfx.setRotor(paused ? 0 : 1);
  mouse.down = false;
  if (!paused) clock.getDelta();
}

function disposeGame() {
  sfx.stopRotor();
  disposeObject(G.scene);
  renderer.renderLists.dispose();
  H.killfeed.innerHTML = '';
  G = null;
}

const THEME_TANK = {
  desert: { standard: 0xb59a6a, heavy: 0x8f7a52, elite: 0x6e5a40, ally: 0x7c8a4a },
  city: { standard: 0x56604f, heavy: 0x45493f, elite: 0x3a3a3e, ally: 0x4a5a48 },
};

function createGame(cfg) {
  const scene = new THREE.Scene();
  const world = buildWorld(scene, cfg.map);
  // Sky reflections on vehicle paint, glass and metal
  if (envRT) envRT.dispose();
  const skyEq = world.skyTex.clone();
  skyEq.mapping = THREE.EquirectangularReflectionMapping;
  skyEq.needsUpdate = true;
  envRT = pmrem.fromEquirectangular(skyEq);
  setVehicleEnv(envRT.texture);
  G = {
    cfg, role: cfg.role, scene, world, effects: new Effects(scene),
    tanks: [], helis: [], player: null,
    bullets: [], flak: [], missiles: [], decoys: [], debris: [],
    spawnQueue: [], heliQueue: [],
    state: 'play', time: 0, endTimer: 0, endFail: null, endReason: '', crashed: false,
    destroyed: 0, escaped: 0, score: 0, total: 0,
    helisDown: 0, helisTotal: 0, alliesEscaped: 0, alliesLost: 0, wingmen: 0, wingmenLost: 0,
    gunT: 0, secT: 0, decoyT: 0, decoyCharges: 0, decoyRegen: 0, decoyBurst: 0,
    shots: 0, hits: 0, secFired: 0, decoysUsed: 0, decoyed: 0,
    lockTarget: null, lockT: 0, locked: false, lockBeepT: 0,
    aim: new THREE.Vector3(), camLook: new THREE.Vector3(), camYaw: 0, camMode: 0, camOrbit: 0,
    shake: 0, vignette: 0, msgT: 0, subT: 0, warnBeepT: 0,
    ray: new THREE.Raycaster(),
  };

  if (cfg.role === 'pilot') {
    const heli = new Helicopter({ theme: cfg.map, variant: 'player', label: 'VIPER-1' });
    heli.isPlayer = true;
    heli.pos.set(0, world.heightAt(0, -150) + 55, -150);
    heli.yaw = Math.PI;
    scene.add(heli.group, heli.hpSprite);
    G.helis.push(heli);
    G.player = heli;
    G.comp = composition(cfg.tanks);
    G.total = cfg.tanks;
    G.decoyCharges = FLARE_MAX;
    G.missileAmmo = MISSILE_MAX;
    G.missileRegen = 0;
    const c = G.comp;
    const types = [...Array(c.elite).fill('elite'), ...Array(c.heavy).fill('heavy'), ...Array(c.standard).fill('standard')];
    for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; }
    let t = 0;
    G.spawnQueue = types.map((type, i) => { t += i < 3 ? (i ? 2.5 : 0) : rand(8, 12) * (cfg.tanks > 8 ? 0.7 : 1); return { type, time: t }; });
    // AI Apache wingmen fly with you (Helicopters slider includes your own aircraft)
    aiHeliNum = 0;
    G.wingmen = cfg.helis - 1;
    for (let i = 0; i < G.wingmen; i++) spawnAIHeli(true, i);
  } else {
    // Player's chosen vehicle leads a convoy of allied tanks toward extraction (Tanks slider includes you)
    const pal = THEME_TANK[cfg.map];
    const startZ = FIELD.spawnZ + 60;
    G.pv = PLAYER_VEHICLES[cfg.vehicle] || PLAYER_VEHICLES.tunguska;
    const player = new Tank({ typeKey: 'elite', color: pal.ally, stripe: 0x7cff6b, theme: cfg.map, seed: 3, label: 'YOU', friendly: true, hp: G.pv.hp, model: cfg.vehicle });
    player.isPlayer = true;
    placeTank(player, 0, startZ);
    G.player = player;
    // Allies form up in rows of three behind the player (city: on the avenues)
    const cols = world.lanes ? [-90, 90, 0, -180, 180] : [-45, 45, 0, -90, 90];
    for (let i = 0; i < cfg.tanks - 1; i++) {
      const type = i % 3 === 1 ? 'heavy' : 'standard';
      const x = cols[i % cols.length] + (world.lanes ? 0 : rand(-6, 6));
      const z = startZ - 25 - Math.floor(i / cols.length) * 30 - (i % cols.length >= 2 ? 12 : 0);
      const a = new Tank({ typeKey: type, color: pal.ally, stripe: 0x7cff6b, theme: cfg.map, seed: 20 + i, label: `ALLY ${i + 1}`, friendly: true, hp: TANK_HP_ALLY[type] });
      placeTank(a, x, z);
      a.route = makeRoute(x);
      a.wi = 0;
    }
    aiHeliNum = 0;
    G.helisTotal = cfg.helis;
    let t = 0;
    const gap = cfg.helis > 8 ? [8, 13] : [12, 20];
    for (let i = 0; i < G.helisTotal; i++) { G.heliQueue.push(t); t += i < 1 ? 4 : rand(gap[0], gap[1]); }
    G.decoyCharges = SMOKE_MAX;
  }

  const p = G.player;
  G.camYaw = p.yaw;
  camera.position.copy(p.pos).addScaledVector(p.forward, -25).add(new THREE.Vector3(0, 10, 0));
  G.camLook.copy(p.pos);
  camera.lookAt(G.camLook);
  return G;
}

function placeTank(t, x, z) {
  t.pos.set(x, G.world.heightAt(x, z), z);
  t.yaw = 0;
  t.fireT = rand(2, 4);
  t.samT = rand(6, 10);
  t.smokeT = 0;
  t.dustT = 0;
  G.scene.add(t.group, t.hpSprite);
  G.tanks.push(t);
}

/* ------------------------------------------------------------------ */
/*  HUD setup / messages                                               */
/* ------------------------------------------------------------------ */
function setupHud() {
  const pilot = G.role === 'pilot';
  H.hudObjTitle.textContent = pilot ? 'CONVOY' : 'MISSION: EXTRACT';
  H.hudR1Label.textContent = pilot ? 'DESTROYED' : 'GUNSHIPS DOWN';
  H.hudR2Label.textContent = pilot ? 'ESCAPED' : 'ALLIES ALIVE';
  H.hudR3Label.textContent = pilot ? 'ON MAP' : 'EXTRACTION';
  const hasSam = !pilot && G.pv.sam;
  H.hudUnitName.textContent = pilot ? 'VIPER-1 HULL' : `${G.pv.short} HULL`;
  H.hudF1Label.textContent = pilot ? 'ALT' : 'ELV';
  H.hudF1Unit.textContent = pilot ? 'm' : '°';
  H.hudVsiRow.classList.toggle('hidden', !pilot);
  H.hudW1Label.textContent = pilot ? 'MISSILE' : hasSam ? 'SAM' : 'MAIN GUN';
  H.hudW2Label.textContent = pilot ? 'FLARES' : 'SMOKE';
  H.warning.innerHTML = `&#9888; MISSILE INCOMING &mdash; PRESS F ${pilot ? '(FLARES)' : '(SMOKE)'}`;
  H.hudFlares.innerHTML = '<i></i>'.repeat(pilot ? FLARE_MAX : SMOKE_MAX);
  H.hudMissilePips.innerHTML = '<i></i>'.repeat(MISSILE_MAX);
  H.hudMissilePips.classList.toggle('hidden', !pilot);
  H.lockZone.classList.toggle('hidden', !hasSam);
  if (!pilot && !hasSam) { H.hudLock.textContent = 'AIRBURST ROUND'; H.hudLock.className = 'lock-state locking'; }
  H.hudCam.textContent = CAM_MODES[G.role][0];
  showCenter(pilot ? 'STOP THE CONVOY' : 'REACH EXTRACTION', 3);
}
function showCenter(text, dur = 1.5) { H.centerMsg.textContent = text; H.centerMsg.classList.add('show'); G.msgT = dur; }
function showSub(text, dur = 1.5) { H.subMsg.textContent = text; H.subMsg.classList.add('show'); G.subT = dur; }
function addKillfeed(html) {
  const d = document.createElement('div');
  d.className = 'kf';
  d.innerHTML = html;
  H.killfeed.appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; }, 3500);
  setTimeout(() => d.remove(), 4100);
  while (H.killfeed.children.length > 5) H.killfeed.firstChild.remove();
}
const volAt = (p) => clamp(1 - camera.position.distanceTo(p) / 450, 0, 1);

function cycleCamera() {
  const modes = CAM_MODES[G.role];
  G.camMode = (G.camMode + 1) % modes.length;
  H.hudCam.textContent = modes[G.camMode];
  showSub(`CAMERA: ${modes[G.camMode]}`, 1);
}

/* ------------------------------------------------------------------ */
/*  Tanks (shared AI + ground handling)                                */
/* ------------------------------------------------------------------ */
function makeRoute(x0) {
  const W = G.world, pts = [];
  if (W.lanes) {
    let lane = W.lanes.reduce((bi, lx, i) => (Math.abs(lx - x0) < Math.abs(W.lanes[bi] - x0) ? i : bi), 0);
    const off = rand(-5, 5);
    for (const sz of W.streets) {
      if (Math.random() < 0.35) {
        pts.push(new THREE.Vector3(W.lanes[lane] + off, 0, sz));
        lane = clamp(lane + (Math.random() < 0.5 ? -1 : 1), 0, W.lanes.length - 1);
        pts.push(new THREE.Vector3(W.lanes[lane] + off, 0, sz));
      }
    }
    pts.push(new THREE.Vector3(W.lanes[lane] + off, 0, FIELD.escapeZ + 80));
  } else {
    let x = x0;
    for (let z = FIELD.spawnZ + 130; z < FIELD.escapeZ; z += 130) {
      x = clamp(x + rand(-70, 70), -165, 165);
      pts.push(new THREE.Vector3(x, 0, z));
    }
    pts.push(new THREE.Vector3(x, 0, FIELD.escapeZ + 80));
  }
  return pts;
}

function spawnEnemyTank(type) {
  const W = G.world, pal = THEME_TANK[G.cfg.map];
  const t = new Tank({ typeKey: type, color: pal[type], stripe: type === 'elite' ? 0xff3a2a : 0xffc040, theme: G.cfg.map, seed: G.tanks.length * 13 + 7 });
  const x0 = W.lanes ? W.lanes[Math.floor(Math.random() * W.lanes.length)] + rand(-5, 5) : rand(-150, 150);
  placeTank(t, x0, FIELD.spawnZ - rand(0, 20));
  t.route = makeRoute(x0);
  t.wi = 0;
}

function groundFollow(t) {
  const W = G.world, f = t.forward, l = _v1.set(Math.cos(t.yaw), 0, -Math.sin(t.yaw));
  const hf = W.heightAt(t.pos.x + f.x * 2.5, t.pos.z + f.z * 2.5), hb = W.heightAt(t.pos.x - f.x * 2.5, t.pos.z - f.z * 2.5);
  const hl = W.heightAt(t.pos.x + l.x * 1.6, t.pos.z + l.z * 1.6), hr = W.heightAt(t.pos.x - l.x * 1.6, t.pos.z - l.z * 1.6);
  t.pos.y = (hf + hb + hl + hr) / 4;
  t.groundPitch += (-Math.atan2(hf - hb, 5) - t.groundPitch) * 0.3;
  t.groundRoll += (Math.atan2(hl - hr, 3.2) - t.groundRoll) * 0.3;
}

function separateTank(t) {
  for (const o of G.tanks) {
    if (o === t || o.escaped) continue;
    const dx = t.pos.x - o.pos.x, dz = t.pos.z - o.pos.z, d = Math.hypot(dx, dz), min = t.radius + o.radius;
    if (d > 0.01 && d < min) {
      const push = (min - d) * (o.alive ? 0.5 : 1);
      t.pos.x += (dx / d) * push; t.pos.z += (dz / d) * push;
      if (t.isPlayer) t.speed *= 0.97;
    }
  }
  for (const b of G.world.buildings) {
    const r = t.radius;
    if (t.pos.x < b.min.x - r || t.pos.x > b.max.x + r || t.pos.z < b.min.z - r || t.pos.z > b.max.z + r) continue;
    const pen = [[t.pos.x - (b.min.x - r), 'x', -1], [(b.max.x + r) - t.pos.x, 'x', 1], [t.pos.z - (b.min.z - r), 'z', -1], [(b.max.z + r) - t.pos.z, 'z', 1]].sort((a, c) => a[0] - c[0])[0];
    t.pos[pen[1]] += pen[0] * pen[2];
    t.speed *= 0.9;
  }
}

function tankDust(t, dt) {
  if (G.world.theme !== 'desert' || Math.abs(t.speed) < 3) return;
  t.dustT -= dt;
  if (t.dustT <= 0) { t.dustT = 0.15; G.effects.dust(_v2.copy(t.pos).addScaledVector(t.forward, -3 * t.stats.scale).setY(t.pos.y + 0.6), G.world.dustColor); }
}

function nearestHeli(from, range) {
  let best = null, bd = range;
  for (const h of G.helis) {
    if (!h.alive) continue;
    const d = h.pos.distanceTo(from);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}

function updateTankAI(t, dt) {
  const wp = t.route[t.wi];
  if (wp) {
    const dx = wp.x - t.pos.x, dz = wp.z - t.pos.z;
    if (dx * dx + dz * dz < 100 && t.wi < t.route.length - 1) t.wi++;
    const diff = wrapAngle(Math.atan2(dx, dz) - t.yaw);
    t.yaw += clamp(diff, -1.1 * dt, 1.1 * dt);
    const target = t.stats.speed * (Math.abs(diff) > 0.6 ? 0.35 : 1);
    t.speed += clamp(target - t.speed, -8 * dt, 4 * dt);
  }
  t.pos.x += Math.sin(t.yaw) * t.speed * dt;
  t.pos.z += Math.cos(t.yaw) * t.speed * dt;
  separateTank(t);
  groundFollow(t);
  tankDust(t, dt);
  if (t.pos.z > FIELD.escapeZ) { tankEscaped(t); return; }

  // Anti-air: engage the nearest helicopter
  const muzzleBase = _v2.set(t.pos.x, t.pos.y + 2.5 * t.stats.scale, t.pos.z);
  const target = nearestHeli(muzzleBase, FLAK_RANGE + 80);
  let wantYaw = 0, wantElev = 0.05, dist = Infinity;
  if (target) {
    const toH = _v3.copy(target.pos).sub(muzzleBase);
    dist = toH.length();
    wantYaw = wrapAngle(Math.atan2(toH.x, toH.z) - t.yaw);
    wantElev = clamp(Math.atan2(toH.y, Math.hypot(toH.x, toH.z)), 0, 1.25);
  }
  const yd = wrapAngle(wantYaw - t.turretYaw);
  t.turretYaw = wrapAngle(t.turretYaw + clamp(yd, -1.4 * dt, 1.4 * dt));
  t.barrelElev += clamp(wantElev - t.barrelElev, -0.8 * dt, 0.8 * dt);
  t.fireT -= dt;
  t.samT -= dt;
  if (G.state !== 'play' || !target) return;
  const aligned = Math.abs(yd) < 0.15 && Math.abs(wantElev - t.barrelElev) < 0.12;
  if (t.stats.sam) {
    // Tunguska: bursts from the twin 30 mm autocannons
    t.burstT = (t.burstT ?? rand(1, 2)) - dt;
    if (t.bursting > 0) {
      t.bursting -= dt;
      t.gunT = (t.gunT || 0) - dt;
      if (t.gunT <= 0 && dist < FLAK_RANGE && aligned) {
        t.gunT = 0.1;
        fireTankGun(t, target.pos.clone().addScaledVector(target.vel, dist / TGUN_SPEED), 0.06, TGUN_DMG_AI);
      }
    } else if (t.burstT <= 0 && dist < FLAK_RANGE && aligned) {
      t.bursting = rand(1.0, 1.6);
      t.burstT = rand(2.5, 4);
    }
  } else if (dist < FLAK_RANGE && t.fireT <= 0 && aligned) {
    fireTankShell(t, target, dist);
    t.fireT = rand(t.stats.fire[0], t.stats.fire[1]) * (t.friendly ? 1.3 : 1);
  }
  if (t.stats.sam && t.samT <= 0 && dist < SAM_RANGE && dist > 45) {
    launchMissile(t, target, 'sam');
    t.samT = rand(10, 15);
  }
}

function tankEscaped(t) {
  t.escaped = true;
  t.alive = false;
  G.scene.remove(t.group, t.hpSprite);
  if (G.role === 'pilot') {
    G.escaped++;
    addKillfeed(`<span class="v">${t.label}</span> reached the escape zone`);
    showSub(`TANK ESCAPED (${G.escaped}/${G.comp.allowed} MAX)`, 2);
    sfx.beep(300, 0.3, 0.15);
    if (G.escaped > G.comp.allowed) endMission(false, 'Too many tanks escaped the valley.');
  } else {
    G.alliesEscaped++;
    G.score += 150;
    addKillfeed(`<b>${t.label}</b> reached extraction &nbsp;+150`);
  }
}

/* ------------------------------------------------------------------ */
/*  Player tank                                                        */
/* ------------------------------------------------------------------ */
function updatePlayerTank(t, dt) {
  const thr = (isKey('KeyW', 'ArrowUp') ? 1 : 0) - (isKey('KeyS', 'ArrowDown') ? 1 : 0);
  const steer = (isKey('KeyA', 'ArrowLeft') ? 1 : 0) - (isKey('KeyD', 'ArrowRight') ? 1 : 0);
  if (thr > 0) t.speed += 9 * dt;
  else if (thr < 0) t.speed -= (t.speed > 0 ? 18 : 6) * dt;
  else t.speed -= t.speed * 1.2 * dt;
  t.speed = clamp(t.speed, -6, G.pv.speed);
  // Tracks take a moment to bite: steering eases in
  t.steerS = (t.steerS || 0) + (steer - (t.steerS || 0)) * Math.min(1, dt * 4);
  t.yaw += t.steerS * 0.95 * dt * clamp(Math.abs(t.speed) / 5, 0.55, 1) * (t.speed < -0.5 ? -1 : 1);
  t.pos.x += Math.sin(t.yaw) * t.speed * dt;
  t.pos.z += Math.cos(t.yaw) * t.speed * dt;
  t.pos.x = clamp(t.pos.x, G.world.lanes ? -230 : -200, G.world.lanes ? 230 : 200);
  t.pos.z = clamp(t.pos.z, -880, 880);
  separateTank(t);
  groundFollow(t);
  tankDust(t, dt);

  // Turret and gun track the mouse aim at realistic traverse / elevation rates
  const base = _v2.set(t.pos.x, t.pos.y + 2.5 * t.stats.scale, t.pos.z);
  const to = _v3.copy(G.aim).sub(base);
  const wantYaw = wrapAngle(Math.atan2(to.x, to.z) - t.yaw);
  const wantElev = clamp(Math.atan2(to.y, Math.hypot(to.x, to.z)), -0.08, 1.3);
  t.turretYaw = wrapAngle(t.turretYaw + clamp(wrapAngle(wantYaw - t.turretYaw), -1.5 * dt, 1.5 * dt));
  t.barrelElev += clamp(wantElev - t.barrelElev, -1.0 * dt, 1.0 * dt);

  if (t.pos.z > FIELD.escapeZ && G.state === 'play') {
    G.score += 500 + Math.round(t.hp);
    showCenter('EXTRACTED!', 3);
    G.state = 'ending';
    G.endTimer = 2.5;
    G.endFail = null;
    G.endReason = 'You broke through the gunship screen and reached extraction.';
  }
}

/** Player Tunguska: rapid-fire 30 mm rounds along the barrel's actual line (the turret must slew onto target). */
function firePlayerAutocannon(t) {
  const a = t.yaw + t.turretYaw, e = t.barrelElev;
  const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
  const muzzle = t.muzzles[t.muzzleIdx % t.muzzles.length].getWorldPosition(new THREE.Vector3());
  fireTankGun(t, muzzle.addScaledVector(dir, 300), 0.01, TGUN_DMG_PLAYER);
}

/**
 * Main-gun round for tanks without missiles: a very fast (≈550 m/s) programmable airburst shell.
 * Fuses at the aimed range or as soon as it passes close to a gunship; much bigger blast than flak.
 */
function fireMainGun(t) {
  const g = G.pv.gun;
  const origin = t.muzzleWorld(new THREE.Vector3());
  const a = t.yaw + t.turretYaw, e = t.barrelElev;
  const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
  dir.x += (Math.random() - 0.5) * 0.004; dir.y += (Math.random() - 0.5) * 0.004; dir.z += (Math.random() - 0.5) * 0.004;
  dir.normalize();
  const fuse = clamp(origin.distanceTo(G.aim) / g.speed + 0.02, 0.08, 2.2);
  const mesh = new THREE.Mesh(tracerGeo, tracerMat);
  mesh.position.copy(origin);
  mesh.lookAt(_v1.copy(origin).add(dir));
  G.scene.add(mesh);
  G.flak.push({ mesh, vel: dir.clone().multiplyScalar(g.speed), fuse, owner: t, direct: g.direct, splash: g.splash, prox: g.prox, splashR: 16, big: true, smokeT: 0 });
  t.recoil = 1;
  G.shots++;
  // Heavy muzzle blast: flash, smoke ring, dust kicked up off the ground
  G.effects.add({ pos: origin.clone().addScaledVector(dir, 1.2), size: 1.8, grow: 1.4, life: 0.12, color: 0xfff0b0, basic: true, additive: true });
  for (let i = 0; i < 6; i++) G.effects.smoke(origin.clone().addScaledVector(dir, 1 + i * 0.6), 0x9a948a, 1.2, 1.6, 0.6);
  for (let i = 0; i < 8; i++) {
    const k = (i / 8) * Math.PI * 2;
    const p = new THREE.Vector3(t.pos.x + Math.cos(k) * 4, t.pos.y + 0.4, t.pos.z + Math.sin(k) * 4);
    G.effects.add({ pos: p, vel: new THREE.Vector3(Math.cos(k) * 9, 1, Math.sin(k) * 9), size: 1.2, grow: 2.5, life: 0.9, color: G.world.dustColor, opacity: 0.4, geo: G.effects.ico, drag: 2 });
  }
  sfx.explosion(0.55, false);
  sfx._tone(0.25, 0.35, 70, 30, 'sine');
  G.shake = Math.max(G.shake, 0.35);
}

function updatePlayerLock(dt) {
  if (!G.pv.sam) { G.lockTarget = null; G.locked = false; H.lockReticle.classList.add('hidden'); return; }
  const p = G.player;
  let best = null, bestD = Infinity, bx = 0, by = 0;
  if (p.alive && G.state === 'play') {
    for (const h of G.helis) {
      if (!h.alive || h.pos.distanceTo(p.pos) > LOCK_RANGE) continue;
      const sp = projectToScreen(h.pos);
      if (!sp) continue;
      const sd = Math.hypot(sp[0] - mouse.x, sp[1] - mouse.y);
      const rad = h === G.lockTarget ? LOCK_RADIUS * 1.4 : LOCK_RADIUS;
      if (sd < rad && sd < bestD) { bestD = sd; best = h; bx = sp[0]; by = sp[1]; }
    }
  }
  if (best) {
    if (best !== G.lockTarget) { G.lockTarget = best; G.lockT = 0; G.locked = false; }
    else G.lockT += dt;
    const locked = G.lockT >= LOCK_TIME;
    if (locked && !G.locked) sfx.beep(1500, 0.14, 0.12);
    G.locked = locked;
    if (!locked) { G.lockBeepT -= dt; if (G.lockBeepT <= 0) { sfx.beep(950, 0.04, 0.07); G.lockBeepT = 0.12; } }
    const size = locked ? 60 : 60 + (1 - G.lockT / LOCK_TIME) * 70;
    H.lockReticle.classList.remove('hidden');
    H.lockReticle.classList.toggle('locking', !locked);
    H.lockReticle.style.left = bx + 'px';
    H.lockReticle.style.top = by + 'px';
    H.lockReticle.style.width = H.lockReticle.style.height = size + 'px';
    H.reticleText.textContent = locked ? `LOCKED · ${Math.round(best.pos.distanceTo(p.pos))}m` : 'LOCKING';
    H.hudLock.textContent = locked ? 'SAM LOCKED — SPACE' : 'LOCKING…';
    H.hudLock.className = 'lock-state ' + (locked ? 'locked' : 'locking');
  } else {
    G.lockTarget = null; G.lockT = 0; G.locked = false;
    H.lockReticle.classList.add('hidden');
    H.hudLock.textContent = 'NO LOCK';
    H.hudLock.className = 'lock-state';
  }
}

/* ------------------------------------------------------------------ */
/*  Player helicopter: inertial flight model                           */
/* ------------------------------------------------------------------ */
function updatePlayerHeli(h, dt) {
  const W = G.world;
  if (h.crashed) return;
  if (h.alive) {
    const fwd = (isKey('KeyW', 'ArrowUp') ? 1 : 0) - (isKey('KeyS', 'ArrowDown') ? 1 : 0);
    const turn = (isKey('KeyA', 'ArrowLeft') ? 1 : 0) - (isKey('KeyD', 'ArrowRight') ? 1 : 0);
    const vert = (isKey('KeyE') ? 1 : 0) - (isKey('KeyQ') ? 1 : 0);
    // Controls ease in/out instead of snapping
    h.cF += (fwd - h.cF) * Math.min(1, dt * 2.0);
    h.cT += (turn - h.cT) * Math.min(1, dt * 1.8);
    h.cV += (vert - h.cV) * Math.min(1, dt * 1.4);

    const f = h.forward, l = h.left;
    const vF = h.vel.x * f.x + h.vel.z * f.z;
    const speedF = clamp(Math.abs(vF) / 35, 0, 1);
    // Attitude lags the stick: the rotor disc tilts first, then the aircraft accelerates
    const targetPitch = h.cF * 0.28;
    const targetRoll = -h.cT * (0.06 + 0.42 * speedF);
    h.pitch += (targetPitch - h.pitch) * Math.min(1, dt * 1.6);
    h.roll += (targetRoll - h.roll) * Math.min(1, dt * 1.6);
    // Yaw: pedal turn when hovering, bank-coordinated turn at speed; the rate builds up gradually
    const targetYawRate = h.cT * 0.78 * (1 - speedF) + (-h.roll) * 1.5 * speedF;
    h.yawRate += (targetYawRate - h.yawRate) * Math.min(1, dt * 1.5);
    h.yaw += h.yawRate * dt;
    // Thrust from the tilted disc
    const accF = (h.pitch / 0.28) * 24;
    h.vel.x += f.x * accF * dt;
    h.vel.z += f.z * accF * dt;
    const drag = Math.exp(-0.42 * dt);
    h.vel.x *= drag; h.vel.z *= drag;
    // Weathervaning: sideslip slowly bleeds into the heading
    const vL = h.vel.x * l.x + h.vel.z * l.z;
    h.vel.x -= l.x * vL * Math.min(1, dt * 0.9);
    h.vel.z -= l.z * vL * Math.min(1, dt * 0.9);
    // Collective: vertical speed builds and decays smoothly; hard banking costs a little lift
    const targetVy = h.cV * 15.5 - Math.abs(h.roll) * 3;
    h.vel.y += (targetVy - h.vel.y) * Math.min(1, dt * 1.1);
    h.pos.addScaledVector(h.vel, dt);
  } else {
    h.vel.y -= 22 * dt;
    h.vel.x *= Math.exp(-0.5 * dt); h.vel.z *= Math.exp(-0.5 * dt);
    h.yaw += h.deadSpin * dt;
    h.roll += (0.5 - h.roll) * dt;
    h.pitch += (0.3 - h.pitch) * dt;
    h.rotorSpeed = Math.max(0.25, h.rotorSpeed - dt * 0.2);
    h.pos.addScaledVector(h.vel, dt);
    if (Math.random() < dt * 30) G.effects.smoke(h.pos, 0x1c1a19, 1.4, 2.5, 2);
    if (Math.random() < dt * 25) G.effects.fire(h.pos);
  }

  const ground = W.heightAt(h.pos.x, h.pos.z) + 2.05;
  if (h.pos.y < ground) {
    if (!h.alive) { heliCrashed(h); return; }
    if (h.vel.y < -10) damageUnit(h, -h.vel.y * 0.8, null);
    h.pos.y = ground;
    h.vel.y = Math.max(0, h.vel.y);
  }
  h.pos.y = Math.min(h.pos.y, FIELD.maxAlt + W.heightAt(h.pos.x, h.pos.z) * 0.3);
  if (heliBuildingCollide(h)) return;
  const out = Math.abs(h.pos.x) > FIELD.boundX || Math.abs(h.pos.z) > FIELD.boundZ;
  if (Math.abs(h.pos.x) > FIELD.boundX) h.vel.x -= Math.sign(h.pos.x) * 30 * dt;
  if (Math.abs(h.pos.z) > FIELD.boundZ) h.vel.z -= Math.sign(h.pos.z) * 30 * dt;
  H.boundsWarning.classList.toggle('hidden', !out || !h.alive);
  heliDownwash(h, dt);
  if (h.alive && h.hp / h.maxHp < 0.35 && Math.random() < dt * 10) G.effects.smoke(h.pos.clone().add(new THREE.Vector3(0, 1.5, -2)), 0x2a2826, 0.7, 1.4, 1);
}

/** Push a helicopter out of buildings; returns true if a falling wreck hit one. */
function heliBuildingCollide(h) {
  for (const b of G.world.buildings) {
    if (h.pos.x < b.min.x - 4 || h.pos.x > b.max.x + 4 || h.pos.z < b.min.z - 4 || h.pos.z > b.max.z + 4 || h.pos.y > b.max.y + 3) continue;
    if (!h.alive) { heliCrashed(h, b.max.y); return true; }
    const pen = [
      [h.pos.x - (b.min.x - 4), 'x', -1], [(b.max.x + 4) - h.pos.x, 'x', 1],
      [h.pos.z - (b.min.z - 4), 'z', -1], [(b.max.z + 4) - h.pos.z, 'z', 1],
      [(b.max.y + 3) - h.pos.y, 'y', 1],
    ].sort((a, c) => a[0] - c[0])[0];
    const impact = Math.abs(h.vel[pen[1]]);
    h.pos[pen[1]] += pen[0] * pen[2];
    h.vel[pen[1]] = pen[1] === 'y' ? Math.max(0, h.vel.y) : -h.vel[pen[1]] * 0.3;
    if (impact > 6 && pen[1] !== 'y') { damageUnit(h, impact * 0.7, null); G.effects.sparks(h.pos); }
  }
  return false;
}

function heliDownwash(h, dt) {
  const W = G.world;
  const agl = h.pos.y - W.heightAt(h.pos.x, h.pos.z);
  if (!h.alive || agl > 28) return;
  h.dustT = (h.dustT || 0) - dt;
  if (h.dustT > 0) return;
  h.dustT = h.isPlayer ? 0.05 : 0.12;
  const a = Math.random() * Math.PI * 2, rr = 4 + Math.random() * 6;
  const p = new THREE.Vector3(h.pos.x + Math.cos(a) * rr, 0, h.pos.z + Math.sin(a) * rr);
  p.y = W.heightAt(p.x, p.z) + 0.6;
  G.effects.add({ pos: p, vel: new THREE.Vector3(Math.cos(a) * 12, 1.5, Math.sin(a) * 12), size: 1, grow: 3, life: 1.0,
    color: W.dustColor, opacity: 0.4 * (1 - agl / 28), geo: G.effects.ico, drag: 1.5 });
}

function heliCrashed(h, surfaceY) {
  if (h.crashed) return;
  h.crashed = true;
  const p = h.pos.clone();
  const gy = surfaceY ?? G.world.heightAt(p.x, p.z);
  G.effects.explosion(p, h.isPlayer ? 2.4 : 2, gy);
  sfx.explosion(Math.max(0.4, volAt(p)), true);
  G.shake = Math.max(G.shake, h.isPlayer ? 1.2 : 0.6 * volAt(p));
  // Leave a burning wreck where it came down
  h.pos.y = gy + 1.2;
  h.vel.set(0, 0, 0);
  h.pitch = 0.15; h.roll = 1.1;
  h.rotorSpeed = 0;
  h.wreck();
  h.smokeT = 25;
  h.syncVisual(0, G.time);
  if (h.isPlayer) {
    sfx.stopRotor();
    G.state = 'ending';
    G.endTimer = 2.6;
    G.endFail = 'Viper-1 was shot down.';
  }
}

/* ------------------------------------------------------------------ */
/*  AI gunships (Tank Commander mode)                                  */
/* ------------------------------------------------------------------ */
let aiHeliNum = 0;
/** AI-flown Apache: an enemy gunship (Tank Commander) or a friendly wingman (Gunship Pilot). */
function spawnAIHeli(friendly = false, slot = 0) {
  aiHeliNum++;
  const h = friendly
    ? new Helicopter({ theme: G.cfg.map, variant: 'player', label: `WINGMAN ${aiHeliNum}`, number: `070${12 + aiHeliNum}`, hp: AIH_HP + 60 })
    : new Helicopter({ theme: G.cfg.map, variant: 'enemy', label: `GUNSHIP ${aiHeliNum}`, number: `R${aiHeliNum}`, hp: AIH_HP });
  h.friendly = friendly;
  if (friendly) {
    // Echelon formation beside the player
    const side = slot % 2 ? 1 : -1, rank = Math.floor(slot / 2) + 1;
    const x = side * rank * 22, z = -150 + rank * 14;
    h.pos.set(x, G.world.heightAt(x, z) + 55 + rand(-4, 4), z);
  } else {
    const x = rand(-150, 150), z = FIELD.boundZ - 20 - rand(0, 60);
    h.pos.set(x, G.world.heightAt(x, z) + (G.world.lanes ? 170 : 70), z);
  }
  h.yaw = Math.PI;
  h.vel.copy(h.forward).multiplyScalar(25);
  h.orbitA = rand(0, Math.PI * 2);
  h.orbitDir = Math.random() < 0.5 ? -1 : 1;
  h.standoff = rand(110, 170);
  h.altOff = rand(-10, 15);
  h.gunT = 0; h.burstT = rand(1, 3); h.bursting = 0;
  h.missileT = rand(4, 7);        // first launch after settling into the fight
  h.ammo = MISSILE_MAX;
  h.ammoRegen = 0;
  h.flareCharges = 2;
  h.retarget = 0;
  G.scene.add(h.group, h.hpSprite);
  G.helis.push(h);
  if (!friendly) {
    addKillfeed(`<span class="v">${h.label}</span> inbound`);
    sfx.beep(420, 0.25, 0.12);
  }
}

function pickGroundTarget(h) {
  let best = null, bs = Infinity;
  for (const t of G.tanks) {
    if (!t.alive) continue;
    const s = t.pos.distanceTo(h.pos) - (t.isPlayer ? 40 : 0);
    if (s < bs) { bs = s; best = t; }
  }
  return best;
}

function updateHeliAI(h, dt) {
  const W = G.world;
  if (!h.alive) {
    if (h.crashed) return;
    h.vel.y -= 22 * dt;
    h.yaw += h.deadSpin * dt;
    h.roll += (0.6 - h.roll) * dt;
    h.rotorSpeed = Math.max(0.2, h.rotorSpeed - dt * 0.25);
    h.pos.addScaledVector(h.vel, dt);
    if (Math.random() < dt * 30) G.effects.smoke(h.pos, 0x1c1a19, 1.4, 2.5, 2);
    if (Math.random() < dt * 25) G.effects.fire(h.pos);
    if (h.pos.y < W.heightAt(h.pos.x, h.pos.z) + 1.5) heliCrashed(h);
    else heliBuildingCollide(h);
    return;
  }
  h.retarget -= dt;
  if (h.retarget <= 0 || !h.target || !h.target.alive) { h.retarget = 4; h.target = pickGroundTarget(h); }
  const tgt = h.target;
  const cruise = W.lanes ? 150 : 55;
  const desired = new THREE.Vector3();
  if (tgt) {
    h.orbitA += dt * h.orbitDir * 0.12;
    desired.set(tgt.pos.x + Math.sin(h.orbitA) * h.standoff, 0, tgt.pos.z + Math.abs(Math.cos(h.orbitA)) * h.standoff);
  } else desired.set(h.pos.x, 0, h.pos.z);
  desired.x = clamp(desired.x, W.lanes ? -380 : -190, W.lanes ? 380 : 190);
  desired.z = clamp(desired.z, -FIELD.boundZ, FIELD.boundZ);
  desired.y = W.heightAt(desired.x, desired.z) + cruise + h.altOff;
  const toD = desired.sub(h.pos);
  const dist = toD.length();
  const desVel = toD.normalize().multiplyScalar(Math.min(34, dist * 0.45));
  const acc = desVel.sub(h.vel);
  if (acc.length() > 12) acc.setLength(12);
  h.vel.addScaledVector(acc, dt);
  h.pos.addScaledVector(h.vel, dt);
  const minY = W.heightAt(h.pos.x, h.pos.z) + 8;
  if (h.pos.y < minY) { h.pos.y = minY; h.vel.y = Math.max(0, h.vel.y); }
  heliBuildingCollide(h);

  // Face the target when engaging, otherwise the direction of travel
  const tDist = tgt ? tgt.pos.distanceTo(h.pos) : Infinity;
  const sp = Math.hypot(h.vel.x, h.vel.z);
  const yawT = tgt && tDist < 340 ? Math.atan2(tgt.pos.x - h.pos.x, tgt.pos.z - h.pos.z) : sp > 3 ? Math.atan2(h.vel.x, h.vel.z) : h.yaw;
  h.yawRate += (clamp(wrapAngle(yawT - h.yaw) * 1.2, -0.85, 0.85) - h.yawRate) * Math.min(1, dt * 1.6);
  h.yaw += h.yawRate * dt;
  const f = h.forward, l = h.left;
  const aF = acc.x * f.x + acc.z * f.z, aL = acc.x * l.x + acc.z * l.z;
  const vF = h.vel.x * f.x + h.vel.z * f.z;
  h.pitch += (clamp(aF * 0.025 + vF * 0.003, -0.25, 0.3) - h.pitch) * Math.min(1, dt * 1.8);
  h.roll += (clamp(-aL * 0.035 - h.yawRate * 0.25, -0.5, 0.5) - h.roll) * Math.min(1, dt * 1.8);
  h.cV = clamp(h.vel.y / 14, -1, 1);
  heliDownwash(h, dt);
  if (h.hp / h.maxHp < 0.35 && Math.random() < dt * 8) G.effects.smoke(h.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 0x2a2826, 0.7, 1.4, 1);

  // Weapons (magazine rearms even when no target is around)
  if (h.ammo < MISSILE_MAX) { h.ammoRegen += dt; if (h.ammoRegen >= AIH_REARM) { h.ammoRegen = 0; h.ammo++; } }
  if (!tgt || G.state !== 'play') return;
  const aimP = _v1.set(tgt.pos.x, tgt.pos.y + 1.5, tgt.pos.z);
  h.aimGun(aimP);
  const toT = _v2.copy(aimP).sub(h.pos);
  const ang = Math.abs(wrapAngle(Math.atan2(toT.x, toT.z) - h.yaw));
  h.burstT -= dt;
  if (h.bursting > 0) {
    h.bursting -= dt;
    h.gunT -= dt;
    if (h.gunT <= 0 && ang < 0.5 && tDist < 280) {
      h.gunT = 0.12;
      fireHeliGun(h, aimP.clone().addScaledVector(tgt.forward, (tgt.speed * tDist) / BULLET_SPEED), 0.035, AIH_GUN_DMG);
    }
  } else if (h.burstT <= 0 && tDist < 280 && ang < 0.4) {
    h.bursting = rand(1.0, 1.6);
    h.burstT = rand(2.5, 4.5);
  }
  // Missiles: ripple from the 4-round magazine at whichever tanks are worth a shot
  h.missileT -= dt;
  if (h.missileT <= 0 && h.ammo > 0) {
    const pick = chooseMissileTarget(h);
    if (pick) {
      launchMissile(h, pick, 'hellfire');
      h.ammo--;
      h.missileT = rand(0.5, 0.9);
    } else h.missileT = 0.4;
  }
}

/** Damage already on its way to a tank from friendly missiles in flight. */
function incomingMissileDamage(t) {
  let sum = 0;
  for (const m of G.missiles) if (m.target === t && m.kind === 'hellfire') sum += m.dmg;
  return sum;
}

/**
 * AI missile targeting. Considers tanks in front of the aircraft (the missiles launch forward) at 60–420 m,
 * skips any that missiles already in flight will kill, and ranks the rest by threat and killability.
 * With only one round left, it is kept for a kill shot or a high-value target.
 */
function chooseMissileTarget(h) {
  let best = null, bestScore = -Infinity;
  for (const t of G.tanks) {
    if (!t.alive) continue;
    const d = t.pos.distanceTo(h.pos);
    if (d < 60 || d > 420) continue;
    const off = Math.abs(wrapAngle(Math.atan2(t.pos.x - h.pos.x, t.pos.z - h.pos.z) - h.yaw));
    if (off > 0.7) continue;
    const remaining = t.hp - incomingMissileDamage(t);
    if (remaining <= 0) continue;                                    // already doomed: don't overkill
    const killShot = remaining <= AIH_MISSILE_DMG;
    const highValue = t.stats.sam || t.isPlayer;
    if (h.ammo === 1 && !killShot && !highValue) continue;           // hold the last round
    const score = (t.stats.sam ? 50 : 0) + (t.isPlayer ? 60 : 0) + (killShot ? 40 : 0) + (t === h.target ? 20 : 0) - d * 0.08 - off * 20;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/*  Weapons (shared)                                                   */
/* ------------------------------------------------------------------ */
function computeAim() {
  const W = G.world;
  G.ray.setFromCamera(new THREE.Vector2((mouse.x / window.innerWidth) * 2 - 1, -(mouse.y / window.innerHeight) * 2 + 1), camera);
  const o = G.ray.ray.origin, d = G.ray.ray.direction;
  let best = 900;
  for (const b of W.buildings) {
    const hit = G.ray.ray.intersectBox(b, _v1);
    if (hit) { const dd = hit.distanceTo(o); if (dd < best) best = dd; }
  }
  let prev = 0;
  for (let s = 4; s < best; s += 4) {
    const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s;
    if (y < W.heightAt(x, z)) {
      let lo = prev, hi = s;
      for (let k = 0; k < 6; k++) {
        const m = (lo + hi) / 2;
        if (o.y + d.y * m < W.heightAt(o.x + d.x * m, o.z + d.z * m)) hi = m; else lo = m;
      }
      best = hi;
      break;
    }
    prev = s;
  }
  // Tank mode: snap the aim range to a gunship under the crosshair so flak fuses at the right distance
  if (G.role === 'tank') {
    for (const h of G.helis) {
      if (!h.alive) continue;
      const toH = _v1.copy(h.pos).sub(o);
      const along = toH.dot(d);
      if (along > 0 && along < best && toH.addScaledVector(d, -along).length() < 9) best = along;
    }
  }
  G.aim.copy(o).addScaledVector(d, best);
}

function fireHeliGun(h, target, spread, dmg) {
  const origin = h.gunWorld(new THREE.Vector3());
  const dir = target.clone().sub(origin).normalize();
  dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread;
  dir.normalize();
  const mesh = new THREE.Mesh(bulletGeo, h.isPlayer ? bulletMatP : bulletMatE);
  mesh.position.copy(origin);
  mesh.lookAt(_v1.copy(origin).add(dir));
  G.scene.add(mesh);
  G.bullets.push({ mesh, vel: dir.multiplyScalar(BULLET_SPEED).add(h.vel), life: 1.6, owner: h, dmg });
  if (h.isPlayer) { G.shots++; if (G.shots % 2 === 0) sfx.gun(); } else if (Math.random() < 0.5) sfx._noise(0.06, 0.15 * volAt(origin), 3000, 'bandpass', 900);
  G.effects.add({ pos: origin, size: 0.45, grow: 0.6, life: 0.05, color: 0xffe08a, basic: true, additive: true });
}

function nearestTank(from, range) {
  let best = null, bd = range;
  for (const t of G.tanks) {
    if (!t.alive) continue;
    const d = t.pos.distanceTo(from);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

function fireSecondary() {
  const p = G.player;
  if (!p.alive) return;
  if (G.role === 'tank' && !G.pv.sam) { showSub('NO MISSILES — USE THE MAIN GUN (LEFT-CLICK)', 1.2); sfx.beep(220, 0.1, 0.1); return; }
  if (G.role === 'pilot') {
    if (G.secT > 0) return;                                   // brief gap between individual launches
    if (G.missileAmmo <= 0) { showSub(`MISSILES REARMING — NEXT IN ${Math.ceil(MISSILE_REARM - G.missileRegen)}s`, 0.9); sfx.beep(220, 0.1, 0.1); return; }
    if (!G.lockTarget) { showSub('NO TARGET IN RANGE', 0.8); sfx.beep(220, 0.1, 0.1); return; }
    G.secT = MISSILE_GAP;
    G.missileAmmo--;
    launchMissile(p, G.lockTarget, 'hellfire');              // alternates left / right wing
  } else {
    if (G.secT > 0) { showSub('SAM RELOADING', 0.7); sfx.beep(220, 0.1, 0.1); return; }
    if (!G.locked || !G.lockTarget || !G.lockTarget.alive) { showSub('NO SAM LOCK', 0.8); sfx.beep(220, 0.1, 0.1); return; }
    G.secT = PSAM_COOLDOWN;
    launchMissile(p, G.lockTarget, 'sam');
  }
  G.secFired++;
}

/** kind: 'hellfire' (air → ground) or 'sam' (ground → air) */
function launchMissile(owner, target, kind) {
  const isSam = kind === 'sam';
  let origin, dir;
  if (owner.kind === 'heli') {
    origin = owner.nextMissileTip(new THREE.Vector3());
    dir = owner.forward.add(new THREE.Vector3(0, -0.25, 0)).normalize();
  } else {
    origin = owner.rocketWorld(new THREE.Vector3());
    dir = new THREE.Vector3(0, 1, 0).addScaledVector(owner.forward, 0.3).normalize();
  }
  const mesh = isSam ? makeMissileMesh(0xd8d2c4, owner.friendly ? 0x3a8a2a : 0xc02020, 1.25) : makeMissileMesh(0x6b7058, 0xb8b2a0);
  mesh.position.copy(origin);
  G.scene.add(mesh);
  const player = owner.isPlayer;
  const spec = isSam
    ? { speed: 30, maxSpeed: player ? 150 : 92, accel: player ? 90 : 45, agility: player ? 4.2 : 2.4, dmg: player ? PSAM_DAMAGE : SAM_DAMAGE }
    : { speed: Math.max(40, owner.kind === 'heli' ? owner.vel.length() + 25 : 40), maxSpeed: player ? 170 : 110, accel: player ? 140 : 70, agility: player ? 6 : 2.6, dmg: player ? MISSILE_DAMAGE : AIH_MISSILE_DMG };
  G.missiles.push({ mesh, pos: origin, dir, target, owner, kind, ...spec, age: 0, life: isSam ? 11 : 9, smokeT: 0, reacted: false, burst: G.decoyBurst });
  sfx.missile(player ? 0.9 : 0.4 + volAt(origin) * 0.5);
  if (target === G.player) { sfx.beep(520, 0.3, 0.16); addKillfeed(`<span class="v">${isSam ? 'SAM' : 'MISSILE'} LAUNCH</span> detected`); }
}

/** Flares from helicopters, a smoke screen from tanks. Seduces guided missiles aimed at `unit`. */
function deployDecoys(unit, byPlayer) {
  if (!unit.alive) return;
  if (byPlayer) {
    if (G.decoyCharges <= 0) { showSub(G.role === 'pilot' ? 'FLARES DEPLETED' : 'SMOKE DEPLETED', 0.8); sfx.beep(220, 0.1, 0.1); return; }
    if (G.decoyT > 0) return;
    G.decoyCharges--;
    G.decoyT = FLARE_COOLDOWN;
    G.decoysUsed++;
  }
  G.decoyBurst++;
  const fresh = [];
  if (unit.kind === 'heli') {
    const back = unit.forward.multiplyScalar(-1), left = unit.left;
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1;
      const pos = unit.pos.clone().addScaledVector(left, side * 1.4).addScaledVector(back, 2.2).add(new THREE.Vector3(0, -0.4, 0));
      const vel = unit.vel.clone().multiplyScalar(0.5).addScaledVector(left, side * rand(8, 20)).addScaledVector(back, rand(4, 12)).add(new THREE.Vector3(0, rand(-8, 3), 0));
      const mesh = new THREE.Mesh(flareGeo, new THREE.MeshBasicMaterial({ color: 0xfff4c8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      mesh.position.copy(pos);
      G.scene.add(mesh);
      const d = { kind: 'flare', mesh, pos, vel, life: 4.5, age: 0, alive: true, smokeT: 0, owner: unit };
      G.decoys.push(d); fresh.push(d);
    }
    sfx.flare();
  } else {
    // Smoke grenades: a drifting cloud around the tank that guided missiles home on instead
    for (let i = 0; i < 4; i++) {
      const a = unit.yaw + unit.turretYaw + (i - 1.5) * 0.5;
      const pos = unit.pos.clone().add(new THREE.Vector3(Math.sin(a) * 9, 3, Math.cos(a) * 9));
      const d = { kind: 'smoke', mesh: null, pos, vel: new THREE.Vector3(0, 0.6, 0), life: 8, age: 0, alive: true, smokeT: 0, owner: unit };
      G.decoys.push(d); fresh.push(d);
      for (let k = 0; k < 4; k++) G.effects.smoke(pos, 0xbdb8ae, 3, 4, 1);
    }
    sfx._noise(0.6, 0.35, 900, 'lowpass', 200);
  }
  const p = byPlayer ? 0.88 : 0.72;
  let n = 0;
  for (const m of G.missiles) {
    if (m.target !== unit || m.pos.distanceTo(unit.pos) > 420) continue;
    if (Math.random() < p) { m.target = fresh[Math.floor(Math.random() * fresh.length)]; n++; }
    m.burst = G.decoyBurst;
  }
  if (byPlayer) { G.decoyed += n; if (n) showSub(n > 1 ? `${n} MISSILES DECOYED` : 'MISSILE DECOYED', 1.4); }
}

/** NPC main-gun shot: the same high-velocity airburst shell the player fires, with aiming error. */
function fireTankShell(t, target, dist) {
  const origin = t.muzzleWorld(new THREE.Vector3());
  const tFlight = dist / SHELL_SPEED;
  const err = 4 + dist * 0.05;          // NPC gunners: imperfect range/lead estimation
  const lead = target.pos.clone().addScaledVector(target.vel, tFlight * rand(0.5, 1.2)).add(new THREE.Vector3(rand(-err, err), rand(-err, err), rand(-err, err)));
  const dir = lead.sub(origin).normalize();
  const mesh = new THREE.Mesh(tracerGeo, tracerMat);
  mesh.position.copy(origin);
  mesh.lookAt(_v1.copy(origin).add(dir));
  G.scene.add(mesh);
  G.flak.push({
    mesh, vel: dir.clone().multiplyScalar(SHELL_SPEED), fuse: tFlight + rand(-0.03, 0.06), owner: t,
    direct: t.friendly ? ALLY_SHELL_DIRECT : AI_SHELL_DIRECT, splash: t.friendly ? ALLY_SHELL_SPLASH : AI_SHELL_SPLASH,
    prox: t.friendly ? 6 : 4.5, splashR: 11, big: true, smokeT: 0,
  });
  t.recoil = 1;
  G.effects.add({ pos: origin.clone().addScaledVector(dir, 1.2), size: 1.5, grow: 1.4, life: 0.1, color: 0xfff0b0, basic: true, additive: true });
  G.effects.muzzle(origin, dir);
  sfx.explosion(volAt(origin) * 0.45, false);
}

/** Rapid-fire straight rounds from a tank autocannon (Tunguska), aimed at a world point. */
function fireTankGun(t, target, spread, dmg) {
  const origin = t.muzzleWorld(new THREE.Vector3());
  const dir = target.clone().sub(origin).normalize();
  dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread;
  dir.normalize();
  const mesh = new THREE.Mesh(bulletGeo, t.isPlayer || t.friendly ? bulletMatP : bulletMatE);
  mesh.position.copy(origin);
  mesh.lookAt(_v1.copy(origin).add(dir));
  G.scene.add(mesh);
  G.bullets.push({ mesh, vel: dir.multiplyScalar(TGUN_SPEED), life: 1.6, owner: t, dmg });
  t.recoil = Math.max(t.recoil, 0.6);
  G.effects.add({ pos: origin, size: 0.5, grow: 0.6, life: 0.05, color: 0xffe08a, basic: true, additive: true });
  if (t.isPlayer) { G.shots++; if (G.shots % 2 === 0) sfx.gun(); } else if (Math.random() < 0.4) sfx._noise(0.06, 0.15 * volAt(origin), 3000, 'bandpass', 900);
}

/* ------------------------------------------------------------------ */
/*  Damage                                                             */
/* ------------------------------------------------------------------ */
function damageUnit(u, dmg, attacker) {
  if (!u.alive) return;
  if (u.isPlayer && G.state !== 'play') return;
  u.hit(dmg);
  if (u.isPlayer) {
    G.shake = Math.max(G.shake, Math.min(1, 0.25 + dmg / 40));
    G.vignette = 1;
    sfx.hit(1);
  } else if (attacker && attacker.isPlayer) sfx.hit(0.5);
  if (u.hp <= 0) killUnit(u, attacker);
}

function killUnit(u, attacker) {
  const byPlayer = attacker && attacker.isPlayer;
  if (u.kind === 'tank') {
    u.destroy();
    const c = u.pos.clone(); c.y += 1.5;
    G.effects.explosion(c, 1.7 * u.stats.scale, u.pos.y);
    sfx.explosion(Math.max(0.3, volAt(c)), true);
    G.shake = Math.max(G.shake, 0.4 * volAt(c));
    u.smokeT = 20;
    const tur = u.turret;
    G.scene.attach(tur);
    G.debris.push({ obj: tur, vel: new THREE.Vector3(rand(-5, 5), rand(14, 20), rand(-5, 5)), spin: new THREE.Vector3(rand(-4, 4), rand(-6, 6), rand(-4, 4)), rest: false });
    if (G.role === 'pilot') {
      G.destroyed++;
      const pts = byPlayer ? u.stats.score : Math.round(u.stats.score / 2);   // wingman kills score half
      G.score += pts;
      addKillfeed(`<b>${byPlayer ? 'VIPER-1' : attacker ? attacker.label : 'ALLIES'}</b> destroyed <span class="v">${u.label}</span> &nbsp;+${pts}`);
      if (byPlayer) showSub(`${u.label} DESTROYED`, 1.4);
    } else if (u.isPlayer) {
      showCenter('TANK DESTROYED', 3);
      G.state = 'ending';
      G.endTimer = 3;
      G.endFail = 'Your tank was destroyed before reaching extraction.';
    } else {
      G.alliesLost++;
      addKillfeed(`<span class="v">${u.label}</span> was destroyed`);
    }
  } else {
    u.alive = false;
    u.deadSpin = rand(2.5, 4) * (Math.random() < 0.5 ? -1 : 1);
    if (u.hpSprite) u.hpSprite.visible = false;
    G.effects.explosion(u.pos.clone(), 1.1, -1000);
    sfx.explosion(Math.max(0.3, volAt(u.pos)), false);
    if (u.isPlayer) {
      showCenter('VIPER-1 GOING DOWN', 4);
      G.state = 'crashing';
    } else if (u.friendly) {
      G.wingmenLost++;
      addKillfeed(`<span class="v">${u.label}</span> is going down`);
    } else {
      G.helisDown++;
      G.score += byPlayer ? 300 : 150;
      addKillfeed(`<b>${byPlayer ? 'YOU' : 'ALLIES'}</b> shot down <span class="v">${u.label}</span>${byPlayer ? ' &nbsp;+300' : ''}`);
      if (byPlayer) showSub(`${u.label} SHOT DOWN`, 1.6);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Projectile updates                                                 */
/* ------------------------------------------------------------------ */
function insideBuilding(p) {
  for (const b of G.world.buildings) if (b.containsPoint(p)) return true;
  return false;
}

function updateBullets(dt) {
  const W = G.world;
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.life -= dt;
    const from = _v1.copy(b.mesh.position);
    b.mesh.position.addScaledVector(b.vel, dt);
    const to = b.mesh.position;
    let done = b.life <= 0;
    if (!done && b.owner.kind === 'tank') {
      // Autocannon rounds from tanks hit helicopters
      const seg = _v2.copy(to).sub(from);
      const len2 = seg.lengthSq() || 1;
      for (const h of G.helis) {
        if (!h.alive) continue;
        const k = clamp(_v3.copy(h.pos).sub(from).dot(seg) / len2, 0, 1);
        const cp = from.clone().addScaledVector(seg, k);
        if (cp.distanceTo(h.pos) < h.radius) {
          G.effects.add({ pos: cp, size: 0.7, grow: 1.2, life: 0.1, color: 0xfff0c0, basic: true, additive: true });
          G.effects.sparks(cp);
          if (b.owner.isPlayer) G.hits++;
          damageUnit(h, b.dmg, b.owner);
          done = true;
          break;
        }
      }
    } else if (!done) {
      const seg = _v2.copy(to).sub(from);
      const len2 = seg.lengthSq() || 1;
      for (const t of G.tanks) {
        if (t.escaped) continue;
        const c = _v3.set(t.pos.x, t.pos.y + 1.5 * t.stats.scale, t.pos.z);
        const k = clamp(c.clone().sub(from).dot(seg) / len2, 0, 1);
        const cp = from.clone().addScaledVector(seg, k);
        if (cp.distanceTo(c) < t.radius) {
          G.effects.add({ pos: cp, size: 0.7, grow: 1.2, life: 0.1, color: 0xfff0c0, basic: true, additive: true });
          G.effects.sparks(cp);
          if (t.alive) { if (b.owner.isPlayer) G.hits++; damageUnit(t, b.dmg, b.owner); }
          done = true;
          break;
        }
      }
    }
    if (!done && (to.y < W.heightAt(to.x, to.z) || insideBuilding(to))) {
      const p = to.clone();
      p.y = Math.max(p.y, W.heightAt(p.x, p.z) + 0.3);
      G.effects.add({ pos: p, vel: new THREE.Vector3(0, 3, 0), size: 0.7, grow: 2.5, life: 0.7, color: W.theme === 'desert' ? 0xd8bb88 : 0x77726c, opacity: 0.6, geo: G.effects.ico });
      if (Math.random() < 0.3) G.effects.sparks(p);
      done = true;
    }
    if (done) { G.scene.remove(b.mesh); G.bullets.splice(i, 1); }
  }
}

function flakBurst(s, p, direct) {
  const R = s.splashR || 11;
  if (s.big) {
    G.effects.explosion(p, 1.1, -1000);
    for (let i = 0; i < 14; i++) G.effects.add({ pos: p, vel: G.effects.rv(40), size: 0.25, life: 0.5, color: 0xffd27a, basic: true, additive: true, drag: 1.5 });
    sfx.explosion(Math.max(0.3, volAt(p)), false);
  } else {
    G.effects.add({ pos: p, size: 1.6, grow: 2, life: 0.18, color: 0xfff0c0, basic: true, additive: true });
    for (let i = 0; i < 6; i++) G.effects.add({ pos: p, vel: G.effects.rv(16), size: 0.6, grow: 1.4, life: 0.35, color: 0xff8a2a, basic: true, additive: true, drag: 3 });
    for (let i = 0; i < 4; i++) G.effects.smoke(p, 0x2a2826, 1.3, 2.2, 0.5);
    sfx.flak(volAt(p) * 0.7);
  }
  let hitAny = false;
  for (const h of G.helis) {
    if (!h.alive) continue;
    if (h === direct) { damageUnit(h, s.direct, s.owner); hitAny = true; continue; }
    const d = h.pos.distanceTo(p);
    if (d < R) { damageUnit(h, s.splash * (1 - d / R), s.owner); hitAny = true; }
  }
  if (hitAny && s.owner.isPlayer) G.hits++;
}

function updateFlak(dt) {
  const W = G.world;
  for (let i = G.flak.length - 1; i >= 0; i--) {
    const s = G.flak[i];
    s.fuse -= dt;
    const from = _v2.copy(s.mesh.position);
    s.mesh.position.addScaledVector(s.vel, dt);
    const p = s.mesh.position;
    s.smokeT -= dt;
    if (s.smokeT <= 0) {
      s.smokeT = s.big ? 0.02 : 0.05;
      G.effects.add({ pos: p, size: s.big ? 0.2 : 0.35, grow: 2, life: s.big ? 0.35 : 0.6, color: 0x9a948a, opacity: s.big ? 0.3 : 0.45, geo: G.effects.ico });
    }
    // Proximity fuse, swept along this frame's path so fast rounds can't skip past a target
    let burst = false, direct = null;
    const seg = _v3.copy(p).sub(from);
    const len2 = seg.lengthSq() || 1;
    for (const h of G.helis) {
      if (!h.alive) continue;
      const k = clamp(_v1.copy(h.pos).sub(from).dot(seg) / len2, 0, 1);
      const cp = from.clone().addScaledVector(seg, k);
      const d = cp.distanceTo(h.pos);
      if (d < s.prox) { burst = true; direct = d < 4.5 ? h : null; p.copy(cp); break; }
    }
    if (!burst && (s.fuse <= 0 || p.y < W.heightAt(p.x, p.z) || insideBuilding(p))) burst = true;
    if (burst) {
      flakBurst(s, p.clone(), direct);
      G.scene.remove(s.mesh);
      G.flak.splice(i, 1);
    }
  }
}

function steerMissile(m, targetPos, dt) {
  m.age += dt;
  m.life -= dt;
  m.speed = Math.min(m.maxSpeed, m.speed + m.accel * dt);
  if (targetPos && m.age > 0.25) {
    const aim = _v1.copy(targetPos).sub(m.pos).normalize();
    m.dir.lerp(aim, Math.min(1, dt * (m.age < 0.8 ? Math.min(3, m.agility) : m.agility))).normalize();
  }
  m.pos.addScaledVector(m.dir, m.speed * dt);
  m.mesh.position.copy(m.pos);
  m.mesh.lookAt(_v2.copy(m.pos).add(m.dir));
  m.mesh.userData.flame.scale.setScalar(0.8 + Math.random() * 0.5);
  m.smokeT -= dt;
  if (m.smokeT <= 0) {
    m.smokeT = 0.03;
    const back = m.pos.clone().addScaledVector(m.dir, -1.3 * m.mesh.scale.x);
    G.effects.add({ pos: back, size: 0.5, grow: 3, life: 1.6, color: 0xc8c3ba, opacity: 0.5, geo: G.effects.ico, randomRot: true });
  }
}

function updateMissiles(dt) {
  const W = G.world;
  for (let i = G.missiles.length - 1; i >= 0; i--) {
    const m = G.missiles[i];
    const isSam = m.kind === 'sam';
    const tgt = m.target;
    // AI gunships react to incoming SAMs with flares
    if (isSam && tgt && tgt.kind === 'heli' && !tgt.isPlayer && tgt.alive && !m.reacted && m.pos.distanceTo(tgt.pos) < 230) {
      m.reacted = true;
      if (tgt.flareCharges > 0 && Math.random() < 0.4) { tgt.flareCharges--; deployDecoys(tgt, false); }
    }
    // Late seduction: fresh decoys from the target near the missile's path can still pull it off
    if (tgt && tgt.kind && m.burst !== G.decoyBurst) {
      m.burst = G.decoyBurst;
      const fresh = G.decoys.filter((d) => d.alive && d.age < 1.5 && d.owner === tgt && d.pos.distanceTo(m.pos) < 140);
      if (fresh.length && Math.random() < 0.85) {
        m.target = fresh[Math.floor(Math.random() * fresh.length)];
        if (tgt.isPlayer) { G.decoyed++; showSub('MISSILE DECOYED', 1.2); }
      }
    }
    const t = m.target;
    const alive = t && t.alive;
    let tp = null;
    if (alive) tp = t.kind === 'tank' ? _v3.set(t.pos.x, t.pos.y + 1.4 * t.stats.scale, t.pos.z) : t.pos;
    steerMissile(m, tp, dt);

    let boom = false, hit = null;
    const victims = isSam ? G.helis : G.tanks;
    for (const u of victims) {
      if (!u.alive || u === m.owner) continue;
      const c = u.kind === 'tank' ? _v1.set(u.pos.x, u.pos.y + 1.4 * u.stats.scale, u.pos.z) : u.pos;
      if (m.pos.distanceTo(c) < u.radius + 0.8) { hit = u; boom = true; break; }
    }
    if (!boom && t && !t.kind && alive && m.pos.distanceTo(t.pos) < 3) boom = true;                  // reached the decoy
    if (!boom && (m.pos.y < W.heightAt(m.pos.x, m.pos.z) + 0.3 || insideBuilding(m.pos) || m.life <= 0)) boom = true;
    if (!boom && t && !t.kind && !alive && m.age > 2 && Math.random() < dt * 0.8) boom = true;       // lost lock → self-destruct
    if (boom) {
      const p = m.pos.clone();
      G.effects.explosion(p, isSam ? 0.9 : 1, isSam ? -1000 : W.heightAt(p.x, p.z));
      sfx.explosion(Math.max(0.2, volAt(p)));
      if (hit) { if (m.owner.isPlayer) G.hits++; damageUnit(hit, m.dmg, m.owner); }
      for (const u of victims) {
        if (u === hit || !u.alive || u === m.owner) continue;
        const d = u.pos.distanceTo(p);
        if (d < 10) damageUnit(u, (isSam ? 15 : 25) * (1 - d / 10), m.owner);
      }
      G.scene.remove(m.mesh);
      disposeObject(m.mesh);
      G.missiles.splice(i, 1);
    }
  }
}

function updateDecoys(dt) {
  for (let i = G.decoys.length - 1; i >= 0; i--) {
    const d = G.decoys[i];
    d.age += dt;
    d.life -= dt;
    if (d.kind === 'flare') {
      d.vel.y -= 6 * dt;
      d.vel.multiplyScalar(Math.max(0, 1 - 0.7 * dt));
      d.pos.addScaledVector(d.vel, dt);
      d.mesh.position.copy(d.pos);
      d.mesh.scale.setScalar(0.8 + Math.random() * 0.6);
      d.mesh.material.opacity = Math.min(1, d.life);
      d.smokeT -= dt;
      if (d.smokeT <= 0) { d.smokeT = 0.06; G.effects.add({ pos: d.pos, size: 0.5, grow: 2.5, life: 1.4, color: 0xe8e4dc, opacity: 0.45, geo: G.effects.ico }); }
    } else {
      d.pos.addScaledVector(d.vel, dt);
      d.smokeT -= dt;
      if (d.smokeT <= 0 && d.life > 1) {
        d.smokeT = 0.12;
        G.effects.add({ pos: d.pos.clone().add(G.effects.rv(5)), vel: G.effects.rv(1.5), size: 3, grow: 1.8, life: 3, color: 0xc4bfb4, opacity: 0.55, geo: G.effects.ico, randomRot: true });
      }
    }
    if (d.life <= 0 || d.pos.y < G.world.heightAt(d.pos.x, d.pos.z) - 1) {
      d.alive = false;
      if (d.mesh) { G.scene.remove(d.mesh); d.mesh.material.dispose(); }
      G.decoys.splice(i, 1);
    }
  }
}

function updateDebris(dt) {
  for (const d of G.debris) {
    if (d.rest) continue;
    d.vel.y -= 30 * dt;
    d.obj.position.addScaledVector(d.vel, dt);
    d.obj.rotation.x += d.spin.x * dt; d.obj.rotation.y += d.spin.y * dt; d.obj.rotation.z += d.spin.z * dt;
    const floor = G.world.heightAt(d.obj.position.x, d.obj.position.z) + 0.4;
    if (d.obj.position.y < floor) {
      d.obj.position.y = floor;
      if (Math.abs(d.vel.y) < 4) d.rest = true;
      d.vel.y = -d.vel.y * 0.35; d.vel.x *= 0.5; d.vel.z *= 0.5;
      d.spin.multiplyScalar(0.4);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Camera                                                             */
/* ------------------------------------------------------------------ */
function updateCamera(dt) {
  const p = G.player, W = G.world;
  const isHeli = p.kind === 'heli';
  let mode = CAM_MODES[G.role][G.camMode];
  if (!p.alive && (mode === 'COCKPIT' || mode === 'GUNNER')) mode = 'CINEMATIC';
  const firstPerson = mode === 'COCKPIT' || mode === 'GUNNER';
  p.group.visible = mode !== 'COCKPIT';
  if (p.hpSprite) p.hpSprite.visible = p.alive && !firstPerson;

  G.camYaw += wrapAngle(p.yaw - G.camYaw) * Math.min(1, dt * (isHeli ? 2.6 : 3.5));
  const f = _v1.set(Math.sin(G.camYaw), 0, Math.cos(G.camYaw));
  const desired = _v2.copy(p.pos);
  const look = _v3.copy(p.pos);
  let snap = false;

  if (mode === 'COCKPIT') {
    p.cockpitEye.getWorldPosition(camera.position);
    p.group.getWorldQuaternion(_q);
    camera.quaternion.copy(_q).multiply(FLIP_Y);
    snap = true;
  } else if (mode === 'GUNNER') {
    // Commander's sight on top of the turret, looking where the gun points
    const a = p.yaw + p.turretYaw, e = p.barrelElev * 0.85 + 0.04;
    camera.position.set(p.pos.x + Math.sin(a) * 0.3, p.pos.y + 3.0 * p.stats.scale, p.pos.z + Math.cos(a) * 0.3);
    G.camLook.set(camera.position.x + Math.sin(a) * Math.cos(e) * 50, camera.position.y + Math.sin(e) * 50, camera.position.z + Math.cos(a) * Math.cos(e) * 50);
    camera.lookAt(G.camLook);
    snap = true;
  } else if (mode === 'TACTICAL') {
    desired.addScaledVector(f, -60); desired.y += isHeli ? 140 : 120;
    look.addScaledVector(f, 30);
  } else if (mode === 'CINEMATIC') {
    G.camOrbit += dt * 0.22;
    const R = isHeli ? 38 : 24;
    desired.x += Math.sin(G.camOrbit) * R; desired.z += Math.cos(G.camOrbit) * R;
    desired.y += isHeli ? 9 : 7;
  } else if (mode === 'FAR CHASE') {
    desired.addScaledVector(f, -50); desired.y += 20;
    look.addScaledVector(f, 30); look.y -= 8;
  } else if (mode === 'CLOSE') {
    desired.addScaledVector(f, -9).add(new THREE.Vector3(Math.cos(G.camYaw) * 2.2, 4.6, -Math.sin(G.camYaw) * 2.2));
    look.addScaledVector(f, 25); look.y += 3;
  } else if (isHeli) { // CHASE
    desired.addScaledVector(f, -27); desired.y += 10;
    look.addScaledVector(f, 22); look.y -= 5;
  } else {
    desired.addScaledVector(f, -17); desired.y += 7.5;
    look.addScaledVector(f, 14); look.y += 2.5;
  }

  if (!snap) {
    const minY = W.heightAt(desired.x, desired.z) + 2.5;
    if (desired.y < minY) desired.y = minY;
    camera.position.lerp(desired, 1 - Math.exp(-dt * (mode === 'CINEMATIC' ? 2.5 : 6)));
    G.camLook.lerp(look, 1 - Math.exp(-dt * 8));
    camera.lookAt(G.camLook);
  }
  if (G.shake > 0) {
    G.shake = Math.max(0, G.shake - dt * 1.6);
    const s = G.shake * G.shake * (firstPerson ? 0.35 : 1.1);
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
  }
  W.sun.target.position.copy(p.pos);
  W.sun.position.copy(p.pos).add(W.sunOffset);
}

/* ------------------------------------------------------------------ */
/*  Mission flow                                                       */
/* ------------------------------------------------------------------ */
function endMission(success, reason) {
  if (G.state === 'over') return;
  G.state = 'over';
  mouse.down = false;
  sfx.setRotor(0.3);
  document.body.classList.remove('in-game');
  const p = G.player;
  const pilot = G.role === 'pilot';
  const hullBonus = success && pilot ? Math.round(p.hp) : 0;
  const total = G.score + hullBonus;
  const title = $('results-title');
  title.textContent = success ? 'MISSION COMPLETE' : 'MISSION FAILED';
  title.classList.toggle('fail', !success);
  $('results-sub').textContent = reason;
  const acc = Math.round((G.hits / Math.max(1, G.shots + G.secFired)) * 100);
  const rows = pilot ? [
    ['Role', 'Gunship Pilot'], ['Map', MAP_INFO[G.cfg.map].name],
    ['Tanks destroyed', `${G.destroyed} / ${G.total}`], ['Tanks escaped', `${G.escaped} (max ${G.comp.allowed})`],
    ['Mission time', fmtTime(G.time)], ['Hit accuracy', `${acc}%`], ['Missiles fired', G.secFired],
    ['Wingmen lost', `${G.wingmenLost} / ${G.wingmen}`], ['Flares used / missiles decoyed', `${G.decoysUsed} / ${G.decoyed}`], ['Hull integrity', `${Math.round((p.hp / p.maxHp) * 100)}%`],
    ['Score', `${total}${hullBonus ? ` (+${hullBonus} hull bonus)` : ''}`],
  ] : [
    ['Role', `Tank Commander · ${G.pv.name}`], ['Map', MAP_INFO[G.cfg.map].name],
    ['Gunships shot down', `${G.helisDown} / ${G.helisTotal}`], ['Allies extracted / lost', `${G.alliesEscaped} / ${G.alliesLost}`],
    ['Mission time', fmtTime(G.time)], ['Hit accuracy', `${acc}%`], G.pv.sam ? ['SAMs fired', G.secFired] : ['Main-gun rounds fired', G.shots],
    ['Smoke used / missiles decoyed', `${G.decoysUsed} / ${G.decoyed}`], ['Hull integrity', `${Math.round((p.hp / p.maxHp) * 100)}%`],
    ['Score', total],
  ];
  $('results-table').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  $('results').classList.remove('hidden');
  H.lockReticle.classList.add('hidden');
  H.warning.classList.add('hidden');
}

function checkMission() {
  if (G.state !== 'play') return;
  if (G.role === 'pilot') {
    if (G.destroyed + G.escaped >= G.total && G.spawnQueue.length === 0) {
      showCenter('CONVOY NEUTRALIZED', 3);
      G.state = 'ending'; G.endTimer = 2.5; G.endFail = null;
      G.endReason = `All ${G.total} tanks accounted for — ${G.destroyed} destroyed, ${G.escaped} escaped.`;
    }
  } else if (G.helisDown >= G.helisTotal && G.heliQueue.length === 0) {
    showCenter('AIRSPACE CLEAR', 3);
    G.score += 400 + Math.round(G.player.hp);
    G.state = 'ending'; G.endTimer = 2.5; G.endFail = null;
    G.endReason = `All ${G.helisTotal} gunships shot down. The convoy is safe.`;
  }
}

/* ------------------------------------------------------------------ */
/*  Per-frame update                                                   */
/* ------------------------------------------------------------------ */
function update(dt) {
  G.time += dt;
  const p = G.player;

  if (G.role === 'pilot') {
    while (G.spawnQueue.length && G.spawnQueue[0].time <= G.time) {
      spawnEnemyTank(G.spawnQueue.shift().type);
      if (G.tanks.length > 3) showSub('ENEMY REINFORCEMENTS INBOUND', 1.5);
    }
  } else {
    while (G.heliQueue.length && G.heliQueue[0] <= G.time) { G.heliQueue.shift(); spawnAIHeli(false); }
  }

  computeAim();

  if (p.kind === 'heli') {
    updatePlayerHeli(p, dt);
    if (!p.crashed) p.syncVisual(dt, G.time);
    if (p.alive) p.aimGun(G.aim);
  } else if (p.alive) updatePlayerTank(p, dt);

  for (const t of G.tanks) {
    if (t.alive && !t.isPlayer) updateTankAI(t, dt);
    if (!t.escaped) t.syncVisual(dt, G.time);
  }
  for (const h of G.helis) {
    if (h.isPlayer) continue;
    updateHeliAI(h, dt);
    if (!h.crashed) h.syncVisual(dt, G.time);
  }

  // Player weapons
  G.gunT -= dt; G.secT -= dt; G.decoyT -= dt;
  if (G.role === 'pilot' && G.missileAmmo < MISSILE_MAX) {
    G.missileRegen += dt;
    if (G.missileRegen >= MISSILE_REARM) { G.missileRegen = 0; G.missileAmmo++; }
  }
  const pilot = G.role === 'pilot';
  const decoyMax = pilot ? FLARE_MAX : SMOKE_MAX, decoyRe = pilot ? FLARE_RECHARGE : SMOKE_RECHARGE;
  if (G.decoyCharges < decoyMax) { G.decoyRegen += dt; if (G.decoyRegen >= decoyRe) { G.decoyRegen = 0; G.decoyCharges++; } } else G.decoyRegen = 0;
  if (mouse.down && p.alive && G.state === 'play' && G.gunT <= 0) {
    if (pilot) { fireHeliGun(p, G.aim, 0.012, BULLET_DAMAGE); G.gunT = GUN_INTERVAL; }
    else if (G.pv.weapon === 'cannon') { fireMainGun(p); G.gunT = G.pv.gun.reload; }
    else { firePlayerAutocannon(p); G.gunT = TGUN_INTERVAL; }
  }
  if (pilot) G.lockTarget = p.alive ? nearestTank(p.pos, MISSILE_RANGE) : null;
  else updatePlayerLock(dt);

  updateBullets(dt);
  updateFlak(dt);
  updateMissiles(dt);
  updateDecoys(dt);
  updateDebris(dt);

  // Wreck smoke and city fires
  for (const u of [...G.tanks, ...G.helis]) {
    if (u.alive || u.escaped || !(u.smokeT > 0)) continue;
    u.smokeT -= dt;
    const top = _v1.set(u.pos.x, u.pos.y + 2.2, u.pos.z);
    if (Math.random() < dt * 10) G.effects.smoke(top, 0x1e1c1b, 1.3, 3, 4);
    if (u.smokeT > 12 && Math.random() < dt * 16) G.effects.fire(top);
  }
  for (const s of G.world.smokeSources) {
    if (s.distanceTo(camera.position) > 700) continue;
    if (Math.random() < dt * 3) G.effects.smoke(s, 0x2b2826, 4, 6, 5);
    if (Math.random() < dt * 4) G.effects.fire(s);
  }
  G.effects.update(dt);

  updateCamera(dt);
  checkMission();
  if (G.state === 'ending') {
    G.endTimer -= dt;
    if (G.endTimer <= 0) G.endFail ? endMission(false, G.endFail) : endMission(true, G.endReason);
  }
  if (pilot && p.alive) sfx.setRotor(0.85 + Math.abs(p.cV) * 0.15 + Math.abs(p.cF) * 0.1);
}

/* ------------------------------------------------------------------ */
/*  HUD                                                                */
/* ------------------------------------------------------------------ */
function projectToScreen(p) {
  const v = _v1.copy(p).project(camera);
  if (v.z > 1 || v.z < -1) return null;
  return [((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight];
}

function updateHUD(dt) {
  const p = G.player, W = G.world, pilot = G.role === 'pilot';
  if (pilot) {
    H.hudR1.textContent = `${G.destroyed} / ${G.total}`;
    H.hudR2.textContent = `${G.escaped} / ${G.comp.allowed} max`;
    H.hudR2.classList.toggle('bad', G.escaped >= G.comp.allowed);
    H.hudR3.textContent = G.tanks.filter((t) => t.alive).length + (G.spawnQueue.length ? ` (+${G.spawnQueue.length})` : '');
  } else {
    H.hudR1.textContent = `${G.helisDown} / ${G.helisTotal}`;
    const allies = G.tanks.filter((t) => !t.isPlayer);
    H.hudR2.textContent = `${allies.filter((t) => t.alive || t.escaped).length} / ${allies.length}`;
    H.hudR2.classList.toggle('bad', G.alliesLost > 0);
    H.hudR3.textContent = `${Math.max(0, Math.round(FIELD.escapeZ - p.pos.z))} m`;
  }
  H.hudScore.textContent = G.score;
  H.hudTime.textContent = fmtTime(G.time);
  const f = p.hp / p.maxHp;
  H.hudHpFill.style.width = `${f * 100}%`;
  H.hudHpFill.style.background = f > 0.6 ? 'linear-gradient(90deg,#2bd94d,#4cff6a)' : f > 0.3 ? 'linear-gradient(90deg,#e0b020,#ffd23f)' : 'linear-gradient(90deg,#c01818,#ff3b3b)';
  H.hudHpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
  if (pilot) {
    const agl = p.pos.y - W.heightAt(p.pos.x, p.pos.z);
    H.hudF1.textContent = Math.max(0, Math.round(agl - 2.05));
    H.hudSpd.textContent = Math.round(Math.hypot(p.vel.x, p.vel.z) * 3.6);
    const vs = clamp(p.vel.y / 14, -1, 1);
    H.hudVsi.style.left = vs >= 0 ? '50%' : `${50 + vs * 50}%`;
    H.hudVsi.style.width = `${Math.abs(vs) * 50}%`;
    H.hudVsiText.textContent = (p.vel.y >= 0 ? '+' : '') + p.vel.y.toFixed(0);
    H.altWarning.classList.toggle('hidden', !(p.alive && p.vel.y < -9 && agl < 25));
  } else {
    H.hudF1.textContent = Math.round((p.barrelElev * 180) / Math.PI);
    H.hudSpd.textContent = Math.round(Math.abs(p.speed) * 3.6);
  }
  H.hudHdg.textContent = String(Math.round(((-p.yaw * 180) / Math.PI % 360 + 540) % 360)).padStart(3, '0');

  const gunTank = !pilot && !G.pv.sam;
  let mf;
  if (pilot) {
    // Bar = progress on the next rearm; pips = rounds in the magazine
    mf = G.missileAmmo >= MISSILE_MAX ? 1 : G.missileRegen / MISSILE_REARM;
    H.hudMissileState.textContent = `${G.missileAmmo} / ${MISSILE_MAX}${G.missileAmmo < MISSILE_MAX ? ' · REARMING' : ''}`;
    [...H.hudMissilePips.children].forEach((el, i) => el.classList.toggle('on', i < G.missileAmmo));
  } else {
    const cd = gunTank ? G.pv.gun.reload : PSAM_COOLDOWN;
    mf = clamp(1 - (gunTank ? G.gunT : G.secT) / cd, 0, 1);
    H.hudMissileState.textContent = gunTank ? (mf >= 1 ? 'LOADED' : 'LOADING') : mf >= 1 ? 'READY' : 'RELOADING';
  }
  H.hudMissileFill.style.width = `${mf * 100}%`;
  [...H.hudFlares.children].forEach((el, i) => el.classList.toggle('on', i < G.decoyCharges));
  const dmax = pilot ? FLARE_MAX : SMOKE_MAX, dre = pilot ? FLARE_RECHARGE : SMOKE_RECHARGE;
  H.hudFlareState.textContent = G.decoyCharges < dmax ? `+1 in ${Math.ceil(dre - G.decoyRegen)}s` : 'FULL';

  if (pilot) {
    const lt = G.lockTarget;
    const sp = lt ? projectToScreen(_v2.set(lt.pos.x, lt.pos.y + 1.6 * lt.stats.scale, lt.pos.z)) : null;
    H.hudLock.textContent = lt ? `LOCK: ${lt.label} ${Math.round(lt.pos.distanceTo(p.pos))}m` : 'NO TARGET';
    H.hudLock.className = lt ? 'lock-state locked' : 'lock-state';
    if (sp && G.state !== 'over') {
      H.lockReticle.classList.remove('hidden', 'locking');
      H.lockReticle.style.left = sp[0] + 'px';
      H.lockReticle.style.top = sp[1] + 'px';
      H.lockReticle.style.width = H.lockReticle.style.height = '64px';
      H.reticleText.textContent = G.missileAmmo > 0 ? `LOCK · SPACE (${G.missileAmmo})` : 'LOCK · REARMING';
    } else H.lockReticle.classList.add('hidden');
  }
  H.crosshair.style.left = H.lockZone.style.left = mouse.x + 'px';
  H.crosshair.style.top = H.lockZone.style.top = mouse.y + 'px';

  const incoming = p.alive && G.missiles.some((m) => m.target === p);
  H.warning.classList.toggle('hidden', !incoming);
  if (incoming) { G.warnBeepT -= dt; if (G.warnBeepT <= 0) { G.warnBeepT = 0.25; sfx.beep(1250, 0.08, 0.1); } }

  if (G.msgT > 0) { G.msgT -= dt; if (G.msgT <= 0) H.centerMsg.classList.remove('show'); }
  if (G.subT > 0) { G.subT -= dt; if (G.subT <= 0) H.subMsg.classList.remove('show'); }
  G.vignette = Math.max(0, G.vignette - dt * 1.8);
  H.damageVignette.style.opacity = Math.max(G.vignette, p.alive && f < 0.3 ? 0.35 + Math.sin(G.time * 6) * 0.15 : 0);

  for (const u of [...G.tanks, ...G.helis]) {
    if (!u.alive || u.isPlayer || !u.hpSprite) continue;
    u.hpSprite.visible = u.pos.distanceTo(camera.position) < 750;
  }
  drawRadar();
}

function drawRadar() {
  const ctx = H.rc, Wd = 170, Ht = 250;
  const s = Math.min(Wd / (FIELD.boundX * 2 + 40), Ht / (FIELD.boundZ * 2 + 40));
  const toR = (x, z) => [Wd / 2 - x * s, Ht / 2 - z * s];
  ctx.clearRect(0, 0, Wd, Ht);
  ctx.fillStyle = 'rgba(10,30,14,0.55)';
  ctx.fillRect(0, 0, Wd, Ht);
  if (G.world.lanes) {
    ctx.strokeStyle = 'rgba(124,255,107,0.18)'; ctx.lineWidth = 3;
    for (const lx of G.world.lanes) { const [x] = toR(lx, 0); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, Ht); ctx.stroke(); }
    for (const sz of G.world.streets) { const [, y] = toR(0, sz); const [x0] = toR(220, 0), [x1] = toR(-220, 0); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
  } else {
    ctx.fillStyle = 'rgba(160,100,60,0.35)';
    const [xl] = toR(230, 0), [xr] = toR(-230, 0);
    ctx.fillRect(0, 0, xl, Ht); ctx.fillRect(xr, 0, Wd - xr, Ht);
  }
  const [, ey] = toR(0, FIELD.escapeZ);
  const pilot = G.role === 'pilot';
  ctx.fillStyle = pilot ? 'rgba(255,60,40,0.4)' : 'rgba(124,255,107,0.35)';
  ctx.fillRect(0, 0, Wd, ey);
  ctx.fillStyle = pilot ? '#ff6a4a' : '#9aff8a'; ctx.font = 'bold 10px Rajdhani, Arial'; ctx.textAlign = 'center';
  ctx.fillText(pilot ? 'ESCAPE' : 'EXTRACTION', Wd / 2, ey - 3);
  ctx.strokeStyle = 'rgba(124,255,107,0.1)'; ctx.lineWidth = 1;
  for (let y = 0; y < Ht; y += 25) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(Wd, y); ctx.stroke(); }
  const arrow = (x, y, yaw, col) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-yaw);
    ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  };
  for (const t of G.tanks) {
    if (t.escaped) continue;
    const [x, y] = toR(t.pos.x, t.pos.z);
    if (!t.alive) { ctx.fillStyle = 'rgba(160,160,160,0.6)'; ctx.fillRect(x - 2, y - 2, 4, 4); continue; }
    if (t.isPlayer) { arrow(x, y, t.yaw, '#7cff6b'); continue; }
    ctx.fillStyle = t.friendly ? '#5ad0ff' : t.stats.sam ? '#ff3a2a' : '#ffb02a';
    ctx.beginPath(); ctx.arc(x, y, t.stats.sam ? 4.5 : 3.5, 0, Math.PI * 2); ctx.fill();
    if (t === G.lockTarget) { ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 6, y - 6, 12, 12); }
  }
  for (const h of G.helis) {
    const [x, y] = toR(h.pos.x, h.pos.z);
    if (h.isPlayer) { if (h.alive) arrow(x, y, h.yaw, '#7cff6b'); continue; }
    if (!h.alive) { ctx.fillStyle = 'rgba(160,160,160,0.6)'; ctx.fillRect(x - 2, y - 2, 4, 4); continue; }
    arrow(x, y, h.yaw, h.friendly ? '#5ad0ff' : '#ff3a2a');
    if (h === G.lockTarget) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 8, y - 8, 16, 16); }
  }
  ctx.fillStyle = '#ffffff';
  for (const m of G.missiles) { const [x, y] = toR(m.pos.x, m.pos.z); ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
}

/* ------------------------------------------------------------------ */
/*  Loop                                                               */
/* ------------------------------------------------------------------ */
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!G) return;
  if (!paused && G.state !== 'over') { update(dt); updateHUD(dt); }
  renderer.render(G.scene, camera);
}

refreshMenu();
rebuildPreview();
requestAnimationFrame(previewLoop);
requestAnimationFrame(frame);

// Debug hooks (console / automated testing)
window.__game = () => G;
window.__camera = camera;
window.__render = () => { if (G) renderer.render(G.scene, camera); return { ...renderer.info.render }; };
window.__step = (n = 1, dt = 1 / 60) => {
  for (let i = 0; i < n && G && G.state !== 'over'; i++) { update(dt); updateHUD(dt); }
  if (G) renderer.render(G.scene, camera);
};
