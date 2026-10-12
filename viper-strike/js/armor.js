// Armoured vehicles at real-world scale (metres). +z = forward, +x = left (vehicle's left), ground at y = 0.
//   M1A2 Abrams (allied MBT, optional TUSK kit) · T-72B3 / T-90 (opposing MBTs) · 2K22 Tunguska (tracked AA, SAM)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loft, profileX, planY, box, cyl, trackBelt, normalizeGeo, mergeStatic } from './geo.js';
import * as MAT from './materials.js';

const V3 = THREE.Vector3;

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */
function adder(defaultParent) {
  return (geo, mat, x = 0, y = 0, z = 0, parent = defaultParent) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
}

/** Merge several (geometry, materialIndex) pairs into one multi-material geometry. */
function multiGeo(parts) {
  const geos = [];
  for (let mi = 0; mi < 3; mi++) {
    const list = parts.filter((p) => p[1] === mi).map((p) => normalizeGeo(p[0]));
    geos.push(list.length ? mergeGeometries(list) : null);
  }
  const used = geos.map((g, i) => [g, i]).filter(([g]) => g);
  const merged = mergeGeometries(used.map(([g]) => g), true);
  used.forEach(([, mi], k) => { merged.groups[k].materialIndex = mi; });
  return merged;
}

/** Dual road wheel: rubber tyres, dished steel discs, hub cap. Materials: [rubber, paint, steel]. */
function roadWheelGeo(r, w) {
  const parts = [];
  for (const s of [-1, 1]) {
    const x = s * w * 0.27;
    parts.push([cyl(r, r, w * 0.36, 24, 'x').translate(x, 0, 0), 0]);
    parts.push([cyl(r * 0.78, r * 0.78, w * 0.36 + 0.012, 24, 'x').translate(x, 0, 0), 1]);
    parts.push([cyl(r * 0.25, r * 0.25, w * 0.36 + 0.05, 10, 'x').translate(x, 0, 0), 2]);
    for (let k = 0; k < 8; k++) {               // lightening holes / bolts
      const a = (k / 8) * Math.PI * 2;
      parts.push([cyl(r * 0.07, r * 0.07, w * 0.36 + 0.03, 6, 'x').translate(x, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5), 2]);
    }
  }
  return multiGeo(parts);
}

/** Drive sprocket with teeth. */
function sprocketGeo(r, w) {
  const parts = [[cyl(r * 0.55, r * 0.55, w * 0.8, 16, 'x'), 1], [cyl(r * 0.22, r * 0.22, w * 0.9, 10, 'x'), 2]];
  for (const s of [-1, 1]) {
    parts.push([cyl(r * 0.88, r * 0.88, 0.06, 24, 'x').translate(s * w * 0.22, 0, 0), 2]);
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2;
      const t = box(0.07, 0.12, 0.1);
      t.rotateX(-a);
      t.translate(s * w * 0.22, Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
      parts.push([t, 2]);
    }
  }
  return multiGeo(parts);
}

/**
 * Tracks, road wheels, idlers, sprockets and return rollers for both sides.
 * Returns { wheels, trackMat }.
 */
function runningGear(parent, M, spec) {
  const { trackX, trackW, wheelR, wheels, idler, sprocket, rollers, rollerY, t = 0.07 } = spec;
  const add = adder(parent);
  const trackMat = MAT.trackMaterial();
  const wheelMats = [M.rubber, M.paint, M.steel];
  const wheelObjs = [];
  const wy = wheelR + t;
  const rwGeo = roadWheelGeo(wheelR, trackW);
  const idGeo = roadWheelGeo(idler[2], trackW * 0.95);
  const spGeo = sprocketGeo(sprocket[2], trackW);
  for (const s of [-1, 1]) {
    const x = s * trackX;
    const belt = new THREE.Mesh(trackBelt({ idler, sprocket, wheels, wheelR, w: trackW, t, topY: rollerY + 0.05 }), trackMat);
    belt.position.x = x;
    belt.castShadow = true;
    belt.receiveShadow = true;
    parent.add(belt);
    for (const z of wheels) {
      const m = new THREE.Mesh(rwGeo, wheelMats);
      m.position.set(x, wy, z);
      m.castShadow = true;
      m.userData.r = wheelR;
      parent.add(m);
      wheelObjs.push(m);
    }
    const id = new THREE.Mesh(idGeo, wheelMats);
    id.position.set(x, idler[1], idler[0]);
    id.userData.r = idler[2];
    parent.add(id);
    wheelObjs.push(id);
    const sp = new THREE.Mesh(spGeo, wheelMats);
    sp.position.set(x, sprocket[1], sprocket[0]);
    sp.userData.r = sprocket[2];
    parent.add(sp);
    wheelObjs.push(sp);
    for (const z of rollers) add(cyl(0.11, 0.11, trackW * 0.5, 12, 'x'), M.steel, x, rollerY, z);
    // suspension arms (torsion bar arms) behind each road wheel
    for (const z of wheels) {
      const arm = add(box(0.1, 0.1, 0.45), M.paint, x - s * trackW * 0.55, wy + 0.12, z + 0.2);
      arm.rotation.x = -0.45;
    }
  }
  return { wheels: wheelObjs, trackMat };
}

