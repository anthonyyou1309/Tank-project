// AH-64D Apache Longbow, modelled at real-world scale (metres). +z = forward, +x = left, y = up.
// Origin sits near the centre of mass; the wheels touch the ground at y = -2.0.
import * as THREE from 'three';
import { loft, octSection, profileX, planY, box, cyl, mergeStatic } from './geo.js';
import * as MAT from './materials.js';

const V3 = THREE.Vector3;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const podFace = () => canvasTex(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#3a3c3a'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#060606';
  for (const [rad, n] of [[0, 1], [0.27, 6], [0.52, 12]]) for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (n === 12 ? 0.26 : 0);
    ctx.beginPath(); ctx.arc(w / 2 + Math.cos(a) * rad * w * 0.8, h / 2 + Math.sin(a) * rad * h * 0.8, w * 0.085, 0, Math.PI * 2); ctx.fill();
  }
});

const ring = (cx, cy, z, r, n = 10) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2;
  return new V3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z);
});
const canSec = (z, ws, ys, wu, yu, wt, yt) => [new V3(ws, ys, z), new V3(wu, yu, z), new V3(wt, yt, z), new V3(-wt, yt, z), new V3(-wu, yu, z), new V3(-ws, ys, z)];
const dogSec = (z, w, yb, yt, wt) => [new V3(w, yb, z), new V3(w, yt - 0.15, z), new V3(wt, yt, z), new V3(-wt, yt, z), new V3(-w, yt - 0.15, z), new V3(-w, yb, z)];

/**
 * Build the Apache. Returns refs for the animated parts.
 * opts: { paint (hex), tailNumber, emblem (css colour) }
 */
