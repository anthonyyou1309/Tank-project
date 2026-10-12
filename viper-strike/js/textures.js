// Procedural canvas textures: camo patterns, roads, ground, building windows, sky, banners.
import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getStyle();

function addNoise(ctx, w, h, amt, r) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// Irregular blob drawn with wrap-around copies so the texture tiles seamlessly.
function blob(ctx, x, y, rad, r, S) {
  const pts = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = rad * (0.55 + r() * 0.7);
    pts.push([Math.cos(a) * rr * 1.4, Math.sin(a) * rr * 0.8]);
  }
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x + p[0] + dx, y + p[1] + dy));
    ctx.closePath();
    ctx.fill();
  }
}

/** Tank paint: base colour from tank type + camo pattern style from map theme. */
export function makeCamoTexture(baseHex, theme, seed = 1) {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  const r = rng(seed * 977 + 13);
  ctx.fillStyle = new THREE.Color(baseHex).getStyle();
  ctx.fillRect(0, 0, S, S);

  if (theme === 'desert') {
    // Soft organic blotches with sand / earth tints.
    const cols = [mix(baseHex, 0xdcc18a, 0.5), mix(baseHex, 0x5a4128, 0.55), mix(baseHex, 0x000000, 0.3)];
    cols.forEach((col) => {
      ctx.fillStyle = col;
      for (let i = 0; i < 12; i++) blob(ctx, r() * S, r() * S, 14 + r() * 26, r, S);
    });
  } else {
    // Urban digital (pixel) camo with greys.
    const cols = [mix(baseHex, 0x9aa0a6, 0.5), mix(baseHex, 0x22252a, 0.55), mix(baseHex, 0xd6dade, 0.4)];
    const px = 8, G = S / px;
    cols.forEach((col) => {
      ctx.fillStyle = col;
      for (let i = 0; i < 20; i++) {
        let x = Math.floor(r() * G), y = Math.floor(r() * G);
        const n = 6 + Math.floor(r() * 12);
        for (let j = 0; j < n; j++) {
          ctx.fillRect((((x % G) + G) % G) * px, (((y % G) + G) % G) * px, px, px);
          if (r() < 0.5) x += r() < 0.5 ? -1 : 1; else y += r() < 0.5 ? -1 : 1;
        }
      }
    });
  }
  addNoise(ctx, S, S, 16, r);
  // Panel seams
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(0, i * 64 + 1); ctx.lineTo(S, i * 64 + 1); ctx.stroke();
  }
  // Rivets
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  for (let x = 8; x < S; x += 32) for (let i = 0; i < 4; i++) ctx.fillRect(x, i * 64 + 6, 3, 3);
  return toTex(c);
}

export function makeTreadTexture() {
  const [c, ctx] = makeCanvas(32, 32);
  ctx.fillStyle = '#26272a'; ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#121214'; ctx.fillRect(0, 0, 32, 10);
  ctx.fillStyle = '#3c3d41'; ctx.fillRect(0, 12, 32, 3);
  ctx.fillStyle = '#4a4b4f'; ctx.fillRect(4, 18, 4, 4); ctx.fillRect(24, 18, 4, 4);
  return toTex(c);
}

