// The player car: a low, angular, stark-white "aerospace" roadster modelled
// on the 2026 reveal: wedge nose with hidden headlight slit, dark bubble
// canopy, full-width rear light bar, flush aero, and ten cold-gas thruster
// nozzles (4 rear, 2 front side-facing, 4 downward corners) plus the
// underbody suction-fan array.
import * as THREE from 'three';

const UP_NEG = new THREE.Vector3(0, -1, 0);

function extrudeProfile(points, depth, bevel = 0.04) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
  });
  // Shape u (+ toward nose) -> world -Z; extrusion -> world X, centred.
  g.rotateY(Math.PI / 2);
  g.translate(-depth / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

// Fades from bright at the nozzle to nothing at the plume's end.
const plumeTex = (() => {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.35, '#6f8a99');
  gr.addColorStop(1, '#000000');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
})();

function makePlume(dir, radius, color) {
  const geo = new THREE.ConeGeometry(radius, 1, 14, 1, true);
  geo.translate(0, -0.5, 0); // tip at nozzle, widening outward along -Y
  const mat = new THREE.MeshBasicMaterial({
    color, map: plumeTex, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.quaternion.setFromUnitVectors(UP_NEG, dir.clone().normalize());
  m.scale.set(1, 0.001, 1);
  m.visible = false;
  return m;
}

export function createRoadster() {
  const root = new THREE.Group();   // lane position; origin = centre of the car's 1.1 m tall box
  const pitch = new THREE.Group();  // nose up/down
  const roll = new THREE.Group();   // longitudinal roll (kickflips, ceiling inversion)
  root.add(pitch); pitch.add(roll);
  const body = new THREE.Group();
  body.position.y = -0.55;
  roll.add(body);

  const paint = new THREE.MeshPhysicalMaterial({
    color: 0xf3f4f6, metalness: 0.15, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0b0e14, metalness: 0.3, roughness: 0.05, clearcoat: 1,
  });
  const black = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.6, metalness: 0.3 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: 0.35, metalness: 0.5 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff1020, emissiveIntensity: 2.4 });
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f4ff, emissiveIntensity: 2.2 });
  const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.9, roughness: 0.3 });

  // Side profile (u toward nose, y up). Wedge nose, low hood, flat rear deck.
  const bodyGeo = extrudeProfile([
    [2.2, 0.22], [2.28, 0.36], [2.2, 0.47], [1.1, 0.66], [0.55, 0.78],
    [-0.9, 0.86], [-1.7, 0.86], [-2.18, 0.82], [-2.2, 0.32], [-1.9, 0.2], [1.8, 0.18],
  ], 1.86, 0.05);
  const shell = new THREE.Mesh(bodyGeo, paint);
  shell.castShadow = true;
  body.add(shell);

  // Bubble canopy (fighter-jet style).
  const canopyGeo = extrudeProfile([
    [0.62, 0.8], [0.15, 1.04], [-0.35, 1.12], [-0.95, 1.06], [-1.45, 0.9], [-1.45, 0.84], [0.62, 0.78],
  ], 1.1, 0.08);
  const canopy = new THREE.Mesh(canopyGeo, glass);
  body.add(canopy);

  // Carbon side intakes / lower aero blade.
  for (const sx of [-1, 1]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 2.4), carbon);
    blade.position.set(sx * 0.98, 0.34, 0.1);
    body.add(blade);
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.6), black);
    intake.position.set(sx * 0.98, 0.58, 0.55);
    body.add(intake);
  }
  // Rear diffuser.
  const diff = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 0.2), carbon);
  diff.position.set(0, 0.33, 2.16);
  body.add(diff);

  // Full-width rear light bar.
  const lightBar = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.09, 0.05), tail);
  lightBar.position.set(0, 0.74, 2.23);
  body.add(lightBar);
  // Hidden headlights: a single thin slit in the nose.
  const slit = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.025, 0.04), head);
  slit.position.set(0, 0.44, -2.26);
  body.add(slit);

  // Wheels (aero discs).
  const wheels = [];
  const tyreGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 24);
  tyreGeo.rotateZ(Math.PI / 2);
  const discGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.31, 20);
  discGeo.rotateZ(Math.PI / 2);
  const discMat = new THREE.MeshStandardMaterial({ color: 0x30343b, metalness: 0.8, roughness: 0.25 });
  for (const [x, z] of [[-0.86, -1.42], [0.86, -1.42], [-0.86, 1.4], [0.86, 1.4]]) {
    const w = new THREE.Group();
    w.add(new THREE.Mesh(tyreGeo, black));
    const disc = new THREE.Mesh(discGeo, discMat);
    w.add(disc);
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.4), nozzleMat);
    w.add(spoke);
    w.position.set(x, 0.36, z);
    body.add(w);
    wheels.push(w);
  }

  // Underbody suction-fan array (glows when active).
  const fanMat = new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const fanGlow = new THREE.Group();
  for (const z of [-0.7, 0.7]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.32, 24), fanMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.16, z);
    fanGlow.add(ring);
  }
  const fanSheet = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.4), fanMat);
  fanSheet.rotation.x = Math.PI / 2;
  fanSheet.position.y = 0.15;
  fanGlow.add(fanSheet);
  body.add(fanGlow);

  // Thruster nozzles + plumes. Cold gas is pale/white vapour, not fire.
  const thrusters = { rear: [], left: [], right: [], down: [] };
  const nozGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.1, 10);
  function addThruster(group, pos, dir, radius = 0.13) {
    const noz = new THREE.Mesh(nozGeo, nozzleMat);
    noz.position.copy(pos);
    noz.quaternion.setFromUnitVectors(UP_NEG, dir.clone().normalize());
    body.add(noz);
    const p = makePlume(dir, radius, 0xbfe4ff);
    p.position.copy(pos);
    body.add(p);
    thrusters[group].push({ plume: p, pos: pos.clone(), dir: dir.clone().normalize(), level: 0 });
  }
  for (const x of [-0.62, -0.22, 0.22, 0.62]) addThruster('rear', new THREE.Vector3(x, 0.5, 2.27), new THREE.Vector3(0, 0, 1), 0.11);
  addThruster('left', new THREE.Vector3(-1.0, 0.45, -1.7), new THREE.Vector3(-1, 0, 0));
  addThruster('right', new THREE.Vector3(1.0, 0.45, -1.7), new THREE.Vector3(1, 0, 0));
  for (const [x, z] of [[-0.75, -1.85], [0.75, -1.85], [-0.75, 1.85], [0.75, 1.85]]) {
    addThruster('down', new THREE.Vector3(x, 0.17, z), new THREE.Vector3(0, -1, 0), 0.15);
  }

  const targets = { rear: 0, left: 0, right: 0, down: 0 };
  let fanTarget = 0;
  let t = 0;

  return {
    root, pitch, roll, body, wheels, thrusters,
    // Request thrust on a nozzle group (0..1); decays each frame unless re-requested.
    fire(group, level) { targets[group] = Math.max(targets[group], level); },
    fans(on) { fanTarget = on ? 1 : 0; },
    update(dt, speed) {
      t += dt;
      for (const w of wheels) w.rotation.x -= speed * dt / 0.36;
      for (const g of Object.keys(thrusters)) {
        for (const th of thrusters[g]) {
          th.level += (targets[g] - th.level) * Math.min(1, dt * 22);
          const L = th.level * (0.85 + Math.random() * 0.3);
          th.plume.visible = L > 0.02;
          const len = g === 'rear' ? 2.2 : g === 'down' ? 1.4 : 1.0;
          th.plume.scale.set(0.6 + L * 0.6, Math.max(0.001, L * len), 0.6 + L * 0.6);
          th.plume.material.opacity = Math.min(0.55, L * 0.6);
        }
        targets[g] *= Math.pow(0.0001, dt); // fast decay
      }
      fanMat.opacity += (fanTarget * (0.55 + Math.sin(t * 40) * 0.1) - fanMat.opacity) * Math.min(1, dt * 10);
    },
    reset() {
      for (const g of Object.keys(targets)) targets[g] = 0;
      for (const g of Object.keys(thrusters)) for (const th of thrusters[g]) { th.level = 0; th.plume.visible = false; }
      fanTarget = 0; fanMat.opacity = 0;
      root.rotation.set(0, 0, 0); pitch.rotation.set(0, 0, 0); roll.rotation.set(0, 0, 0);
    },
  };
}
