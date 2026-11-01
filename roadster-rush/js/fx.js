// Pooled sprite particles: thruster vapour, dust, debris sparks.
import * as THREE from 'three';

const puffTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

export class Particles {
  constructor(scene, count = 220) {
    this.pool = [];
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      scene.add(s);
      this.pool.push({ s, v: new THREE.Vector3(), life: 0, max: 1, size: 1, grow: 1, alpha: 1, drag: 1, worldDrift: true });
    }
    this.i = 0;
  }

  // pos: world position; vel: world velocity; opts: color, size, grow, life, alpha, additive, drift
  emit(pos, vel, o = {}) {
    const p = this.pool[this.i];
    this.i = (this.i + 1) % this.pool.length;
    p.s.position.copy(pos);
    p.v.copy(vel);
    p.life = p.max = o.life ?? 0.6;
    p.size = o.size ?? 0.6;
    p.grow = o.grow ?? 2.5;
    p.alpha = o.alpha ?? 0.6;
    p.drag = o.drag ?? 2.5;
    p.worldDrift = o.drift ?? true; // drifts toward camera with the scrolling world
    p.s.material.color.set(o.color ?? 0xeaf6ff);
    p.s.material.blending = o.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.s.visible = true;
  }

  update(dt, worldMove) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const k = 1 - p.life / p.max;
      p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.s.position.addScaledVector(p.v, dt);
      if (p.worldDrift) p.s.position.z += worldMove;
      const sz = p.size * (1 + p.grow * k);
      p.s.scale.set(sz, sz, sz);
      p.s.material.opacity = p.alpha * (1 - k);
    }
  }

  clear() { for (const p of this.pool) { p.life = 0; p.s.visible = false; } }
}
