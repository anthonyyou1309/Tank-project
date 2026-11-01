// Environment (dusk desert test track by a rocket launch site) and the
// meshes for every obstacle / pickup type. Gameplay data lives in main.js.
import * as THREE from 'three';

export const CEIL_Y = 4.4;      // tunnel ceiling height
export const BEAM_Y = 6.6;      // gantry crossbeam height

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- textures
const roadTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#2a2c31'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const v = 30 + Math.random() * 40;
    g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  // road is 10.4 m wide -> 49.2 px/m. Lane edges at x = +-1.5, +-4.5
  const px = (m) => w / 2 + m * (w / 10.4);
  g.fillStyle = '#e9e4d6';
  for (const m of [-1.5, 1.5]) {
    g.fillRect(px(m) - 3, 0, 6, h * 0.45);
  }
  g.fillStyle = '#f2c14e';
  for (const m of [-4.75, 4.75]) g.fillRect(px(m) - 4, 0, 8, h);
});
roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
roadTex.repeat.set(1, 40);

const sandTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#b98a5e'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) {
    const r = 150 + Math.random() * 60;
    g.fillStyle = `rgba(${r},${r * 0.72},${r * 0.48},0.45)`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
});
sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
sandTex.repeat.set(30, 30);

const skyTex = canvasTex(4, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#0e1636');
  gr.addColorStop(0.42, '#3b2f63');
  gr.addColorStop(0.68, '#c25b67');
  gr.addColorStop(0.82, '#f39a5e');
  gr.addColorStop(1, '#f6c27a');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

const stripeTex = canvasTex(128, 32, (g, w, h) => {
  g.fillStyle = '#f5f2ea'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ff6a1a';
  for (let x = -h; x < w + h; x += 32) {
    g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.fill();
  }
});

const chevronTex = canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#1b1c20'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#ffd23f'; g.lineWidth = 14;
  for (let y = 10; y < h; y += 48) {
    g.beginPath(); g.moveTo(10, y + 30); g.lineTo(w / 2, y); g.lineTo(w - 10, y + 30); g.stroke();
  }
});

const lowTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#ffd23f'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#16171a';
  for (let x = -h; x < w + h; x += 64) {
    g.beginPath(); g.moveTo(x, h); g.lineTo(x + 32, h); g.lineTo(x + 32 + h, 0); g.lineTo(x + h, 0); g.fill();
  }
  g.fillStyle = '#16171a'; g.fillRect(20, 92, w - 40, 76);
  g.fillStyle = '#ffd23f'; g.font = 'bold 50px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('LOW', w / 2, 131);
});

const trailerTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#dfe3e8'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c9ced5';
  for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 3, h);
  g.fillStyle = '#2b2f36'; g.fillRect(0, h - 26, w, 10);
});

const doorTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#d4d9df'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#9aa1aa'; g.fillRect(w / 2 - 2, 0, 4, h);
  g.fillStyle = '#ff6a1a'; g.fillRect(0, h - 30, w, 10);
  g.fillStyle = '#f5f2ea'; g.fillRect(0, h - 20, w, 6);
  g.fillStyle = '#7d848e';
  for (const x of [w / 2 - 40, w / 2 + 34]) g.fillRect(x, 40, 6, h - 90);
});

// ---------------------------------------------------------------- shared materials
const M = {
  concrete: new THREE.MeshStandardMaterial({ color: 0xbfbab0, roughness: 0.9 }),
  stripe: new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6, emissive: 0x331100, emissiveIntensity: 0.3 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x9aa2ab, metalness: 0.85, roughness: 0.3 }),
  darkSteel: new THREE.MeshStandardMaterial({ color: 0x3a3f47, metalness: 0.7, roughness: 0.45 }),
  trailer: new THREE.MeshStandardMaterial({ map: trailerTex, roughness: 0.5, metalness: 0.3 }),
  door: new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.5, metalness: 0.3 }),
  ramp: new THREE.MeshStandardMaterial({ map: chevronTex, roughness: 0.6, metalness: 0.2 }),
  rampSide: new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.7, metalness: 0.4 }),
  low: new THREE.MeshStandardMaterial({ map: lowTex, roughness: 0.6, emissive: 0x332200, emissiveIntensity: 0.4 }),
  tunnel: new THREE.MeshStandardMaterial({ color: 0x5a5f68, emissive: 0x23272e, roughness: 0.75, metalness: 0.3, side: THREE.DoubleSide }),
  tunnelLight: new THREE.MeshBasicMaterial({ color: 0x9cc8e6 }),
  red: new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 2 }),
  amber: new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff9000, emissiveIntensity: 1.6 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x0f141c, metalness: 0.6, roughness: 0.1 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.8 }),
  pipe: new THREE.MeshStandardMaterial({ color: 0xd2862b, metalness: 0.6, roughness: 0.4 }),
  charge: new THREE.MeshStandardMaterial({ color: 0x5fd4ff, emissive: 0x2aa8ff, emissiveIntensity: 2.2, metalness: 0.3, roughness: 0.2 }),
  copv: new THREE.MeshStandardMaterial({ color: 0xf2f4f6, metalness: 0.2, roughness: 0.3 }),
  copvBand: new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.5, roughness: 0.4 }),
  od: new THREE.MeshStandardMaterial({ color: 0xff3d5a, emissive: 0xff2040, emissiveIntensity: 2.4 }),
};

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  charge: new THREE.OctahedronGeometry(0.38, 0),
  copv: new THREE.CapsuleGeometry(0.32, 0.7, 6, 14),
  band: new THREE.CylinderGeometry(0.335, 0.335, 0.14, 16),
  odRing: new THREE.TorusGeometry(0.6, 0.12, 10, 28),
  wheel: (() => { const g = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 16); g.rotateZ(Math.PI / 2); return g; })(),
  pipe: (() => { const g = new THREE.CylinderGeometry(0.35, 0.35, 2.8, 14); g.rotateZ(Math.PI / 2); return g; })(),
};

