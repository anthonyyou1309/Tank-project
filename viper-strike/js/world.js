// Environment construction: Desert Valley (heightfield canyon) and Ruined City (streets + skyscrapers).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

export const FIELD = {
  spawnZ: -760,      // tanks enter here
  escapeZ: 720,      // tanks that reach this line escape
  boundX: 430,       // helicopter area of operations
  boundZ: 900,
  maxAlt: 230,
};

export const MAP_INFO = {
  desert: { name: 'Desert Valley' },
  city: { name: 'Ruined City' },
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

function setInst(mesh, i, pos, yaw = 0, scale = 1, tiltX = 0, tiltZ = 0) {
  _e.set(tiltX, yaw, tiltZ, 'YXZ');
  _q.setFromEuler(_e);
  if (typeof scale === 'number') _s.set(scale, scale, scale); else _s.copy(scale);
  _m.compose(pos, _q, _s);
  mesh.setMatrixAt(i, _m);
}

function skySphere(scene, stops) {
  const tex = TX.makeSkyTexture(stops);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(3200, 32, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false })
  );
  sky.renderOrder = -1;
  scene.add(sky);
  return tex;
}

function makeSun(scene, color, intensity) {
  const sun = new THREE.DirectionalLight(color, intensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = -110; c.right = 110; c.top = 110; c.bottom = -110; c.near = 1; c.far = 900;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  return sun;
}

const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

function addEscapeZone(scene, heightAt) {
  const W = 520, D = 60, z0 = FIELD.escapeZ + D / 2;
  const geo = new THREE.PlaneGeometry(W, D, 52, 6).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i) + z0;
    pos.setY(i, heightAt(x, z) + 0.35);
  }
  const floor = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: TX.makeZoneTexture('ESCAPE ZONE'), transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
  floor.position.z = z0;
  scene.add(floor);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(W, 70, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  wall.position.set(0, 35, FIELD.escapeZ);
  scene.add(wall);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xff4a2a, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false });
  for (let x = -240; x <= 240; x += 60) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 140, 8), beamMat);
    beam.position.set(x, heightAt(x, FIELD.escapeZ) + 70, FIELD.escapeZ);
    scene.add(beam);
  }
}

export function buildWorld(scene, key) {
  const r = TX.rng(key === 'desert' ? 4 : 8);
  const w = key === 'desert' ? buildDesert(scene, r) : buildCity(scene, r);
  addEscapeZone(scene, w.heightAt);
  return w;
}

/* ------------------------------------------------------------------ */
/*  DESERT VALLEY                                                      */
/* ------------------------------------------------------------------ */
function desertHeight(x, z) {
  const ax = Math.abs(x);
  let h = 2.4 * Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.016) + 1.6 * Math.sin(x * 0.047 - z * 0.031) + 1.0 * Math.sin(z * 0.06 + x * 0.01);
  h *= 1 - smooth((ax - 200) / 40) * 0.5;
  const w = smooth((ax - 215) / 115);
  h += w * w * (100 + 28 * Math.sin(z * 0.013 + x * 0.002) + 14 * Math.sin(z * 0.041 + 2) + 6 * Math.sin(z * 0.11));
  // Plateau beyond the canyon rim
  h += smooth((ax - 360) / 80) * 18;
  return h;
}
const trackX = (z) => Math.sin(z * 0.006) * 70 + Math.sin(z * 0.017) * 18;

