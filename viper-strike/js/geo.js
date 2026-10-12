// Geometry helpers for the vehicle models: lofted hulls, metric-UV primitives, track belts and static merging.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3;

/**
 * Loft a skin through a list of cross-sections. Each section is an array of Vector3 (same count, same winding).
 * Produces faceted (flat-shaded) triangles with UVs in metres: u = distance around the section, v = distance along.
 */
export function loft(sections, { capStart = true, capEnd = true } = {}) {
  const S = sections.length, N = sections[0].length;
  const pos = [], uv = [];
  const cen = sections.map((s) => s.reduce((a, p) => a.add(p), new V3()).multiplyScalar(1 / s.length));
  const vs = [0];
  for (let i = 1; i < S; i++) vs.push(vs[i - 1] + cen[i].distanceTo(cen[i - 1]));
  const us = sections.map((s) => {
    const u = [0];
    for (let j = 1; j <= N; j++) u.push(u[j - 1] + s[j % N].distanceTo(s[j - 1]));
    return u;
  });
  const push = (p, u, v) => { pos.push(p.x, p.y, p.z); uv.push(u, v); };
  for (let i = 0; i < S - 1; i++) {
    for (let j = 0; j < N; j++) {
      const a = sections[i][j], b = sections[i][(j + 1) % N], c = sections[i + 1][(j + 1) % N], d = sections[i + 1][j];
      const ua = us[i][j], ub = us[i][j + 1], uc = us[i + 1][j + 1], ud = us[i + 1][j];
      push(a, ua, vs[i]); push(b, ub, vs[i]); push(c, uc, vs[i + 1]);
      push(a, ua, vs[i]); push(c, uc, vs[i + 1]); push(d, ud, vs[i + 1]);
    }
  }
  const cap = (s, c, flip) => {
    for (let j = 0; j < N; j++) {
      const a = s[j], b = s[(j + 1) % N];
      if (flip) { push(c, c.x, c.y); push(b, b.x, b.y); push(a, a.x, a.y); }
      else { push(c, c.x, c.y); push(a, a.x, a.y); push(b, b.x, b.y); }
    }
  };
  if (capStart) cap(sections[0], cen[0], true);
  if (capEnd) cap(sections[S - 1], cen[S - 1], false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Chamfered 8-point fuselage/hull section at station z: half-widths (bottom, mid, top) and heights. */
export function octSection(z, wb, wm, wt, yb, yl, yh, yt) {
  return [
    new V3(wb, yb, z), new V3(wm, yl, z), new V3(wm, yh, z), new V3(wt, yt, z),
    new V3(-wt, yt, z), new V3(-wm, yh, z), new V3(-wm, yl, z), new V3(-wb, yb, z),
  ];
}

/** Vertical loft between two horizontal outlines ([[x,z],...]) at heights y0 / y1 (turrets, doghouses). */
export function verticalLoft(outlineBottom, y0, outlineTop, y1) {
  return loft([
    outlineBottom.map(([x, z]) => new V3(x, y0, z)),
    outlineTop.map(([x, z]) => new V3(x, y1, z)),
  ]);
}

/** Extrude a side profile ([[z,y],...]) symmetrically across the X axis by `width`. Metric UVs. */
export function profileX(points, width) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  g.translate(0, 0, -width / 2);
  g.rotateY(-Math.PI / 2);          // shape-x → +z (forward), extrusion → x
  return g;
}

/** Extrude a plan-view outline ([[x,z],...]) vertically by `height` (bottom at y=0). Metric UVs. */
export function planY(points, height) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  g.rotateX(Math.PI / 2);            // shape-y → +z, extrusion → -y
  g.translate(0, height, 0);
  return g;
}

/** Box with UVs scaled to metres so textures keep a constant physical size. */
export function box(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
  }
  return g;
}

/** Cylinder with metric UVs, oriented along 'x', 'y' or 'z'. */
export function cyl(rt, rb, len, seg = 16, axis = 'y', open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, len, seg, 1, open);
  const uv = g.attributes.uv;
  const circ = Math.PI * (rt + rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * len);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  return g;
}

/**
 * Continuous track belt for one side, wrapped around idler (front), road wheels (bottom) and sprocket (rear).
 * All positions are [z, y]; returns geometry centred on x = 0 with width `w`. UV v is in metres along the belt.
 */