export function buildApache({ paint = 0x3a3f2e, tailNumber = '07012', emblem = '#000000' } = {}) {
  const root = new THREE.Group();
  const stat = new THREE.Group();
  root.add(stat);

  const M = {
    paint: MAT.aircraftPaint(paint, 7),
    dark: MAT.plain(0x1e2022, 0.7, 0.45),
    black: MAT.plain(0x0e0f10, 0.6, 0.3),
    metal: MAT.plain(0x7a7e82, 0.32, 0.9),
    steel: MAT.plain(0x55595e, 0.4, 0.85),
    rubber: MAT.plain(0x121212, 0.95, 0.0),
    glass: MAT.glass(0x24384a, 0.42),
    sensor: MAT.sensorGlass(),
    blade: MAT.plain(0x26282a, 0.55, 0.35),
    hellfire: MAT.plain(0x5a6047, 0.55, 0.3),
    pod: MAT.plain(0x4a5040, 0.6, 0.35),
    podFace: MAT.plain(0xffffff, 0.8, 0.2, { map: podFace() }),
    formation: MAT.lamp(0x63c27a),
    beacon: new THREE.MeshBasicMaterial({ color: 0xff3030, toneMapped: false }),
  };

  const add = (geo, mat, x = 0, y = 0, z = 0, parent = stat) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ------------------------------------------------------------------ fuselage
  add(loft([
    octSection(4.25, 0.22, 0.30, 0.20, -0.95, -0.85, -0.50, -0.38),
    octSection(3.85, 0.36, 0.46, 0.34, -1.12, -0.98, -0.40, -0.26),
    octSection(3.20, 0.42, 0.54, 0.44, -1.22, -1.05, -0.32, -0.20),
    octSection(2.40, 0.44, 0.57, 0.48, -1.26, -1.08, -0.28, -0.16),
    octSection(1.90, 0.45, 0.58, 0.50, -1.26, -1.08, -0.05, 0.04),
    octSection(0.80, 0.46, 0.60, 0.54, -1.25, -1.05, 0.30, 0.46),
    octSection(-0.60, 0.46, 0.60, 0.54, -1.22, -1.02, 0.42, 0.58),
    octSection(-1.80, 0.42, 0.55, 0.46, -1.08, -0.90, 0.36, 0.54),
    octSection(-2.70, 0.30, 0.40, 0.32, -0.62, -0.48, 0.30, 0.46),
    octSection(-4.50, 0.25, 0.30, 0.24, -0.30, -0.20, 0.28, 0.40),
    octSection(-7.50, 0.20, 0.24, 0.18, -0.08, -0.02, 0.28, 0.38),
    octSection(-9.30, 0.16, 0.18, 0.14, 0.02, 0.06, 0.30, 0.38),
    octSection(-9.95, 0.10, 0.12, 0.09, 0.08, 0.10, 0.28, 0.34),
  ]), M.paint);
  add(box(0.5, 0.02, 0.5), M.black, 0, -0.27, 3.95).rotation.x = 0.2;     // anti-glare panel ahead of the windscreen

  // Forward avionics bays (the Apache's slab-sided "cheeks")
  for (const s of [-1, 1]) {
    const sec = (z, xo, yt, yb) => [new V3(s * 0.44, yb, z), new V3(s * xo, yb + 0.06, z), new V3(s * xo, yt - 0.06, z), new V3(s * 0.44, yt, z)];
    add(loft([sec(2.85, 0.58, -0.42, -0.98), sec(2.30, 0.96, -0.22, -1.13), sec(-0.80, 0.96, -0.22, -1.13), sec(-1.45, 0.66, -0.32, -1.00)]), M.paint);
    add(box(0.02, 0.5, 0.9), M.dark, s * 0.97, -0.68, 1.2);               // bay door outline
    add(box(0.02, 0.22, 0.4), M.dark, s * 0.97, -0.62, -0.3);              // vent
    add(box(0.12, 0.04, 0.25), M.steel, s * 1.0, -0.95, 0.4);              // boarding step
    add(box(0.03, 0.04, 0.55), M.formation, s * 0.97, -0.28, -0.6);        // formation light
  }

  // ------------------------------------------------------------------ cockpit glazing
  const gunnerCan = loft([canSec(3.95, 0.34, -0.32, 0.26, -0.10, 0.10, -0.02), canSec(3.40, 0.45, -0.22, 0.40, 0.15, 0.17, 0.30), canSec(2.55, 0.49, -0.18, 0.45, 0.22, 0.20, 0.38)]);
  const pilotCan = loft([canSec(2.62, 0.49, -0.06, 0.44, 0.42, 0.18, 0.58), canSec(2.25, 0.50, 0.04, 0.46, 0.55, 0.21, 0.76), canSec(1.15, 0.54, 0.08, 0.49, 0.62, 0.24, 0.86), canSec(0.62, 0.53, 0.34, 0.42, 0.70, 0.20, 0.84)]);
  for (const g of [gunnerCan, pilotCan]) {
    const c = add(g, M.glass);
    c.castShadow = false;
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(g, 12), new THREE.LineBasicMaterial({ color: 0x15171a }));
    root.add(frame);
  }
  // Crew (visible through the glazing)
  for (const [y, z] of [[-0.42, 3.05], [-0.05, 1.55]]) {
    add(box(0.42, 0.5, 0.32), M.pod, 0, y + 0.1, z - 0.1);                // torso
    add(new THREE.SphereGeometry(0.15, 12, 10), M.pod, 0, y + 0.52, z - 0.05);   // helmet
    add(box(0.2, 0.08, 0.06), M.sensor, 0, y + 0.52, z + 0.11);           // visor / IHADSS
    add(box(0.82, 0.22, 0.2), M.dark, 0, y + 0.18, z + 0.45);             // instrument panel
  }
  // Wire-strike protection
  const cutter = (x, y, z, h, tilt) => { const m = add(box(0.04, h, 0.07), M.steel, x, y, z); m.rotation.x = tilt; };
  cutter(0, 0.42, 3.3, 0.38, -0.5);
  cutter(0, 0.95, 2.05, 0.36, -0.5);
  cutter(0, -1.28, 3.7, 0.35, 0.5);
  add(box(0.03, 0.04, 1.1), M.steel, 0, 0.35, 2.95);                       // deflector along the canopy

  // ------------------------------------------------------------------ TADS / PNVS nose sensors
  add(cyl(0.27, 0.27, 0.52, 16, 'y'), M.dark, 0, -0.68, 4.42);
  for (const s of [-1, 1]) {
    add(box(0.26, 0.42, 0.52), M.dark, s * 0.3, -0.68, 4.45);
    add(box(0.19, 0.17, 0.02), M.sensor, s * 0.3, -0.62, 4.72);
    add(box(0.12, 0.1, 0.02), M.sensor, s * 0.3, -0.8, 4.72);
  }
  add(cyl(0.16, 0.16, 0.26, 14, 'y'), M.dark, 0, -0.22, 4.32);
  add(box(0.14, 0.11, 0.02), M.sensor, 0, -0.22, 4.49);

  // ------------------------------------------------------------------ engines, rotor pylon, exhausts
  add(loft([dogSec(0.95, 0.40, 0.40, 0.80, 0.25), dogSec(0.40, 0.46, 0.40, 1.05, 0.30), dogSec(-1.00, 0.46, 0.45, 1.05, 0.30), dogSec(-1.90, 0.36, 0.45, 0.78, 0.22)]), M.paint);
  for (const s of [-1, 1]) {
    const x = s * 0.98;
    add(loft([ring(x, 0.62, 0.56, 0.35), ring(x, 0.62, 0.40, 0.42), ring(x, 0.62, -1.0, 0.44), ring(x, 0.62, -1.75, 0.38)]), M.paint);
    add(new THREE.CircleGeometry(0.3, 18), M.black, x, 0.62, 0.565);
    add(new THREE.ConeGeometry(0.11, 0.22, 12).rotateX(Math.PI / 2), M.metal, x, 0.62, 0.62);
    add(box(0.3, 0.3, 1.6), M.paint, s * 0.6, 0.55, -0.6);                // nacelle pylon fairing
    // "Black Hole" IR-suppressing exhaust, canted outboard
    const ex = add(box(0.46, 0.5, 0.95), M.dark, s * 1.16, 0.62, -2.22); ex.rotation.y = s * 0.38;
    const out = add(new THREE.PlaneGeometry(0.38, 0.4), M.black, s * 1.36, 0.62, -2.62); out.rotation.y = Math.PI + s * 0.38;
    const louv = add(box(0.4, 0.02, 0.7), MAT.grilleMaterial(), s * 1.16, 0.88, -2.2); louv.rotation.y = s * 0.38;
  }
  add(cyl(0.17, 0.17, 0.3, 8, 'y'), M.sensor, 0, 1.2, -1.55);              // ALQ-144 IR jammer
  add(cyl(0.12, 0.17, 0.75, 12, 'y'), M.steel, 0, 1.4, 0);                 // mast

  // ------------------------------------------------------------------ tail boom, fin, stabilator
  add(box(0.22, 0.12, 6.0), M.paint, 0, 0.42, -6.0);                        // tail-rotor drive shaft cover
  for (const z of [-4.6, -6.6]) add(box(0.02, 0.2, 0.32), M.dark, 0, 0.56, z);   // blade antennas
  add(box(0.02, 0.18, 0.3), M.dark, 0, -1.32, -0.4);
  add(profileX([[-8.55, 0.35], [-9.85, 0.30], [-10.55, 2.95], [-9.95, 3.02], [-9.35, 1.30]], 0.2), M.paint);
  add(box(0.3, 0.38, 0.62), M.paint, 0, 2.48, -10.12);                      // tail-rotor gearbox fairing
  add(box(0.02, 1.3, 0.04), M.formation, 0.11, 1.6, -9.9);
  const stab = add(planY([[-1.7, -9.45], [1.7, -9.45], [1.62, -10.08], [-1.62, -10.08]], 0.08), M.paint, 0, 0.1, 0);
  void stab;
  // Tail wheel
  add(box(0.08, 1.7, 0.12), M.steel, 0, -0.9, -8.75);
  add(box(0.16, 0.12, 0.35), M.steel, 0, -1.75, -8.85);
  add(cyl(0.22, 0.22, 0.12, 16, 'x'), M.rubber, 0, -1.78, -8.95);

  // ------------------------------------------------------------------ stub wings and weapons
  const missileTips = [];
  for (const s of [-1, 1]) {
    add(planY([[s * 0.9, 0.55], [s * 2.55, 0.32], [s * 2.55, -0.45], [s * 0.9, -0.75]], 0.16), M.paint, 0, -0.4, 0);
    add(box(0.26, 0.3, 1.1), M.paint, s * 2.68, -0.32, -0.08);             // wingtip pod (CMWS)
    add(new THREE.SphereGeometry(0.11, 10, 8), M.sensor, s * 2.68, -0.3, 0.5);
    add(new THREE.SphereGeometry(0.06, 8, 6), s > 0 ? MAT.lamp(0xff2020) : MAT.lamp(0x20ff40), s * 2.82, -0.3, 0.2);   // nav light (red = left)
    for (const x of [1.45, 2.15]) add(box(0.12, 0.3, 0.85), M.dark, s * x, -0.55, -0.1);   // pylons
    // M261 19-tube rocket pod (inboard)
    const px = s * 1.45;
    add(cyl(0.205, 0.205, 1.62, 20, 'z'), M.pod, px, -0.92, -0.05);
    for (const z of [0.74, -0.84]) add(cyl(0.212, 0.212, 0.06, 20, 'z'), M.steel, px, -0.92, z);
    add(new THREE.CircleGeometry(0.2, 20), M.podFace, px, -0.92, 0.775);
    // M299 launcher with four Hellfires (outboard)
    const hx = s * 2.15;
    add(box(0.52, 0.1, 1.5), M.dark, hx, -0.76, -0.05);
    for (const o of [-0.25, 0.25]) add(box(0.04, 0.5, 1.5), M.dark, hx + o, -1.02, -0.05);
    for (const ox of [-0.13, 0.13]) for (const oy of [-0.92, -1.17]) {
      add(cyl(0.089, 0.089, 1.45, 12, 'z'), M.hellfire, hx + ox, oy, -0.05);
      add(new THREE.SphereGeometry(0.089, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), M.sensor, hx + ox, oy, 0.675);
      for (let k = 0; k < 4; k++) {
        const fin = add(box(0.005, 0.12, 0.18), M.hellfire, hx + ox, oy, 0.2);
        fin.rotation.z = (k * Math.PI) / 2 + Math.PI / 4;
        const fin2 = add(box(0.005, 0.1, 0.12), M.hellfire, hx + ox, oy, -0.72);
        fin2.rotation.z = (k * Math.PI) / 2 + Math.PI / 4;
      }
    }
    const tip = new THREE.Object3D();
    tip.position.set(hx, -1.05, 0.9);
    root.add(tip);
    missileTips.push(tip);
    // Main landing gear (trailing arm + shock strut)
    const axle = new V3(s * 1.08, -1.62, 1.75);
    const arm = add(box(0.1, 0.1, 0.7), M.steel, s * 0.98, -1.35, 2.02); arm.rotation.x = 0.85;
    const strut = add(cyl(0.05, 0.05, 0.8, 8, 'y'), M.metal, s * 0.98, -1.25, 1.72); strut.rotation.x = -0.35;
    add(cyl(0.38, 0.38, 0.2, 20, 'x'), M.rubber, axle.x, axle.y, axle.z);
    add(cyl(0.2, 0.2, 0.22, 12, 'x'), M.metal, axle.x, axle.y, axle.z);
    cutter(s * 0.98, -1.55, 2.3, 0.3, 0.3);
  }
  // Ammunition feed chute
  const chute = add(box(0.16, 0.12, 1.0), M.dark, 0.18, -1.22, 2.25); chute.rotation.y = -0.15;
  // Lights
  add(new THREE.SphereGeometry(0.07, 8, 6), M.beacon, 0, 3.06, -10.0);
  add(new THREE.SphereGeometry(0.07, 8, 6), M.beacon, 0, -1.3, -1.2);
  add(cyl(0.09, 0.09, 0.05, 10, 'y'), MAT.lamp(0xfff4d0), 0, -1.27, 3.3);      // landing light

  // Tail number decal
  if (tailNumber) {
    const numMat = new THREE.MeshBasicMaterial({
      map: canvasTex(256, 64, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(12,12,12,0.85)'; ctx.font = 'bold 44px Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tailNumber, w / 2, h / 2);
      }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    for (const s of [-1, 1]) {
      const d = add(new THREE.PlaneGeometry(0.9, 0.22), numMat, s * 0.105, 1.15, -9.75);
      d.rotation.y = s * Math.PI / 2;
      d.rotation.z = s * -0.25;
      d.castShadow = false;
    }
  }
  if (emblem) {
    const emMat = new THREE.MeshBasicMaterial({
      map: canvasTex(128, 128, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = emblem; ctx.lineWidth = 9;
        ctx.beginPath(); ctx.arc(w / 2, h / 2, 50, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = emblem;
        ctx.beginPath(); ctx.moveTo(w / 2, 22); ctx.lineTo(w / 2 + 14, h / 2); ctx.lineTo(w / 2, h - 22); ctx.lineTo(w / 2 - 14, h / 2); ctx.closePath(); ctx.fill();
      }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    for (const s of [-1, 1]) {
      const d = add(new THREE.PlaneGeometry(0.45, 0.45), emMat, s * 0.31, 0.25, -3.6);
      d.rotation.y = s * Math.PI / 2;
      d.castShadow = false;
    }
  }

  // ------------------------------------------------------------------ main rotor (animated)
  const rotor = new THREE.Group();
  rotor.position.set(0, 1.75, 0);
  root.add(rotor);
  add(cyl(0.33, 0.33, 0.3, 16, 'y'), M.steel, 0, 0, 0, rotor);
  add(cyl(0.42, 0.42, 0.05, 20, 'y'), M.metal, 0, -0.3, 0, rotor);          // swashplate (rotating)
  add(cyl(0.46, 0.46, 0.05, 20, 'y'), M.dark, 0, -0.37, 0, rotor);          // swashplate (fixed)
  add(cyl(0.14, 0.14, 0.55, 10, 'y'), M.steel, 0, 0.42, 0, rotor);          // mast extension
  // Longbow fire-control radar dome
  const fcr = new THREE.LatheGeometry([[0, -0.18], [0.5, -0.18], [0.57, -0.08], [0.57, 0.06], [0.48, 0.16], [0.25, 0.21], [0, 0.22]].map(([x, y]) => new THREE.Vector2(x, y)), 28);
  add(fcr, M.paint, 0, 0.88, 0, rotor);
  const blades = [];
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i * Math.PI) / 2 + Math.PI / 4;
    rotor.add(arm);
    add(box(0.26, 0.13, 0.7).translate(0, 0, 0.55), M.steel, 0, 0, 0, arm);              // strap pack / hub arm
    add(cyl(0.09, 0.09, 0.55, 10, 'z'), M.metal, 0, 0, 0.75, arm);                         // pitch housing
    add(cyl(0.025, 0.025, 0.32, 6, 'y'), M.metal, 0.17, -0.16, 0.38, arm);                 // pitch link
    const blade = new THREE.Group();
    blade.position.z = 0.95;
    arm.add(blade);
    add(box(0.53, 0.055, 6.05).translate(-0.05, 0, 3.05), M.blade, 0, 0, 0, blade);
    const tip = add(box(0.4, 0.05, 0.42).translate(0.02, 0, 6.27), M.blade, 0, 0, 0, blade);   // swept tip
    tip.rotation.y = -0.18;
    add(box(0.06, 0.06, 5.6).translate(-0.31, 0.003, 3.1), M.metal, 0, 0, 0, blade);     // leading-edge erosion strip
    blades.push(blade);
  }
  const rotorDisc = new THREE.Mesh(new THREE.CircleGeometry(7.25, 56).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  rotorDisc.position.y = 0.06;
  rotor.add(rotorDisc);

  // ------------------------------------------------------------------ tail rotor (animated, scissor X)
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.36, 2.48, -10.12);
  root.add(tailRotor);
  add(cyl(0.12, 0.12, 0.3, 12, 'x'), M.steel, 0, 0, 0, tailRotor);
  for (const a of [0, 0.96, Math.PI, Math.PI + 0.96]) {
    const b = add(box(0.035, 1.28, 0.25).translate(0, 0.72, 0), M.blade, 0.1, 0, 0, tailRotor);
    b.rotation.x = a;
  }
  const tailDisc = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32).rotateY(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  tailDisc.position.x = 0.11;
  tailRotor.add(tailDisc);

  // ------------------------------------------------------------------ M230 chain gun (animated)
  const gun = new THREE.Group();
  gun.position.set(0, -1.34, 2.85);
  root.add(gun);
  add(cyl(0.26, 0.28, 0.16, 16, 'y'), M.dark, 0, 0.04, 0, gun);
  const gunPitch = new THREE.Group();
  gunPitch.position.y = -0.1;
  gun.add(gunPitch);
  add(box(0.22, 0.2, 0.62).translate(0, 0, 0.12), M.dark, 0, 0, 0, gunPitch);
  add(cyl(0.045, 0.05, 1.7, 10, 'z').translate(0, 0, 1.25), M.steel, 0, 0, 0, gunPitch);
  add(cyl(0.065, 0.065, 0.15, 10, 'z').translate(0, 0, 2.12), M.dark, 0, 0, 0, gunPitch);
  const gunTip = new THREE.Object3D();
  gunTip.position.set(0, 0, 2.25);
  gunPitch.add(gunTip);

  const cockpitEye = new THREE.Object3D();
  cockpitEye.position.set(0, 0.5, 1.75);
  root.add(cockpitEye);

  mergeStatic(stat);
  // Collapse each animated assembly into a few meshes too (parts move together, so they can share geometry)
  rotorDisc.userData.keep = true;
  mergeStatic(rotor, blades);
  for (const b of blades) mergeStatic(b);
  mergeStatic(tailRotor);
  mergeStatic(gun, [gunPitch]);
  mergeStatic(gunPitch);
  return { root, rotor, blades, rotorDisc, tailRotor, gun, gunPitch, gunTip, missileTips, cockpitEye, beaconMat: M.beacon, paintMat: M.paint };
}