function box(mat, w, h, d, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(G.box, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------- obstacles
export function makeBarrier() {
  const g = new THREE.Group();
  g.add(box(M.concrete, 2.7, 0.75, 0.6, 0, 0.375, 0));
  g.add(box(M.stripe, 2.7, 0.3, 0.62, 0, 0.88, 0));
  g.add(box(M.amber, 0.14, 0.12, 0.64, -1.15, 1.08, 0));
  g.add(box(M.amber, 0.14, 0.12, 0.64, 1.15, 1.08, 0));
  return g;
}

const CAR_COLORS = [0x1d2b4a, 0xb3141f, 0x2b2d31, 0x9ea6b0, 0x0d4f73, 0xe8e8e8];
export function makeTraffic() {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color: CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0], metalness: 0.5, roughness: 0.3,
  });
  g.add(box(paint, 1.95, 0.75, 4.5, 0, 0.62, 0));
  g.add(box(M.glass, 1.7, 0.55, 2.4, 0, 1.22, 0.15));
  g.add(box(paint, 1.72, 0.08, 2.0, 0, 1.5, 0.2));
  g.add(box(M.red, 1.6, 0.08, 0.04, 0, 0.88, 2.26));
  for (const [x, z] of [[-0.9, -1.45], [0.9, -1.45], [-0.9, 1.45], [0.9, 1.45]]) {
    const w = new THREE.Mesh(G.wheel, M.tyre); w.position.set(x, 0.38, z); g.add(w);
  }
  return g;
}

// Tall electric semi seen from behind (its rear doors face the player).
export function makeSemi(len) {
  const g = new THREE.Group();
  const trailerLen = len - 3.4;
  const tz = len / 2 - trailerLen / 2; // trailer at the near (+z) end
  g.add(box(M.trailer, 2.6, 3.4, trailerLen, 0, 2.3, tz));
  g.add(box(M.door, 2.62, 3.4, 0.05, 0, 2.3, len / 2 + 0.01));
  g.add(box(M.darkSteel, 2.5, 0.35, trailerLen, 0, 0.45, tz));
  g.add(box(M.red, 0.25, 0.12, 0.05, -1.05, 0.75, len / 2 + 0.03));
  g.add(box(M.red, 0.25, 0.12, 0.05, 1.05, 0.75, len / 2 + 0.03));
  g.add(box(M.amber, 2.3, 0.06, 0.05, 0, 3.98, len / 2 + 0.03));
  // Cab at far end.
  const cabZ = -len / 2 + 1.6;
  const cabPaint = new THREE.MeshStandardMaterial({ color: 0xeef0f2, metalness: 0.4, roughness: 0.25 });
  g.add(box(cabPaint, 2.5, 3.2, 3.2, 0, 2.0, cabZ));
  g.add(box(M.glass, 2.3, 1.0, 0.1, 0, 2.9, cabZ - 1.6));
  for (const z of [tz + trailerLen / 2 - 1.2, tz + trailerLen / 2 - 2.4, cabZ - 0.8, cabZ + 1.0]) {
    for (const x of [-1.05, 1.05]) { const w = new THREE.Mesh(G.wheel, M.tyre); w.position.set(x, 0.4, z); g.add(w); }
  }
  return g;
}