/** Road surface. One tile spans the full road width (u) and 64 world units of length (v). */
export function makeRoadTexture(theme) {
  const W = 512, H = 1024;
  const [c, ctx] = makeCanvas(W, H);
  const desert = theme === 'desert';
  const r = rng(desert ? 7 : 3);

  ctx.fillStyle = desert ? '#8d877b' : '#3a3c41';
  ctx.fillRect(0, 0, W, H);
  addNoise(ctx, W, H, desert ? 34 : 26, r);

  // Tyre-worn lanes
  for (const l of [1 / 6, 3 / 6, 5 / 6]) {
    for (const o of [-0.06, 0.06]) {
      const x = (l + o) * W;
      const g = ctx.createLinearGradient(x - 16, 0, x + 16, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, desert ? 'rgba(45,38,30,0.16)' : 'rgba(0,0,0,0.28)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 16, 0, 32, H);
    }
  }

  const white = desert ? [236, 226, 200] : [242, 242, 242];
  const yellow = desert ? [222, 192, 120] : [255, 198, 40];
  const rgba = (c3, a) => `rgba(${c3[0]},${c3[1]},${c3[2]},${a})`;

  if (desert) {
    // Faded, broken edge lines
    for (let y = 0; y < H; y += 8) {
      if (r() < 0.65) { ctx.fillStyle = rgba(white, 0.18 + r() * 0.25); ctx.fillRect(W * 0.035, y, 10, 8); }
      if (r() < 0.65) { ctx.fillStyle = rgba(yellow, 0.18 + r() * 0.25); ctx.fillRect(W * 0.965 - 10, y, 10, 8); }
    }
  } else {
    ctx.fillStyle = rgba(white, 0.9); ctx.fillRect(W * 0.035, 0, 10, H);
    ctx.fillStyle = rgba(yellow, 0.92); ctx.fillRect(W * 0.965 - 10, 0, 10, H);
  }
  // Dashed lane dividers
  for (const l of [1 / 3, 2 / 3]) {
    for (const y0 of [0, H / 2]) {
      for (let y = y0; y < y0 + H * 0.2; y += 6) {
        if (desert && r() < 0.4) continue;
        ctx.fillStyle = rgba(white, desert ? 0.15 + r() * 0.2 : 0.88);
        ctx.fillRect(l * W - 5, y, 10, 6);
      }
    }
  }

  if (desert) {
    // Cracks
    ctx.strokeStyle = 'rgba(42,35,28,0.55)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 45; i++) {
      let x = r() * W, y = r() * H;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 12; j++) { x += (r() - 0.5) * 34; y += (r() - 0.5) * 34; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // Old repair patches
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(55,50,46,${0.2 + r() * 0.2})`;
      ctx.fillRect(r() * W, r() * H, 30 + r() * 90, 20 + r() * 70);
    }
    // Wind-blown sand drifts, heavier at the edges
    for (let i = 0; i < 70; i++) {
      const edge = r() < 0.65;
      const x = edge ? (r() < 0.5 ? r() * W * 0.2 : W - r() * W * 0.2) : r() * W;
      const y = r() * H;
      const rad = 20 + r() * 80;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(218,190,138,0.8)');
      g.addColorStop(1, 'rgba(218,190,138,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, y, rad, rad * 1.6, 0, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    // Expansion joint + oil stains
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, 5);
    ctx.fillStyle = 'rgba(120,120,125,0.4)'; ctx.fillRect(0, 5, W, 2);
    for (let i = 0; i < 14; i++) {
      const x = W * (0.12 + r() * 0.76), y = r() * H, rad = 10 + r() * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  return toTex(c);
}

export function makeSandTexture() {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const r = rng(42);
  ctx.fillStyle = '#d5b483'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const x = r() * S, y = r() * S, rad = 30 + r() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() < 0.5;
    g.addColorStop(0, dark ? 'rgba(170,130,85,0.25)' : 'rgba(240,215,170,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) ctx.fillRect(x - rad + dx, y - rad + dy, rad * 2, rad * 2);
  }
  // Wind ripples (tile-safe: integer number of waves)
  for (let k = 0; k < 18; k++) {
    ctx.strokeStyle = k % 2 ? 'rgba(160,120,75,0.12)' : 'rgba(250,230,190,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const y0 = (k / 18) * S;
    for (let x = 0; x <= S; x += 8) {
      const y = y0 + Math.sin((x / S) * Math.PI * 6 + k) * 6;
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  addNoise(ctx, S, S, 22, r);
  return toTex(c);
}

export function makeCityGroundTexture() {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const r = rng(5);
  ctx.fillStyle = '#26262c'; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#34343c'; ctx.fillRect(56, 56, S - 112, S - 112);   // block
  ctx.fillStyle = '#2d2d34'; ctx.fillRect(70, 70, S - 140, S - 140);
  // Street centre dashes
  ctx.fillStyle = 'rgba(255,200,60,0.55)';
  for (let x = 0; x < S; x += 40) { ctx.fillRect(x, 0, 22, 4); ctx.fillRect(0, x, 4, 22); }
  // Car lights along streets
  for (let i = 0; i < 30; i++) {
    const along = r() * S, lane = r() < 0.5 ? 18 : S - 18;
    ctx.fillStyle = r() < 0.5 ? 'rgba(255,240,200,0.9)' : 'rgba(255,60,60,0.9)';
    if (r() < 0.5) ctx.fillRect(along, lane, 6, 3); else ctx.fillRect(lane, along, 3, 6);
  }
  addNoise(ctx, S, S, 18, r);
  return toTex(c);
}

/** Building facade: returns colour map and a matching emissive map (lit windows only). */
export function makeWindowTextures(seed, wall = '#3a3f4a') {
  const W = 128, H = 256;
  const [c, ctx] = makeCanvas(W, H);
  const [e, ectx] = makeCanvas(W, H);
  const r = rng(seed);
  ctx.fillStyle = wall; ctx.fillRect(0, 0, W, H);
  addNoise(ctx, W, H, 14, r);
  ectx.fillStyle = '#000'; ectx.fillRect(0, 0, W, H);
  const warm = ['#ffd59a', '#ffc979', '#ffe7bd'], cool = ['#cfe6ff', '#a9d1ff'];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      const x = col * 32 + 6, y = row * 32 + 9, w = 20, h = 17;
      const lit = r() < 0.42;
      if (lit) {
        const pal = r() < 0.75 ? warm : cool;
        const colr = pal[Math.floor(r() * pal.length)];
        ctx.fillStyle = colr; ctx.fillRect(x, y, w, h);
        ectx.globalAlpha = 0.5 + r() * 0.5;
        ectx.fillStyle = colr; ectx.fillRect(x, y, w, h);
        ectx.globalAlpha = 1;
      } else {
        ctx.fillStyle = r() < 0.5 ? '#141a24' : '#1c2533';
        ctx.fillRect(x, y, w, h);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y + h, w, 2);
    }
  }
  return { map: toTex(c), emissiveMap: toTex(e) };
}

/** Vertical gradient for an inside-out sky sphere. stops: [[0..1 top→bottom, css colour], ...] */
export function makeSkyTexture(stops) {
  const [c, ctx] = makeCanvas(4, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 512);
  return toTex(c, false);
}

export function makeBannerTexture(text, bg, fg, checker = false) {
  const [c, ctx] = makeCanvas(1024, 128);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 128);
  if (checker) {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 32; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4';
      ctx.fillRect(x * 32, y * 32, 32, 32);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(250, 14, 524, 100);
  }
  ctx.fillStyle = fg;
  ctx.font = '72px "Black Ops One", Impact, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 68);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 8; ctx.strokeRect(0, 0, 1024, 128);
  return toTex(c, false);
}

export function makeCheckerTexture() {
  const [c, ctx] = makeCanvas(64, 64);
  ctx.fillStyle = '#f2f2f2'; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 32, 32); ctx.fillRect(32, 32, 32, 32);
  return toTex(c);
}

export function makeSignTexture(lines, bg, fg) {
  const [c, ctx] = makeCanvas(512, 256);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = fg; ctx.lineWidth = 10; ctx.strokeRect(14, 14, 484, 228);
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '58px "Black Ops One", Impact, sans-serif';
  lines.forEach((l, i) => ctx.fillText(l, 256, 128 + (i - (lines.length - 1) / 2) * 70));
  // Weathering
  const r = rng(lines[0].length * 31);
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(120,90,60,${r() * 0.35})`;
    ctx.fillRect(r() * 512, r() * 256, 4 + r() * 22, 2 + r() * 10);
  }
  return toTex(c, false);
}

/* ---------------- Helicopter-game additions ---------------- */

/** Cracked, scorched asphalt for the ruined city floor. */
export function makeAsphaltTexture() {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const r = rng(91);
  ctx.fillStyle = '#2b2c30'; ctx.fillRect(0, 0, S, S);
  addNoise(ctx, S, S, 26, r);
  for (let i = 0; i < 18; i++) {           // scorch marks
    const x = r() * S, y = r() * S, rad = 20 + r() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(8,8,8,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.strokeStyle = 'rgba(10,10,12,0.7)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 60; i++) {           // cracks
    let x = r() * S, y = r() * S;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let j = 0; j < 10; j++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  for (let i = 0; i < 300; i++) {          // debris specks
    ctx.fillStyle = `rgba(${120 + r() * 60},${115 + r() * 50},${105 + r() * 40},${0.3 + r() * 0.4})`;
    ctx.fillRect(r() * S, r() * S, 2 + r() * 4, 2 + r() * 4);
  }
  return toTex(c);
}

/** Avenue surface running along v, with faded lane lines and potholes. One tile = 30 wide x 60 long. */
export function makeStreetTexture() {
  const W = 256, H = 512;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(17);
  ctx.fillStyle = '#34353a'; ctx.fillRect(0, 0, W, H);
  addNoise(ctx, W, H, 24, r);
  ctx.fillStyle = 'rgba(230,230,230,0.6)';
  ctx.fillRect(W * 0.04, 0, 5, H); ctx.fillRect(W * 0.96 - 5, 0, 5, H);
  for (let y = 0; y < H; y += 64) {
    if (r() < 0.25) continue;
    ctx.fillStyle = `rgba(255,200,50,${0.35 + r() * 0.4})`;
    ctx.fillRect(W / 2 - 6, y, 4, 36); ctx.fillRect(W / 2 + 2, y, 4, 36);
  }
  for (let i = 0; i < 6; i++) {
    const x = r() * W, y = r() * H, rad = 6 + r() * 16;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(5,5,5,0.85)'); g.addColorStop(0.7, 'rgba(20,20,20,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  return toTex(c);
}

/** Diagonal hazard stripes with a label, for the escape zone floor marking. */
export function makeZoneTexture(text) {
  const [c, ctx] = makeCanvas(1024, 128);
  ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.clearRect(0, 0, 1024, 128);
  for (let x = -128; x < 1024 + 128; x += 64) {
    ctx.fillStyle = 'rgba(255,60,40,0.85)';
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 32 + 128, 128); ctx.lineTo(x + 128, 128); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(330, 24, 364, 80);
  ctx.fillStyle = '#ff5a3c';
  ctx.font = '56px "Black Ops One", Impact, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 66);
  return toTex(c, false);
}

/* ---------------- Realistic vehicle skins (colour + normal maps) ---------------- */

/** Convert a grayscale height canvas into a tangent-space normal map. */
export function heightToNormal(src, strength = 2.5) {
  const w = src.width, h = src.height;
  const s = src.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const H = (x, y) => s[((((y + h) % h) * w) + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255;
      d[i + 1] = (dy / l * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function softSpot(ctx, x, y, rad, color, S) {
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
    const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
  }
}

/** Painted aircraft skin: one tile ≈ 2 m. Panel lines, rivet rows, access panels, faded paint, grime. */
export function makeAircraftSkin(baseHex, seed = 1) {
  const S = 512, r = rng(seed);
  const [c, ctx] = makeCanvas(S, S);
  const [hc, hx] = makeCanvas(S, S);
  ctx.fillStyle = new THREE.Color(baseHex).getStyle(); ctx.fillRect(0, 0, S, S);
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) softSpot(ctx, r() * S, r() * S, 20 + r() * 110, r() < 0.5 ? 'rgba(255,255,240,0.05)' : 'rgba(0,0,0,0.07)', S);
  // Panel layout: horizontal bands with staggered vertical seams
  const ys = [0];
  while (ys[ys.length - 1] < S) ys.push(ys[ys.length - 1] + 70 + r() * 90);
  const seam = (x0, y0, x1, y1) => {
    ctx.strokeStyle = 'rgba(0,0,0,0.42)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    hx.strokeStyle = '#2a2a2a'; hx.lineWidth = 2.2;
    hx.beginPath(); hx.moveTo(x0, y0); hx.lineTo(x1, y1); hx.stroke();
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(len / 9);
    const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
    for (let k = 1; k < n; k++) {
      const t = k / n, px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
      for (const s of [-1, 1]) {
        const rx = px + nx * 5 * s, ry = py + ny * 5 * s;
        ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(rx - 0.8, ry - 0.8, 1.6, 1.6);
        hx.fillStyle = '#b8b8b8'; hx.beginPath(); hx.arc(rx, ry, 1.3, 0, Math.PI * 2); hx.fill();
      }
    }
  };
  for (let k = 0; k < ys.length - 1; k++) {
    seam(0, ys[k], S, ys[k]);
    let x = r() * 80;
    while (x < S) { seam(x, ys[k], x, Math.min(S, ys[k + 1])); x += 90 + r() * 140; }
  }
  // Access panels with screw heads
  for (let i = 0; i < 16; i++) {
    const w = 22 + r() * 60, h = 16 + r() * 40, x = r() * (S - w), y = r() * (S - h);
    ctx.strokeStyle = 'rgba(0,0,0,0.38)'; ctx.lineWidth = 1.2; ctx.strokeRect(x, y, w, h);
    hx.strokeStyle = '#3a3a3a'; hx.lineWidth = 1.8; hx.strokeRect(x, y, w, h);
    for (const [px, py] of [[x + 3, y + 3], [x + w - 3, y + 3], [x + 3, y + h - 3], [x + w - 3, y + h - 3]]) {
      hx.fillStyle = '#c8c8c8'; hx.beginPath(); hx.arc(px, py, 1.6, 0, Math.PI * 2); hx.fill();
    }
  }
  // Exhaust / oil grime streaks running aft
  for (let i = 0; i < 45; i++) {
    const x = r() * S, y = r() * S, len = 40 + r() * 160, w = 3 + r() * 12;
    const g = ctx.createLinearGradient(x, y, x, y + len);
    g.addColorStop(0, `rgba(20,18,14,${0.05 + r() * 0.12})`); g.addColorStop(1, 'rgba(20,18,14,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, len);
  }
  for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(210,205,190,${r() * 0.25})`; ctx.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
  addNoise(ctx, S, S, 9, r);
  addNoise(hx, S, S, 6, r);
  return { map: toTex(c), normalMap: heightToNormal(hc, 3.2) };
}

/** Armour plate skin: one tile ≈ 3 m. Optional camouflage, weld seams, bolt rows, cast roughness, dust and wear. */
export function makeArmorSkin(baseHex, seed = 1, camo = null) {
  const S = 512, r = rng(seed);
  const [c, ctx] = makeCanvas(S, S);
  const [hc, hx] = makeCanvas(S, S);
  ctx.fillStyle = new THREE.Color(baseHex).getStyle(); ctx.fillRect(0, 0, S, S);
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, S, S);
  if (camo) {
    for (const [col, n, size] of camo) {
      ctx.fillStyle = new THREE.Color(col).getStyle();
      for (let i = 0; i < n; i++) blob(ctx, r() * S, r() * S, size * (0.6 + r() * 0.8), r, S);
    }
  }
  for (let i = 0; i < 50; i++) softSpot(ctx, r() * S, r() * S, 30 + r() * 120, r() < 0.6 ? 'rgba(190,170,130,0.12)' : 'rgba(0,0,0,0.08)', S);
  // Weld seams (raised beads)
  for (let i = 0; i < 6; i++) {
    const horiz = r() < 0.5, p = r() * S;
    for (let t = 0; t < S; t += 2.5) {
      const x = horiz ? t : p + Math.sin(t * 0.3) * 0.6, y = horiz ? p + Math.sin(t * 0.3) * 0.6 : t;
      hx.fillStyle = `rgb(${175 + r() * 30},${175 + r() * 30},${175 + r() * 30})`;
      hx.beginPath(); hx.arc(x, y, 2.2, 0, Math.PI * 2); hx.fill();
      ctx.fillStyle = 'rgba(40,36,30,0.05)'; ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }
  // Bolt rows
  for (let i = 0; i < 8; i++) {
    const x0 = r() * S, y0 = r() * S, horiz = r() < 0.5, n = 4 + Math.floor(r() * 8);
    for (let k = 0; k < n; k++) {
      const x = horiz ? x0 + k * 14 : x0, y = horiz ? y0 : y0 + k * 14;
      hx.fillStyle = '#d0d0d0'; hx.beginPath(); hx.arc(x % S, y % S, 2.6, 0, Math.PI * 2); hx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc((x % S) + 0.8, (y % S) + 0.8, 2.4, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Scratches, chips, oil stains
  ctx.lineWidth = 1;
  for (let i = 0; i < 70; i++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI, l = 6 + r() * 30;
    ctx.strokeStyle = `rgba(230,225,210,${0.08 + r() * 0.15})`;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  for (let i = 0; i < 300; i++) { ctx.fillStyle = `rgba(60,55,45,${r() * 0.35})`; ctx.fillRect(r() * S, r() * S, 1 + r() * 2.5, 1 + r() * 2.5); }
  for (let i = 0; i < 10; i++) softSpot(ctx, r() * S, r() * S, 8 + r() * 30, 'rgba(40,28,15,0.18)', S);
  addNoise(ctx, S, S, 12, r);
  addNoise(hx, S, S, 22, r);       // cast / rolled steel roughness
  return { map: toTex(c), normalMap: heightToNormal(hc, 2.2) };
}

/** One track link across the full track width (u) and one pitch (v). */
export function makeTrackLinkTexture() {
  const W = 128, Hh = 64;
  const [c, ctx] = makeCanvas(W, Hh);
  const [hc, hx] = makeCanvas(W, Hh);
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(0, 0, W, Hh);
  hx.fillStyle = '#404040'; hx.fillRect(0, 0, W, Hh);
  // rubber road pads
  for (const x0 of [10, 70]) {
    ctx.fillStyle = '#1b1b1c'; ctx.fillRect(x0, 8, 48, 46);
    hx.fillStyle = '#b0b0b0'; hx.fillRect(x0, 8, 48, 46);
  }
  // end connectors + centre guide
  for (const x0 of [0, 59, 120]) {
    ctx.fillStyle = '#5a5854'; ctx.fillRect(x0, 0, 8, Hh);
    hx.fillStyle = '#d8d8d8'; hx.fillRect(x0, 0, 8, Hh);
  }
  ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, W, 3);
  hx.fillStyle = '#000'; hx.fillRect(0, 0, W, 3);
  const map = toTex(c);
  return { map, normalMap: heightToNormal(hc, 3) };
}

/** Engine-deck grille / louvres. */
export function makeGrilleTexture() {
  const S = 128;
  const [c, ctx] = makeCanvas(S, S);
  const [hc, hx] = makeCanvas(S, S);
  ctx.fillStyle = '#1a1a19'; ctx.fillRect(0, 0, S, S);
  hx.fillStyle = '#202020'; hx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 10) {
    ctx.fillStyle = '#4a4840'; ctx.fillRect(0, y, S, 5);
    hx.fillStyle = '#e0e0e0'; hx.fillRect(0, y, S, 5);
  }
  return { map: toTex(c), normalMap: heightToNormal(hc, 3) };
}