function smokeLaunchers(add, mat, x, y, z, s, n = 6, rows = 2) {
  add(box(0.18, 0.22, 0.42), mat, x, y, z);
  const per = n / rows;
  for (let r = 0; r < rows; r++) for (let i = 0; i < per; i++) {
    const tube = add(cyl(0.042, 0.042, 0.24, 10, 'z'), mat, x + s * 0.06, y + 0.05 + r * 0.1, z - 0.12 + i * 0.12);
    tube.rotation.set(-0.65, s * 0.5, 0);
  }
}

/* ------------------------------------------------------------------ */
/*  M1A2 Abrams                                                        */
/* ------------------------------------------------------------------ */
export function buildAbrams({ paint = 0xbca984, seed = 3, tusk = false } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const M = {
    paint: MAT.armorPaint(paint, seed),
    rubber: MAT.plain(0x161616, 0.95, 0.0),
    steel: MAT.plain(0x5f6064, 0.45, 0.85),
    dark: MAT.plain(0x202224, 0.75, 0.4),
    black: MAT.plain(0x0c0c0c, 0.6, 0.2),
    glass: MAT.sensorGlass(),
    grille: MAT.grilleMaterial(),
    bag: MAT.plain(0x6d6a4b, 0.95, 0.0),
    can: MAT.plain(0x4f5536, 0.7, 0.3),
  };
  const add = adder(body);
  const gear = runningGear(body, M, {
    trackX: 1.42, trackW: 0.64, wheelR: 0.33,
    wheels: [2.45, 1.62, 0.79, -0.04, -0.87, -1.70, -2.53],
    idler: [3.25, 0.62, 0.3], sprocket: [-3.32, 0.66, 0.36], rollers: [1.9, 0.2, -1.5], rollerY: 1.0,
  });

  // Hull
  add(profileX([[3.30, 0.48], [3.95, 1.00], [2.30, 1.36], [-3.70, 1.40], [-3.93, 1.30], [-3.93, 0.62], [-3.55, 0.48]], 2.3), M.paint);
  for (const s of [-1, 1]) {
    add(box(0.68, 0.18, 7.45), M.paint, s * 1.46, 1.31, -0.12);                      // sponson deck over the tracks
    const ff = add(box(0.68, 0.05, 0.62), M.paint, s * 1.46, 1.13, 3.62); ff.rotation.x = 0.42;   // front fender
    add(profileX([[3.82, 1.24], [3.62, 0.60], [-3.02, 0.60], [-3.28, 1.24]], 0.07), M.paint, s * 1.83, 0, 0);   // side skirt
    add(box(0.14, 0.62, 1.55), M.paint, s * 1.88, 0.92, 2.78);                        // heavy ballistic skirt section
    for (let z = 1.9; z > -3.0; z -= 1.1) add(box(0.012, 0.6, 0.02), M.black, s * 1.87, 0.92, z);   // skirt panel seams
    if (tusk) {
      for (let z = 2.9; z > -2.7; z -= 0.42) for (const y of [0.78, 1.06]) add(box(0.1, 0.25, 0.38), M.paint, s * 1.96, y, z);   // ARAT reactive tiles
    }
    // Headlight clusters with brush guards
    add(box(0.24, 0.16, 0.16), M.dark, s * 1.5, 1.33, 3.52);
    add(cyl(0.05, 0.05, 0.03, 10, 'z'), MAT.lamp(0xfff2c8), s * 1.44, 1.34, 3.61);
    add(cyl(0.035, 0.035, 0.03, 8, 'z'), MAT.lamp(0xffb030), s * 1.57, 1.34, 3.61);
    add(box(0.3, 0.03, 0.03), M.steel, s * 1.5, 1.44, 3.63);
    add(box(0.12, 0.14, 0.12), M.steel, s * 0.75, 0.78, 3.55);                        // tow eyes
    add(box(0.2, 0.12, 0.05), MAT.lamp(s > 0 ? 0xff2a1a : 0xffa020), s * 1.62, 1.32, -3.88);   // tail lights
    add(box(0.5, 0.06, 1.55), M.grille, s * 1.45, 1.41, -2.55);                       // deck side grilles
    add(box(0.6, 0.4, 0.02), M.rubber, s * 1.46, 0.95, -3.8);                         // rear mud flaps
  }
  // Driver's hatch and periscopes
  add(cyl(0.32, 0.32, 0.07, 18, 'y'), M.paint, 0, 1.36, 2.4);
  for (const x of [-0.18, 0, 0.18]) add(box(0.12, 0.07, 0.08), M.glass, x, 1.39, 2.68);
  // Engine deck grilles and rear turbine exhaust
  add(box(1.9, 0.04, 1.2), M.grille, 0, 1.41, -1.85);
  add(box(1.9, 0.04, 0.9), M.grille, 0, 1.41, -3.0);
  add(box(1.6, 0.55, 0.06), M.grille, 0, 1.0, -3.95);
  add(box(0.25, 0.25, 0.18), M.steel, 0, 0.72, -3.98);                                // tow pintle
  add(box(0.22, 0.3, 0.15), M.dark, -1.3, 1.05, -3.95);                               // tank-infantry phone box

  // Turret
  const turret = new THREE.Group();
  turret.position.set(0, 1.4, -0.35);
  body.add(turret);
  const tadd = adder(turret);
  const outline = [[0.62, 2.25], [1.72, 1.15], [1.85, -0.4], [1.80, -1.9], [1.55, -2.2], [-1.55, -2.2], [-1.80, -1.9], [-1.85, -0.4], [-1.72, 1.15], [-0.62, 2.25]];
  const top = [[0.58, 2.12], [1.62, 1.08], [1.74, -0.38], [1.70, -1.82], [1.47, -2.1], [-1.47, -2.1], [-1.70, -1.82], [-1.74, -0.38], [-1.62, 1.08], [-0.58, 2.12]];
  tadd(loft([outline.map(([x, z]) => new V3(x, 0, z)), top.map(([x, z]) => new V3(x, 0.88, z))]), M.paint);
  tadd(box(1.05, 0.62, 0.5), M.paint, 0, 0.42, 2.2);                                  // gun shield
  tadd(cyl(0.05, 0.05, 0.08, 8, 'z'), M.black, 0.34, 0.42, 2.46);                     // coax MG port
  // Gunner's primary sight "doghouse" (right front)
  tadd(box(0.55, 0.42, 0.8), M.paint, -0.95, 1.09, 1.25);
  tadd(box(0.38, 0.22, 0.02), M.glass, -0.95, 1.12, 1.66);
  tadd(box(0.6, 0.04, 0.5), M.paint, -0.95, 1.32, 1.35);
  // Commander's Independent Thermal Viewer (left front)
  tadd(cyl(0.14, 0.16, 0.3, 14, 'y'), M.paint, 0.95, 1.03, 0.95);
  tadd(box(0.34, 0.3, 0.3), M.paint, 0.95, 1.33, 0.95);
  tadd(box(0.22, 0.14, 0.02), M.glass, 0.95, 1.35, 1.11);
  // Commander's station + CROWS remote weapon station
  tadd(cyl(0.42, 0.42, 0.14, 20, 'y'), M.paint, -0.72, 0.95, -0.4);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; tadd(box(0.1, 0.07, 0.04), M.glass, -0.72 + Math.sin(a) * 0.42, 0.98, -0.4 + Math.cos(a) * 0.42).rotation.y = a; }
  tadd(cyl(0.16, 0.18, 0.28, 12, 'y'), M.dark, -0.72, 1.16, 0.12);
  tadd(box(0.5, 0.3, 0.6), M.paint, -0.72, 1.44, 0.12);
  tadd(box(0.18, 0.16, 0.66), M.dark, -0.72, 1.42, 0.5);
  tadd(cyl(0.03, 0.03, 1.15, 8, 'z'), M.dark, -0.72, 1.43, 1.25);
  tadd(box(0.2, 0.2, 0.24), M.paint, -1.02, 1.46, 0.2);
  tadd(box(0.14, 0.1, 0.02), M.glass, -1.02, 1.48, 0.33);
  tadd(box(0.26, 0.18, 0.32), M.can, -0.42, 1.36, 0.0);
  // Loader's hatch + M240 with armoured gun shield
  tadd(box(0.66, 0.06, 0.66), M.paint, 0.72, 0.92, -0.45);
  tadd(box(0.1, 0.12, 0.55), M.dark, 0.72, 1.25, 0.12);
  tadd(cyl(0.018, 0.018, 0.7, 6, 'z'), M.dark, 0.72, 1.26, 0.72);
  tadd(box(0.52, 0.4, 0.03), M.paint, 0.72, 1.24, 0.42);
  tadd(box(0.14, 0.1, 0.035), M.glass, 0.72, 1.32, 0.43);
  tadd(box(0.03, 0.36, 0.42), M.paint, 0.98, 1.22, 0.22);
  tadd(cyl(0.025, 0.025, 0.45, 6, 'y'), M.steel, 0.72, 1.0, 0.12);
  // Roof blow-out panels, wind sensor, antennas
  for (const s of [-1, 1]) tadd(box(0.72, 0.02, 0.95), M.paint, s * 0.48, 0.9, -1.45);
  tadd(cyl(0.015, 0.015, 0.7, 6, 'y'), M.steel, 0.25, 1.23, -1.95);
  tadd(box(0.22, 0.03, 0.03), M.steel, 0.25, 1.58, -1.95);
  for (const s of [-1, 1]) {
    tadd(cyl(0.06, 0.07, 0.12, 10, 'y'), M.dark, s * 1.35, 0.94, -1.85);
    const whip = tadd(cyl(0.008, 0.012, 2.4, 5, 'y'), M.black, s * 1.35, 2.2, -2.0);
    whip.rotation.x = -0.12;
    smokeLaunchers(tadd, M.paint, s * 1.68, 0.6, 0.9, s);
    tadd(box(0.1, 0.42, 1.0), M.paint, s * 1.83, 0.5, -1.25);                        // turret side stowage
  }
  // Bustle rack with stowage
  for (const s of [-1, 1]) for (const z of [-2.25, -2.95]) tadd(box(0.04, 0.64, 0.04), M.steel, s * 1.55, 0.5, z);
  tadd(box(3.12, 0.04, 0.04), M.steel, 0, 0.82, -2.95);
  for (const s of [-1, 1]) tadd(box(0.04, 0.04, 0.72), M.steel, s * 1.55, 0.82, -2.6);
  tadd(box(3.12, 0.03, 0.75), M.steel, 0, 0.2, -2.6);
  for (let x = -1.4; x <= 1.41; x += 0.28) tadd(box(0.02, 0.6, 0.02), M.steel, x, 0.5, -2.96);
  tadd(box(0.9, 0.45, 0.6), M.bag, -0.85, 0.45, -2.6);
  tadd(box(1.0, 0.38, 0.6), M.bag, 0.25, 0.41, -2.62);
  tadd(box(0.55, 0.55, 0.55), M.bag, 1.1, 0.5, -2.6);
  tadd(box(0.3, 0.2, 0.16), M.can, -0.2, 0.32, -2.3);

  // 120 mm M256 main gun (elevates; barrel recoils)
  const gun = new THREE.Group();
  gun.position.set(0, 0.45, 2.2);
  turret.add(gun);
  const gadd = adder(gun);
  gadd(box(0.62, 0.46, 0.28), M.rubber, 0, -0.03, 0.32);                              // dust cover
  const recoil = new THREE.Group();
  gun.add(recoil);
  const radd = adder(recoil);
  radd(cyl(0.15, 0.15, 0.5, 18, 'z'), M.paint, 0, 0, 0.6);
  radd(cyl(0.075, 0.085, 5.1, 18, 'z'), M.paint, 0, 0, 3.2);
  for (const z of [1.25, 2.0, 3.55, 4.35]) radd(cyl(0.104, 0.104, 0.68, 18, 'z'), M.paint, 0, 0, z);   // thermal shroud
  radd(cyl(0.135, 0.135, 0.62, 18, 'z'), M.paint, 0, 0, 2.78);                      // bore evacuator
  for (const z of [2.43, 3.13]) radd(cyl(0.135, 0.104, 0.1, 18, 'z'), M.paint, 0, 0, z + (z > 2.8 ? 0.02 : -0.02));
  radd(cyl(0.095, 0.095, 0.14, 16, 'z'), M.paint, 0, 0, 5.72);
  radd(box(0.09, 0.07, 0.16), M.dark, 0, 0.12, 5.62);                                // muzzle reference sensor
  const tip = new THREE.Object3D();
  tip.position.set(0, 0, 5.9);
  recoil.add(tip);

  mergeStatic(body, [turret, ...gear.wheels]);
  mergeStatic(turret, [gun]);
  mergeStatic(recoil);
  return { root, body, turret, gun, recoil, muzzles: [tip], rocketTip: null, wheels: gear.wheels, trackMat: gear.trackMat, paintMats: [M.paint], spinners: [], hpHeight: 3.7, hitScale: 1.3, recoilDist: 0.45 };
}