function buildDesert(scene, r) {
  const skyTex = skySphere(scene, [[0, '#2f78c8'], [0.32, '#7db6e6'], [0.48, '#ecdcbc'], [0.5, '#f1dcb2'], [1, '#d7b986']]);
  scene.fog = new THREE.Fog(0xe6d0a6, 300, 2000);
  scene.add(new THREE.HemisphereLight(0xfff3dc, 0xb08850, 1.15));
  const sun = makeSun(scene, 0xfff0d2, 2.7);

  // Heightfield terrain with vertex-coloured sand and banded canyon rock
  const geo = new THREE.PlaneGeometry(1500, 2400, 190, 300).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const sandA = new THREE.Color(0xdcbd8c), sandB = new THREE.Color(0xc9a675), dirt = new THREE.Color(0xa88a62);
  const rocks = [new THREE.Color(0xb06e45), new THREE.Color(0xc98d5c), new THREE.Color(0x8c5638), new THREE.Color(0xd2a070)];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = desertHeight(x, z);
    pos.setY(i, h);
    c.copy(sandA).lerp(sandB, 0.5 + 0.5 * Math.sin(x * 0.05 + z * 0.03));
    const onTrack = 1 - smooth((Math.abs(x - trackX(z)) - 6) / 8);
    c.lerp(dirt, onTrack * 0.55);
    const band = rocks[Math.abs(Math.floor(h / 6 + Math.sin(z * 0.02) * 0.6)) % rocks.length];
    c.lerp(band, smooth((h - 9) / 16));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const sand = TX.makeSandTexture();
  sand.repeat.set(70, 110);
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: sand, vertexColors: true, roughness: 1 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // Hoodoo rock pillars near the canyon walls
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xb57a50, roughness: 1, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const x = side * (195 + r() * 40), z = -800 + r() * 1600;
    const h = 18 + r() * 40, rb = 5 + r() * 6;
    const base = desertHeight(x, z);
    const g = new THREE.Group();
    g.position.set(x, base - 2, z);
    let y = 0, rad = rb;
    for (let k = 0; k < 3; k++) {
      const seg = h / 3;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rad * (0.75 + r() * 0.2), rad, seg, 7), pillarMat);
      m.position.y = y + seg / 2;
      m.rotation.y = r() * 3;
      m.castShadow = true;
      g.add(m);
      y += seg;
      rad *= 0.8 + r() * 0.15;
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(rad * 1.6, rad * 1.2, 2.5, 7), pillarMat);
    cap.position.y = y + 1.2;
    g.add(cap);
    scene.add(g);
  }

  // Scattered rocks and dry shrubs
  const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x9a7552, roughness: 1, flatShading: true }), 260);
  const shrubMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x7a7a45, roughness: 1, flatShading: true }), 300);
  for (let i = 0; i < 260; i++) {
    const x = (r() - 0.5) * 520, z = (r() - 0.5) * 1700, s = 0.6 + r() * 2.8;
    setInst(rockMesh, i, new THREE.Vector3(x, desertHeight(x, z) + s * 0.2, z), r() * 6, new THREE.Vector3(s * (1 + r()), s * 0.7, s * (1 + r())), r(), r());
  }
  for (let i = 0; i < 300; i++) {
    const x = (r() - 0.5) * 440, z = (r() - 0.5) * 1700, s = 0.5 + r() * 0.9;
    setInst(shrubMesh, i, new THREE.Vector3(x, desertHeight(x, z) + s * 0.4, z), r() * 6, new THREE.Vector3(s * 1.4, s, s * 1.4));
  }
  rockMesh.castShadow = shrubMesh.castShadow = true;
  scene.add(rockMesh, shrubMesh);

  // Distant mesas outside the canyon
  const mesaMat = new THREE.MeshStandardMaterial({ color: 0xb46c45, roughness: 1, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + r() * 0.3, R = 1500 + r() * 500;
    const h = 120 + r() * 160, rb = 140 + r() * 160;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rb * 0.65, rb, h, 9), mesaMat);
    m.position.set(Math.cos(a) * R, h / 2, Math.sin(a) * R);
    scene.add(m);
  }

  return {
    theme: 'desert', sun, skyTex, sunOffset: new THREE.Vector3(200, 320, 120), heightAt: desertHeight,
    buildings: [], lanes: null, smokeSources: [], dustColor: 0xd2b688,
  };
}

/* ------------------------------------------------------------------ */
/*  RUINED CITY                                                        */
/* ------------------------------------------------------------------ */
export const CITY_LANES = [-180, -90, 0, 90, 180];
export const CITY_STREETS = [-600, -400, -200, 0, 200, 400, 600];
const AVENUE_W = 30;

