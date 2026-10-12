// Lightweight particle effects built from small meshes (explosions, smoke, dust, sparks).
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.sphere = new THREE.SphereGeometry(1, 8, 6);
    this.ico = new THREE.IcosahedronGeometry(1, 0);
    this.box = new THREE.BoxGeometry(1, 1, 1);
  }

  add(o) {
    if (this.parts.length > 650) return;
    const opacity = o.opacity ?? 1;
    const mat = o.basic
      ? new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity, depthWrite: false, toneMapped: false,
          blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending })
      : new THREE.MeshLambertMaterial({ color: o.color, transparent: true, opacity, depthWrite: false });
    const m = new THREE.Mesh(o.geo || this.sphere, mat);
    m.position.copy(o.pos);
    m.scale.setScalar(o.size);
    if (o.randomRot) m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.scene.add(m);
    this.parts.push({
      m, vel: o.vel ? o.vel.clone() : new THREE.Vector3(), life: o.life, max: o.life, size: o.size,
      grow: o.grow ?? 0, op: opacity, gravity: o.gravity ?? 0, drag: o.drag ?? 0, spin: o.spin ?? 0,
      fade: o.fade ?? true, floor: o.floor ?? -1000,
    });
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.m);
        p.m.material.dispose();
        this.parts.splice(i, 1);
        continue;
      }
      const t = 1 - p.life / p.max;
      p.vel.y -= p.gravity * dt;
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.m.position.addScaledVector(p.vel, dt);
      if (p.m.position.y < p.floor) { p.m.position.y = p.floor; p.vel.set(0, 0, 0); p.spin = 0; }
      p.m.scale.setScalar(p.size * (1 + p.grow * t));
      if (p.fade) p.m.material.opacity = p.op * (1 - t) * (1 - t * 0.3);
      if (p.spin) { p.m.rotation.x += p.spin * dt; p.m.rotation.y += p.spin * dt * 0.7; }
    }
  }

  rv(s) { return new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s); }

  explosion(pos, s = 1, floor = 0) {
    this.add({ pos, size: 2.2 * s, grow: 2.2, life: 0.18, color: 0xfff4c8, basic: true, additive: true });
    for (let i = 0; i < 12 * s; i++) {
      const v = this.rv(14 * s); v.y = Math.abs(v.y) + 3;
      this.add({ pos: _v.copy(pos).add(this.rv(1.5 * s)), vel: v, size: (0.8 + Math.random() * 0.9) * s, grow: 1.6,
        life: 0.45 + Math.random() * 0.3, color: Math.random() < 0.5 ? 0xff8a1f : 0xffc43a, basic: true, additive: true, drag: 3 });
    }
    for (let i = 0; i < 9 * s; i++) {
      const v = this.rv(6 * s); v.y = Math.abs(v.y) + 3 * s;
      this.add({ pos: _v.copy(pos).add(this.rv(2 * s)), vel: v, size: (1 + Math.random()) * s, grow: 2.2,
        life: 1.4 + Math.random() * 1.2, color: 0x3a3632, opacity: 0.75, drag: 1.5, geo: this.ico, randomRot: true });
    }
    for (let i = 0; i < 7 * s; i++) {
      const v = this.rv(22 * s); v.y = Math.abs(v.y) + 8;
      this.add({ pos, vel: v, size: 0.25 + Math.random() * 0.3, life: 1.6, color: 0x222222, gravity: 30, spin: 8,
        geo: this.box, fade: false, floor: floor + 0.15, randomRot: true });
    }
  }

  impact(pos, color = 0xffb040) {
    this.add({ pos, size: 0.9, grow: 1.5, life: 0.15, color: 0xfff0c0, basic: true, additive: true });
    for (let i = 0; i < 6; i++) {
      this.add({ pos, vel: this.rv(18), size: 0.18, life: 0.35, color, basic: true, additive: true, gravity: 20 });
    }
    this.add({ pos, vel: new THREE.Vector3(0, 2, 0), size: 0.8, grow: 1.6, life: 0.8, color: 0x4a4540, opacity: 0.6, geo: this.ico });
  }

  muzzle(pos, dir) {
    this.add({ pos: _v.copy(pos).addScaledVector(dir, 0.4), size: 0.75, grow: 0.8, life: 0.09, color: 0xffe08a, basic: true, additive: true });
    for (let i = 0; i < 3; i++) {
      this.add({ pos, vel: dir.clone().multiplyScalar(6 + i * 3).add(this.rv(2)), size: 0.5, grow: 2.5, life: 0.6,
        color: 0x8a847c, opacity: 0.55, geo: this.ico, drag: 2.5 });
    }
  }

  smoke(pos, color = 0x2f2c2a, size = 1, life = 2, rise = 3) {
    this.add({ pos: _v.copy(pos).add(this.rv(0.6)), vel: new THREE.Vector3((Math.random() - 0.5), rise, (Math.random() - 0.5)),
      size, grow: 2.5, life, color, opacity: 0.6, geo: this.ico, randomRot: true });
  }

  fire(pos) {
    this.add({ pos: _v.copy(pos).add(this.rv(0.8)), vel: new THREE.Vector3(0, 3 + Math.random() * 2, 0),
      size: 0.5 + Math.random() * 0.4, grow: 0.5, life: 0.35, color: Math.random() < 0.5 ? 0xff7a1a : 0xffc340, basic: true, additive: true });
  }

  dust(pos, color) {
    this.add({ pos: _v.copy(pos).add(this.rv(0.8)), vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2),
      size: 0.7, grow: 3, life: 1.1, color, opacity: 0.45, geo: this.ico, randomRot: true });
  }

  sparks(pos) {
    for (let i = 0; i < 4; i++) {
      const v = this.rv(10); v.y = Math.abs(v.y) + 2;
      this.add({ pos, vel: v, size: 0.1, life: 0.3, color: 0xffd27a, basic: true, additive: true, gravity: 25 });
    }
  }
}