/* ------------------------------------------------------------------ */
/*  T-72B3 / T-90                                                      */
/* ------------------------------------------------------------------ */
export function buildEastMBT({ paint = 0x4f5733, camo = null, seed = 5, t90 = false } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const M = {
    paint: MAT.armorPaint(paint, seed, camo),
    rubber: MAT.plain(0x171717, 0.95, 0.0),
    steel: MAT.plain(0x5a5c5f, 0.45, 0.85),
    dark: MAT.plain(0x222320, 0.75, 0.35),
    black: MAT.plain(0x0c0c0c, 0.6, 0.2),
    glass: MAT.sensorGlass(),
    grille: MAT.grilleMaterial(),
    wood: MAT.plain(0x5a4630, 0.95, 0.0),
    drum: MAT.plain(0x3f4630, 0.7, 0.4),
  };
  const add = adder(body);
  const gear = runningGear(body, M, {
    trackX: 1.33, trackW: 0.58, wheelR: 0.375,
    wheels: [2.28, 1.42, 0.56, -0.30, -1.16, -2.02],
    idler: [2.95, 0.58, 0.28], sprocket: [-2.95, 0.62, 0.32], rollers: [1.85, 0.15, -1.55], rollerY: 0.98,
  });

  // Hull
  add(profileX([[2.95, 0.46], [3.42, 0.92], [2.30, 1.30], [-3.30, 1.33], [-3.42, 1.15], [-3.40, 0.62], [-3.05, 0.46]], 2.2), M.paint);
  for (const s of [-1, 1]) {
    add(box(0.62, 0.04, 6.6), M.paint, s * 1.42, 1.04, -0.15);                        // fenders
    const ff = add(box(0.62, 0.04, 0.5), M.paint, s * 1.42, 0.95, 3.27); ff.rotation.x = 0.45;
    add(box(0.02, 0.42, 5.9), M.rubber, s * 1.74, 0.83, -0.2);                        // rubber-fabric side screens
    const era = t90 ? 7 : 4;
    for (let i = 0; i < era; i++) add(box(0.09, 0.32, 0.42), M.paint, s * 1.78, 0.86, 2.6 - i * 0.46);   // skirt ERA
  }
  // Kontakt-5 ERA on the upper glacis + V splash board
  for (const t of [0.3, 0.68]) for (const x of [-0.78, -0.26, 0.26, 0.78]) {
    const b = add(box(0.48, 0.13, 0.46), M.paint, x, 0.92 + 0.38 * t + 0.08, 3.42 - 1.12 * t);
    b.rotation.x = 0.32;
  }
  for (const s of [-1, 1]) { const v = add(box(0.03, 0.1, 0.9), M.paint, s * 0.32, 1.33, 2.5); v.rotation.y = s * 0.6; }
  const blade = add(box(2.1, 0.32, 0.06), M.paint, 0, 0.7, 3.24); blade.rotation.x = -0.75;   // self-entrenching blade
  add(cyl(0.27, 0.27, 0.05, 16, 'y'), M.paint, 0, 1.31, 2.15);                        // driver's hatch
  add(box(0.25, 0.07, 0.08), M.glass, 0, 1.33, 2.42);
  for (const s of [-1, 1]) {
    add(cyl(0.08, 0.08, 0.1, 12, 'z'), M.dark, s * 1.32, 1.14, 3.05);
    add(cyl(0.06, 0.06, 0.02, 12, 'z'), MAT.lamp(0xfff0c0), s * 1.32, 1.14, 3.1);
    add(box(0.14, 0.14, 0.12), M.steel, s * 0.7, 0.66, 3.05);                         // tow hooks
  }
  // Fender stowage: external fuel cells (right) and stowage boxes (left), exhaust on left rear
  for (const z of [-0.6, -1.4, -2.2]) add(box(0.5, 0.42, 0.72), M.paint, -1.42, 1.27, z);
  for (const z of [0.2, -1.0, -2.2]) add(box(0.5, 0.34, 0.85), M.paint, 1.42, 1.23, z);
  add(box(0.3, 0.25, 0.4), M.grille, 1.6, 1.05, -2.95);
  // Engine deck grilles, rear fuel drums and unditching log
  add(box(1.6, 0.03, 1.4), M.grille, 0, 1.34, -1.95);
  add(box(1.6, 0.03, 0.55), M.grille, 0, 1.34, -2.95);
  for (const s of [-1, 1]) {
    add(cyl(0.29, 0.29, 0.95, 18, 'x'), M.drum, s * 0.62, 1.03, -3.62);
    for (const dx of [-0.32, 0.32]) add(cyl(0.3, 0.3, 0.03, 18, 'x'), M.steel, s * 0.62 + dx, 1.03, -3.62);
  }
  add(cyl(0.13, 0.13, 3.2, 12, 'x'), M.wood, 0, 1.48, -3.25);
  for (const s of [-1, 1]) add(box(0.08, 0.2, 0.3), M.steel, s * 1.1, 1.4, -3.25);

  // Turret: low cast dome
  const turret = new THREE.Group();
  turret.position.set(0, 1.33, -0.15);
  body.add(turret);
  const tadd = adder(turret);
  const dome = new THREE.LatheGeometry([[0, 0], [1.0, 0], [1.0, 0.18], [0.95, 0.45], [0.78, 0.68], [0.45, 0.82], [0, 0.85]].map(([x, y]) => new THREE.Vector2(x, y)), 36);
  const domeM = tadd(dome, M.paint, 0, 0, -0.1);
  domeM.scale.set(1.5, 1, 1.66);
  // Kontakt-5 turret "horseshoe" ERA blocks either side of the gun
  for (const s of [-1, 1]) {
    tadd(planY([[s * 0.34, 1.52], [s * 1.12, 1.16], [s * 1.08, 0.58], [s * 0.36, 0.82]], 0.3), M.paint, 0, 0.42, 0);
    for (let i = 0; i < 3; i++) tadd(box(0.012, 0.28, 0.02), M.black, s * (0.52 + i * 0.2), 0.58, 1.38 - i * 0.12);
  }
  tadd(box(0.9, 0.12, 0.5), M.paint, 0, 0.78, 0.9);                                    // roof ERA bricks
  if (t90) {
    for (const s of [-1, 1]) {                                                         // Shtora-1 IR dazzlers
      tadd(box(0.38, 0.32, 0.3), M.paint, s * 0.78, 0.58, 1.58);
      tadd(cyl(0.12, 0.12, 0.02, 16, 'z'), MAT.plain(0x5a0a0a, 0.1, 0.6, { emissive: 0x3a0000 }), s * 0.78, 0.58, 1.74);
      tadd(box(0.12, 0.08, 0.12), M.dark, s * 0.95, 0.88, -0.1);                        // laser warning receivers
    }
  }
  // Commander's cupola with 12.7 mm Kord
  tadd(cyl(0.4, 0.42, 0.2, 18, 'y'), M.paint, -0.55, 0.9, -0.35);
  for (let k = 0; k < 4; k++) tadd(box(0.1, 0.06, 0.04), M.glass, -0.55 + Math.sin(k * 1.2 - 0.6) * 0.4, 0.95, -0.35 + Math.cos(k * 1.2 - 0.6) * 0.4).rotation.y = k * 1.2 - 0.6;
  tadd(box(0.12, 0.14, 0.62), M.dark, -0.55, 1.15, -0.05);
  tadd(cyl(0.025, 0.025, 1.2, 8, 'z'), M.dark, -0.55, 1.16, 0.85);
  tadd(box(0.26, 0.18, 0.3), M.drum, -0.36, 1.08, -0.15);
  // Gunner's hatch and Sosna-U sight
  tadd(cyl(0.3, 0.3, 0.06, 16, 'y'), M.paint, 0.55, 0.86, -0.4);
  tadd(box(0.48, 0.42, 0.55), M.paint, 0.62, 0.98, 0.55);
  tadd(box(0.3, 0.18, 0.02), M.glass, 0.62, 1.02, 0.83);
  // Smoke dischargers (902B), stowage, snorkel, antenna, wind sensor
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const tube = tadd(cyl(0.045, 0.045, 0.3, 10, 'z'), M.paint, s * (1.32 + i * 0.03), 0.6, 0.55 - i * 0.24);
      tube.rotation.set(-0.6, s * 0.4, 0);
    }
    tadd(box(0.26, 0.36, 0.95), M.paint, s * 1.48, 0.32, -0.95);
  }
  tadd(cyl(0.1, 0.1, 1.8, 12, 'x'), M.paint, 0, 0.5, -1.72);
  tadd(box(1.7, 0.4, 0.4), M.paint, 0, 0.32, -1.92);                                  // rear turret stowage
  tadd(cyl(0.05, 0.06, 0.1, 8, 'y'), M.dark, 0.95, 0.72, -1.2);
  tadd(cyl(0.008, 0.012, 2.4, 5, 'y'), M.black, 0.95, 1.95, -1.3).rotation.x = -0.12;
  tadd(cyl(0.015, 0.015, 0.6, 6, 'y'), M.steel, -0.15, 1.1, -0.95);

  // 125 mm 2A46M-5
  const gun = new THREE.Group();
  gun.position.set(0, 0.42, 1.55);
  turret.add(gun);
  const gadd = adder(gun);
  gadd(cyl(0.3, 0.32, 0.45, 18, 'z'), M.paint, 0, 0, 0.12);                           // cast mantlet
  gadd(cyl(0.2, 0.3, 0.2, 18, 'z'), M.rubber, 0, 0, 0.42);                            // dust boot
  const recoil = new THREE.Group();
  gun.add(recoil);
  const radd = adder(recoil);
  radd(cyl(0.075, 0.09, 6.0, 18, 'z'), M.paint, 0, 0, 3.35);
  for (const z of [1.1, 2.25, 4.6]) radd(cyl(0.105, 0.105, 0.95, 18, 'z'), M.paint, 0, 0, z);
  radd(cyl(0.14, 0.14, 0.75, 18, 'z'), M.paint, 0, 0, 3.4);
  radd(cyl(0.09, 0.09, 0.12, 16, 'z'), M.paint, 0, 0, 6.32);
  const tip = new THREE.Object3D();
  tip.position.set(0, 0, 6.45);
  recoil.add(tip);

  mergeStatic(body, [turret, ...gear.wheels]);
  mergeStatic(turret, [gun]);
  mergeStatic(recoil);
  return { root, body, turret, gun, recoil, muzzles: [tip], rocketTip: null, wheels: gear.wheels, trackMat: gear.trackMat, paintMats: [M.paint], spinners: [], hpHeight: 3.3, hitScale: 1.2, recoilDist: 0.4 };
}