export function trackBelt({ idler, sprocket, wheels, wheelR, w, t = 0.07, topY, sag = 0.03 }) {
  const pts = [];
  const arc = (cz, cy, r, a0, a1, step = 0.18) => {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  };
  const R = (r) => r + t / 2;
  const front = Math.max(...wheels), rear = Math.min(...wheels);
  // Front: up and over the idler
  arc(idler[0], idler[1], R(idler[2]), -1.2, Math.PI / 2);
  // Top run (sagging slightly between support rollers)
  const zA = idler[0], zB = sprocket[0], yA = idler[1] + R(idler[2]), yB = sprocket[1] + R(sprocket[2]);
  for (let i = 1; i < 12; i++) {
    const u = i / 12;
    const y = Math.max(yA + (yB - yA) * u - Math.sin(u * Math.PI * 3) ** 2 * sag, (topY ?? -1));
    pts.push([zA + (zB - zA) * u, y]);
  }
  // Rear: around the drive sprocket
  arc(sprocket[0], sprocket[1], R(sprocket[2]), Math.PI / 2, Math.PI * 1.32);
  // Down to the last road wheel, along the ground, up to the idler
  const yG = t / 2;
  pts.push([rear - wheelR * 0.4, yG + 0.02]);
  pts.push([rear, yG]);
  pts.push([front, yG]);
  pts.push([front + wheelR * 0.45, yG + 0.03]);

  // Outward normals from polygon orientation
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const [z1, y1] = pts[i], [z2, y2] = pts[(i + 1) % pts.length]; area += z1 * y2 - z2 * y1; }
  const sgn = area > 0 ? 1 : -1;
  const n = pts.length;
  const normals = pts.map((_, i) => {
    const [zp, yp] = pts[(i - 1 + n) % n], [zn, yn] = pts[(i + 1) % n];
    const tz = zn - zp, ty = yn - yp, l = Math.hypot(tz, ty) || 1;
    return [(ty / l) * sgn, (-tz / l) * sgn];
  });
  const dist = [0];
  for (let i = 1; i <= n; i++) dist.push(dist[i - 1] + Math.hypot(pts[i % n][0] - pts[i - 1][0], pts[i % n][1] - pts[i - 1][1]));

  const pos = [], uv = [];
  const P = (i, side, layer) => {             // layer +1 outer, -1 inner
    const [z, y] = pts[i % n], [nz, ny] = normals[i % n];
    return [side * w / 2, y + ny * layer * t / 2, z + nz * layer * t / 2];
  };
  const quad = (a, b, c, d, ua, ub, va, vb) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    uv.push(ua, va, ub, va, ub, vb, ua, va, ub, vb, ua, vb);
  };
  for (let i = 0; i < n; i++) {
    const v0 = dist[i], v1 = dist[i + 1];
    quad(P(i, -1, 1), P(i, 1, 1), P(i + 1, 1, 1), P(i + 1, -1, 1), 0, 1, v0, v1);       // tread face
    quad(P(i, 1, -1), P(i, -1, -1), P(i + 1, -1, -1), P(i + 1, 1, -1), 0, 1, v0, v1);   // inner face
    quad(P(i, 1, 1), P(i, 1, -1), P(i + 1, 1, -1), P(i + 1, 1, 1), 0, 0.05, v0, v1);   // edges
    quad(P(i, -1, -1), P(i, -1, 1), P(i + 1, -1, 1), P(i + 1, -1, -1), 0, 0.05, v0, v1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Normalise a geometry so it can be merged with others (non-indexed, position/normal/uv only). */
export function normalizeGeo(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups();
  return g;
}

/**
 * Merge every static mesh under `root` (skipping the subtrees in `keep`) into one mesh per material.
 * Greatly reduces draw calls for detailed vehicles.
 */
export function mergeStatic(root, keep = []) {
  const keepSet = new Set(keep);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const victims = [];
  const visit = (o) => {
    if (keepSet.has(o)) return;
    if (o.isMesh && !o.userData.keep && !Array.isArray(o.material)) {
      const g = normalizeGeo(o.geometry);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      if (!buckets.has(o.material)) buckets.set(o.material, []);
      buckets.get(o.material).push(g);
      victims.push(o);
    }
    for (const ch of o.children) visit(ch);
  };
  for (const ch of root.children) visit(ch);
  for (const v of victims) { v.parent.remove(v); v.geometry.dispose(); }
  for (const [mat, list] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(list), mat);
    list.forEach((g) => g.dispose());
    mesh.castShadow = !mat.transparent;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}