function buildCity(scene, r) {
  const skyTex = skySphere(scene, [[0, '#23232b'], [0.3, '#4a3e44'], [0.45, '#9a6a52'], [0.5, '#c4865a'], [0.53, '#3a2e2c'], [1, '#141212']]);
  scene.fog = new THREE.Fog(0x5e4e48, 180, 1250);
  scene.add(new THREE.HemisphereLight(0xa0a6b8, 0x2a2420, 1.15));
  const sun = makeSun(scene, 0xffc49a, 2.0);
  const heightAt = () => 0;

  // Ground and streets
  const asphalt = TX.makeAsphaltTexture();
  asphalt.repeat.set(100, 100);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 }));
  ground.receiveShadow = true;
  scene.add(ground);
  const streetTex = TX.makeStreetTexture();
  const L = 1800;
  for (const x of CITY_LANES) {
    const t = streetTex.clone(); t.needsUpdate = true; t.repeat.set(1, L / 60);
    const av = new THREE.Mesh(new THREE.PlaneGeometry(AVENUE_W, L).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
    av.position.set(x, 0.04, 0);
    av.receiveShadow = true;
    scene.add(av);
  }
  for (const z of CITY_STREETS) {
    const t = streetTex.clone(); t.needsUpdate = true; t.repeat.set(1, 440 / 60);
    const st = new THREE.Mesh(new THREE.PlaneGeometry(AVENUE_W, 440).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
    st.rotation.y = Math.PI / 2;
    st.position.set(0, 0.03, z);
    st.receiveShadow = true;
    scene.add(st);
  }

  // Buildings (merged per facade material) + ruin details
  const palettes = ['#3a3d44', '#4a423c', '#33383f', '#45464c', '#3c3438'];
  const mats = palettes.map((wall, i) => {
    const t = TX.makeWindowTextures(300 + i * 13, wall);
    return new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissiveMap, emissive: 0xffb070, emissiveIntensity: 0.45, roughness: 0.75, metalness: 0.2 });
  });
  const buckets = mats.map(() => []);
  const ruinGeos = [];
  const buildings = [];
  const smokeSources = [];
  const rubble = [];

  const boxGeo = (w, h, d, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) { uv.setXY(i, 0.02, 0.99); continue; }
      const span = f < 2 ? d : w;
      uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(span / 16)), uv.getY(i) * Math.max(1, Math.round(h / 24)));
    }
    g.translate(x, y, z);
    return g;
  };

  const makeBuilding = (x, z, w, d, h, ruinChance) => {
    const mi = Math.floor(r() * mats.length);
    const ruined = r() < ruinChance;
    const H = ruined ? h * (0.45 + r() * 0.3) : h;
    buckets[mi].push(boxGeo(w, H, d, x, H / 2, z));
    buildings.push(new THREE.Box3(new THREE.Vector3(x - w / 2, 0, z - d / 2), new THREE.Vector3(x + w / 2, H, z + d / 2)));
    if (ruined) {
      // Jagged broken top: tilted wall chunks and exposed floor slabs
      for (let k = 0; k < 3 + Math.floor(r() * 3); k++) {
        const cw = w * (0.2 + r() * 0.35), cd = d * (0.2 + r() * 0.35), ch = 4 + r() * 16;
        const cx = x + (r() - 0.5) * (w - cw), cz = z + (r() - 0.5) * (d - cd);
        const g = boxGeo(cw, ch, cd, 0, 0, 0);
        g.rotateX((r() - 0.5) * 0.5); g.rotateZ((r() - 0.5) * 0.5);
        g.translate(cx, H + ch / 2 - 1, cz);
        buckets[mi].push(g);
      }
      for (let k = 0; k < 3; k++) {
        const slab = new THREE.BoxGeometry(w * (0.4 + r() * 0.5), 0.8, d * (0.3 + r() * 0.4));
        slab.rotateZ((r() - 0.5) * 0.4);
        slab.translate(x + (r() - 0.5) * w * 0.4, H - 3 - k * 6 * r(), z + (r() < 0.5 ? -1 : 1) * d * 0.45);
        ruinGeos.push(slab);
      }
      for (let k = 0; k < 6; k++) rubble.push([x + (r() - 0.5) * (w + 16), z + (r() - 0.5) * (d + 16), 1.5 + r() * 4]);
      if (r() < 0.4) smokeSources.push(new THREE.Vector3(x, H + 2, z));
    }
  };

  // Inner blocks between avenues (tanks drive on the avenues)
  for (let i = 0; i < CITY_LANES.length - 1; i++) {
    const bx = (CITY_LANES[i] + CITY_LANES[i + 1]) / 2;
    const blockW = CITY_LANES[i + 1] - CITY_LANES[i] - AVENUE_W - 8;
    const zEdges = [-900, ...CITY_STREETS, 900];
    for (let j = 0; j < zEdges.length - 1; j++) {
      const z0 = zEdges[j] + AVENUE_W / 2 + 4, z1 = zEdges[j + 1] - AVENUE_W / 2 - 4;
      const len = z1 - z0;
      const parts = len > 120 ? 2 : 1;
      for (let k = 0; k < parts; k++) {
        if (r() < 0.12) {           // empty, bombed-out lot
          const cz = z0 + (k + 0.5) * (len / parts);
          for (let q = 0; q < 10; q++) rubble.push([bx + (r() - 0.5) * blockW, cz + (r() - 0.5) * len / parts, 1 + r() * 4]);
          continue;
        }
        const segLen = len / parts - 6;
        const cz = z0 + (k + 0.5) * (len / parts);
        const w = blockW * (0.75 + r() * 0.25), d = segLen * (0.7 + r() * 0.3);
        makeBuilding(bx, cz, w, d, 30 + Math.pow(r(), 1.4) * 120, 0.4);
      }
    }
  }
  // Outer districts (taller skyline)
  for (const side of [-1, 1]) {
    for (let x = 250; x < 950; x += 85) {
      for (let z = -1100; z <= 1100; z += 85) {
        if (r() < 0.15) continue;
        const w = 40 + r() * 35, d = 40 + r() * 35;
        makeBuilding(side * (x + (r() - 0.5) * 10), z + (r() - 0.5) * 10, w, d, 60 + Math.pow(r(), 1.3) * 220, 0.3);
      }
    }
  }
  buckets.forEach((list, i) => {
    if (!list.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(list), mats[i]);
    list.forEach((g) => g.dispose());
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
  });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x77736e, roughness: 1 });
  if (ruinGeos.length) {
    const m = new THREE.Mesh(mergeGeometries(ruinGeos), concrete);
    m.castShadow = true;
    scene.add(m);
  }
  const rubbleMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x6b6762, roughness: 1, flatShading: true }), rubble.length);
  rubble.forEach(([x, z, s], i) => setInst(rubbleMesh, i, new THREE.Vector3(x, s * 0.3, z), r() * 6, new THREE.Vector3(s * (1 + r()), s * 0.6, s), r(), r()));
  rubbleMesh.castShadow = true;
  scene.add(rubbleMesh);

  // Broken jersey barriers along the avenues (some knocked over / askew)
  const jersey = new THREE.Shape([[-0.6, 0], [0.6, 0], [0.25, 0.35], [0.15, 1.05], [-0.15, 1.05], [-0.25, 0.35]].map((p) => new THREE.Vector2(p[0], p[1])));
  const jGeo = new THREE.ExtrudeGeometry(jersey, { depth: 3.6, bevelEnabled: false }).translate(0, 0, -1.8);
  const barriers = new THREE.InstancedMesh(jGeo, new THREE.MeshStandardMaterial({ color: 0xa8a49c, roughness: 0.95 }), 400);
  let bc = 0;
  for (const lx of CITY_LANES) {
    for (let z = -820; z < 820 && bc < 400; z += 9) {
      if (r() < 0.55) continue;
      if (CITY_STREETS.some((s) => Math.abs(s - z) < 18)) continue;
      const side = r() < 0.5 ? -1 : 1;
      const broken = r() < 0.3;
      const x = lx + side * (AVENUE_W / 2 - 1 + (broken ? -r() * 5 : 0));
      setInst(barriers, bc++, new THREE.Vector3(x, 0, z), (broken ? (r() - 0.5) * 1.6 : 0), 1, 0, broken && r() < 0.4 ? side * 1.4 : 0);
    }
  }
  barriers.count = bc;
  barriers.castShadow = true;
  scene.add(barriers);

  // Burnt-out cars
  const carGeo = mergeGeometries([
    new THREE.BoxGeometry(2, 0.9, 4.4).translate(0, 0.75, 0),
    new THREE.BoxGeometry(1.8, 0.7, 2.2).translate(0, 1.5, -0.3),
    new THREE.CylinderGeometry(0.4, 0.4, 2.1, 8).rotateZ(Math.PI / 2).translate(0, 0.4, 1.4),
    new THREE.CylinderGeometry(0.4, 0.4, 2.1, 8).rotateZ(Math.PI / 2).translate(0, 0.4, -1.4),
  ]);
  const cars = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.9, metalness: 0.3 }), 60);
  for (let i = 0; i < 60; i++) {
    const lx = CITY_LANES[Math.floor(r() * CITY_LANES.length)];
    setInst(cars, i, new THREE.Vector3(lx + (r() < 0.5 ? -1 : 1) * (8 + r() * 5), 0, -800 + r() * 1600), r() * 6, 1, 0, r() < 0.15 ? Math.PI : 0);
  }
  cars.castShadow = true;
  scene.add(cars);

  return {
    theme: 'city', sun, skyTex, sunOffset: new THREE.Vector3(-260, 260, 160), heightAt,
    buildings, lanes: CITY_LANES, streets: CITY_STREETS, smokeSources, dustColor: 0x6a6460,
  };
}