/* ------------------------------------------------------------------ */
/*  2K22 Tunguska (tracked air-defence: twin 30 mm cannons + SAMs)    */
/* ------------------------------------------------------------------ */
export function buildTunguska({ paint = 0x4f5733, camo = null, seed = 9 } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const M = {
    paint: MAT.armorPaint(paint, seed, camo),
    rubber: MAT.plain(0x171717, 0.95, 0.0),
    steel: MAT.plain(0x5a5c5f, 0.45, 0.85),
    dark: MAT.plain(0x222320, 0.75, 0.35),
    black: MAT.plain(0x0c0c0c, 0.6, 0.2),
    glass: MAT.sensorGlass(),
    grille: MAT.grilleMaterial(),
    radar: MAT.plain(0x8a8f86, 0.5, 0.6),
  };
  const add = adder(body);
  const gear = runningGear(body, M, {
    trackX: 1.3, trackW: 0.48, wheelR: 0.3,
    wheels: [2.75, 1.68, 0.61, -0.46, -1.53, -2.6],
    idler: [3.42, 0.6, 0.26], sprocket: [-3.4, 0.64, 0.3], rollers: [2.1, 0.0, -2.1], rollerY: 0.98,
  });

  // Hull (GM-352 chassis)
  add(profileX([[3.50, 0.50], [3.88, 0.95], [3.10, 1.58], [-3.80, 1.60], [-3.90, 1.45], [-3.88, 0.62], [-3.55, 0.50]], 2.3), M.paint);
  for (const s of [-1, 1]) {
    add(box(0.5, 0.04, 7.2), M.paint, s * 1.38, 1.15, -0.1);
    add(box(0.02, 0.4, 6.6), M.rubber, s * 1.62, 0.95, -0.2);
    for (const z of [1.6, 0.2, -1.4]) add(box(0.45, 0.3, 0.9), M.paint, s * 1.38, 1.32, z);   // fender bins
    add(box(0.35, 0.3, 0.6), M.grille, s * 1.0, 1.61, -3.1);
    add(cyl(0.07, 0.07, 0.1, 12, 'z'), M.dark, s * 1.25, 1.22, 3.55);
    add(cyl(0.05, 0.05, 0.02, 12, 'z'), MAT.lamp(0xfff0c0), s * 1.25, 1.22, 3.61);
    add(box(0.12, 0.14, 0.12), M.steel, s * 0.75, 0.7, 3.62);
  }
  for (let i = 0; i < 4; i++) add(box(0.48, 0.05, 0.18), M.dark, -0.6 + i * 0.4, 1.32, 3.45 - i * 0.02).rotation.x = 0.7;   // spare track links on glacis
  add(cyl(0.27, 0.27, 0.06, 16, 'y'), M.paint, 0.6, 1.6, 2.7);                         // driver's hatch
  for (const x of [0.48, 0.72]) add(box(0.14, 0.07, 0.08), M.glass, x, 1.62, 2.98);
  add(box(1.6, 0.03, 1.3), M.grille, 0, 1.61, -2.2);

  // Turret
  const turret = new THREE.Group();
  turret.position.set(0, 1.6, -0.5);
  body.add(turret);
  const tadd = adder(turret);
  tadd(profileX([[1.85, 0], [2.15, 0.55], [1.75, 1.15], [-1.75, 1.2], [-2.05, 0.95], [-1.95, 0]], 2.5), M.paint);
  tadd(profileX([[1.6, 1.15], [1.45, 1.27], [-1.5, 1.3], [-1.7, 1.2]], 2.2), M.paint);   // roof plate
  for (const [x, z] of [[0.62, -0.2], [-0.62, -0.2]]) {
    tadd(cyl(0.3, 0.3, 0.07, 16, 'y'), M.paint, x, 1.32, z);
    tadd(box(0.12, 0.08, 0.05), M.glass, x, 1.36, z + 0.32);
  }
  for (const s of [-1, 1]) {
    smokeLaunchers(tadd, M.paint, s * 1.18, 0.7, 1.6, s, 6, 2);
    tadd(cyl(0.008, 0.012, 2.2, 5, 'y'), M.black, s * 1.05, 2.4, -1.75).rotation.x = -0.1;
  }
  // Tracking radar dish (front)
  tadd(box(0.32, 0.38, 0.32), M.paint, 0, 1.47, 1.05);
  const dish = tadd(new THREE.SphereGeometry(0.62, 24, 10, 0, Math.PI * 2, 0, 0.62).rotateX(-Math.PI / 2), M.radar, 0, 1.85, 1.35);
  void dish;
  tadd(cyl(0.035, 0.035, 0.5, 8, 'z'), M.dark, 0, 1.85, 1.35);
  // Surveillance radar (rear, rotating)
  tadd(cyl(0.1, 0.12, 0.5, 12, 'y'), M.dark, 0, 1.52, -1.3);
  const radar = new THREE.Group();
  radar.position.set(0, 1.85, -1.3);
  turret.add(radar);
  const ant = adder(radar)(box(1.9, 0.62, 0.08), M.radar, 0, 0.1, 0);
  ant.rotation.x = 0.18;
  for (const s of [-1, 1]) adder(radar)(box(0.04, 0.4, 0.3), M.dark, s * 0.7, -0.1, -0.12);
  for (let i = 0; i < 6; i++) adder(radar)(box(0.012, 0.56, 0.01), M.dark, -0.8 + i * 0.32, 0.1, 0.05);

  // Elevating cradle: two 2A38M twin 30 mm cannons + four 9M311 SAM canisters per side
  const gun = new THREE.Group();
  gun.position.set(0, 0.78, 0.35);
  turret.add(gun);
  const gadd = adder(gun);
  const recoil = new THREE.Group();
  gun.add(recoil);
  const radd = adder(recoil);
  const muzzles = [];
  let rocketTip = null;
  for (const s of [-1, 1]) {
    const x = s * 1.42;
    gadd(box(0.3, 0.55, 1.05), M.paint, x, 0, 0);
    gadd(cyl(0.18, 0.18, 0.32, 14, 'x'), M.steel, s * 1.27, 0, 0);
    for (const y of [-0.13, 0.13]) {
      radd(cyl(0.065, 0.065, 1.0, 12, 'z'), M.paint, x, y, 0.95);
      radd(cyl(0.038, 0.042, 2.3, 10, 'z'), M.dark, x, y, 1.7);
      radd(cyl(0.058, 0.058, 0.2, 10, 'z'), M.dark, x, y, 2.88);
      const mt = new THREE.Object3D();
      mt.position.set(x, y, 3.02);
      recoil.add(mt);
      muzzles.push(mt);
    }
    for (const ox of [0.36, 0.6]) for (const y of [0.18, 0.43]) {
      gadd(cyl(0.11, 0.11, 2.45, 14, 'z'), M.paint, s * (1.42 + ox), y, 0.35);
      gadd(new THREE.CircleGeometry(0.1, 14), M.dark, s * (1.42 + ox), y, 1.58);
    }
    gadd(box(0.62, 0.05, 2.3), M.steel, s * 1.9, 0.04, 0.35);                         // canister mount rail
    if (s > 0) { rocketTip = new THREE.Object3D(); rocketTip.position.set(s * 1.9, 0.3, 1.8); gun.add(rocketTip); }
  }

  mergeStatic(body, [turret, ...gear.wheels]);
  mergeStatic(turret, [gun, radar]);
  mergeStatic(gun, [recoil, rocketTip]);
  mergeStatic(recoil);
  mergeStatic(radar);
  return {
    root, body, turret, gun, recoil, muzzles, rocketTip, wheels: gear.wheels, trackMat: gear.trackMat, paintMats: [M.paint],
    spinners: [{ obj: radar, speed: 1.6 }], hpHeight: 4.4, hitScale: 1.3, recoilDist: 0.12,
  };
}