// Launch ramp leading onto a trailer roof: rises from 0 at near end to `h` at far end.
export function makeRamp(len, h) {
  const g = new THREE.Group();
  const slope = Math.hypot(len, h);
  const deck = box(M.ramp, 2.5, 0.12, slope, 0, h / 2, 0);
  deck.rotation.x = Math.atan2(h, len);
  g.add(deck);
  const sideShape = new THREE.Shape();
  // shape u maps to world z = -u after rotateY, so +u is the far (high) end
  sideShape.moveTo(-len / 2, 0); sideShape.lineTo(len / 2, 0); sideShape.lineTo(len / 2, h); sideShape.closePath();
  const sg = new THREE.ExtrudeGeometry(sideShape, { depth: 0.1, bevelEnabled: false });
  sg.rotateY(Math.PI / 2);
  for (const x of [-1.25, 1.15]) {
    const s = new THREE.Mesh(sg, M.rampSide); s.position.x = x; g.add(s);
  }
  return g;
}

// Overhead gantry: posts beyond the road, crossbeam at BEAM_Y, and LOW-clearance
// slabs hanging down to 1.5 m in the given lanes.
export function makeGantry(lanesX) {
  const g = new THREE.Group();
  for (const x of [-5.6, 5.6]) g.add(box(M.darkSteel, 0.35, BEAM_Y + 0.6, 0.35, x, (BEAM_Y + 0.6) / 2, 0));
  g.add(box(M.darkSteel, 11.6, 0.5, 0.4, 0, BEAM_Y + 0.25, 0));
  for (const x of lanesX) {
    g.add(box(M.low, 2.7, BEAM_Y - 1.5, 0.3, x, (BEAM_Y + 1.5) / 2, 0));
    g.add(box(M.amber, 0.2, 0.2, 0.34, x - 1.1, 1.6, 0));
    g.add(box(M.amber, 0.2, 0.2, 0.34, x + 1.1, 1.6, 0));
  }
  return g;
}

// Tunnel shell spanning all lanes. Origin at its centre; length along z.
export function makeTunnel(len) {
  const g = new THREE.Group();
  for (const x of [-5.3, 5.3]) g.add(box(M.tunnel, 0.6, CEIL_Y + 0.8, len, x, (CEIL_Y + 0.8) / 2, 0));
  g.add(box(M.tunnel, 11.2, 0.8, len, 0, CEIL_Y + 0.4, 0));
  // Portal facade at the near end.
  g.add(box(M.darkSteel, 12.4, 3.6, 1.2, 0, CEIL_Y + 1.8, len / 2));
  g.add(box(M.stripe, 11.0, 0.35, 1.25, 0, CEIL_Y + 0.25, len / 2));
  // Ceiling light strips between lanes, and wall guide lights.
  for (const x of [-1.5, 1.5]) g.add(box(M.tunnelLight, 0.07, 0.03, len - 2, x, CEIL_Y - 0.02, 0));
  for (let z = -len / 2 + 4; z < len / 2; z += 8) {
    for (const x of [-4.95, 4.95]) g.add(box(M.tunnelLight, 0.06, 0.3, 1.6, x, 1.0, z));
  }
  return g;
}

export function makeBarricade() {
  const g = new THREE.Group();
  g.add(box(M.darkSteel, 2.8, 2.8, 2.2, 0, 1.4, 0));
  g.add(box(M.stripe, 2.82, 0.5, 2.22, 0, 2.1, 0));
  g.add(box(M.red, 2.0, 0.1, 0.05, 0, 0.6, 1.12));
  return g;
}

// Pipe bundle hanging from the tunnel ceiling (hits cars driving inverted).
export function makePipe() {
  const g = new THREE.Group();
  const p1 = new THREE.Mesh(G.pipe, M.pipe); p1.position.set(0, CEIL_Y - 0.4, 0); g.add(p1);
  const p2 = new THREE.Mesh(G.pipe, M.pipe); p2.position.set(0, CEIL_Y - 1.0, 0); g.add(p2);
  g.add(box(M.darkSteel, 0.2, 1.4, 0.2, -1.2, CEIL_Y - 0.7, 0));
  g.add(box(M.darkSteel, 0.2, 1.4, 0.2, 1.2, CEIL_Y - 0.7, 0));
  g.add(box(M.red, 0.3, 0.12, 0.8, 0, CEIL_Y - 1.36, 0));
  return g;
}

// ---------------------------------------------------------------- pickups
export function makeCharge() { return new THREE.Mesh(G.charge, M.charge); }

export function makeCanister() {
  const g = new THREE.Group();
  const c = new THREE.Mesh(G.copv, M.copv); c.rotation.z = Math.PI / 2; g.add(c);
  for (const x of [-0.3, 0.3]) { const b = new THREE.Mesh(G.band, M.copvBand); b.rotation.z = Math.PI / 2; b.position.x = x; g.add(b); }
  const v = box(M.charge, 0.12, 0.2, 0.12, 0.75, 0, 0); g.add(v);
  return g;
}

export function makeOverdrive() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(G.odRing, M.od));
  const a = box(M.od, 0.5, 0.12, 0.12, 0, 0.12, 0); a.rotation.z = 0.7; a.position.x = -0.12; g.add(a);
  const b = box(M.od, 0.5, 0.12, 0.12, 0, -0.12, 0); b.rotation.z = -0.7; b.position.x = -0.12; g.add(b);
  return g;
}

// ---------------------------------------------------------------- environment
export function createEnvironment(scene) {
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0xe39a72, 50, 250);

  const hemi = new THREE.HemisphereLight(0xffd2b0, 0x4a3a50, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc69a, 2.2);
  sun.position.set(30, 40, -60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 140 });
  sun.target.position.set(0, 0, -10);
  scene.add(sun, sun.target);

  const road = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 400), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.01, -180);
  road.receiveShadow = true;
  scene.add(road);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -250);
  ground.receiveShadow = true;
  scene.add(ground);

  // Guard rails (static, endless).
  for (const x of [-5.5, 5.5]) {
    const rail = box(M.steel, 0.12, 0.3, 400, x, 0.65, -180); rail.castShadow = false; scene.add(rail);
  }

  // Sun disc and distant silhouettes (not fogged so they read on the horizon).
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(38, 40), new THREE.MeshBasicMaterial({ color: 0xffe2a6, fog: false }));
  sunDisc.position.set(90, 34, -640);
  scene.add(sunDisc);

  const sil = new THREE.MeshBasicMaterial({ color: 0x3a2a48, fog: false });
  const sil2 = new THREE.MeshBasicMaterial({ color: 0x4d3655, fog: false });
  const far = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const w = 30 + Math.random() * 80, h = 8 + Math.random() * 22;
    const m = new THREE.Mesh(G.box, i % 2 ? sil : sil2);
    m.scale.set(w, h, 20);
    const side = i % 2 ? 1 : -1;
    m.position.set(side * (60 + Math.random() * 260), h / 2 - 2, -480 - Math.random() * 60);
    far.add(m);
  }
  // Launch tower with "chopstick" arms, and a stainless rocket stacked beside it.
  const tower = new THREE.Mesh(G.box, sil); tower.scale.set(10, 150, 10); tower.position.set(-150, 75, -470); far.add(tower);
  const arm = new THREE.Mesh(G.box, sil); arm.scale.set(26, 3, 3); arm.position.set(-136, 118, -470); far.add(arm);
  const arm2 = arm.clone(); arm2.position.y = 112; far.add(arm2);
  const rocketMat = new THREE.MeshBasicMaterial({ color: 0x8c7d93, fog: false });
  const rocket = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 120, 20), rocketMat);
  rocket.position.set(-125, 60, -472); far.add(rocket);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(4.5, 14, 20), rocketMat);
  nose.position.set(-125, 127, -472); far.add(nose);
  const blink = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3030, fog: false }));
  blink.position.set(-150, 152, -470); far.add(blink);
  scene.add(far);

  // Scrolling roadside props.
  const props = [];
  const SPAN = 260;
  const poleMat = M.darkSteel;
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1cc });
  for (let i = 0; i < 12; i++) {
    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      g.add(box(poleMat, 0.18, 7, 0.18, 0, 3.5, 0));
      g.add(box(poleMat, 1.6, 0.14, 0.14, -side * 0.8, 7, 0));
      const lamp = box(lampMat, 0.7, 0.08, 0.3, -side * 1.5, 6.92, 0); lamp.castShadow = false; g.add(lamp);
      g.position.set(side * 6.6, 0, -i * (SPAN / 12) - (side > 0 ? SPAN / 24 : 0));
      scene.add(g); props.push(g);
    }
  }
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a6448, roughness: 1, flatShading: true });
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0x6b6a3c, roughness: 1, flatShading: true });
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 70; i++) {
    const shrub = Math.random() < 0.5;
    const m = new THREE.Mesh(rockGeo, shrub ? shrubMat : rockMat);
    const s = shrub ? 0.4 + Math.random() * 0.5 : 0.5 + Math.random() * 1.6;
    m.scale.set(s * (1 + Math.random()), s * (shrub ? 0.8 : 0.6), s);
    m.rotation.y = Math.random() * 6;
    const side = Math.random() < 0.5 ? -1 : 1;
    m.position.set(side * (8 + Math.random() * 50), s * 0.2, -Math.random() * SPAN);
    m.castShadow = !shrub;
    scene.add(m); props.push(m);
  }

  let t = 0;
  return {
    update(dt, move) {
      t += dt;
      roadTex.offset.y += move / 10;
      sandTex.offset.y += move * 30 / 700;
      for (const p of props) {
        p.position.z += move;
        if (p.position.z > 20) p.position.z -= SPAN;
      }
      blink.visible = (t % 1.4) < 0.7;
    },
  };
}
