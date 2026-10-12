// Helicopter unit: AH-64D Apache model + flight state, HP bar and weapon mount points.
import * as THREE from 'three';
import { buildApache } from './apache.js';

export const HELI_VARIANTS = {
  player: { paint: 0x4a5040, emblem: '#111111', tail: '07012' },
  enemy: { paint: 0x5b636b, emblem: '#c4202a', tail: '' },
};

export class Helicopter {
  constructor({ theme = 'desert', variant = 'player', label = 'VIPER-1', number, withHpBar = true, hp = 400 } = {}) {
    void theme;
    this.kind = 'heli';
    this.variant = variant;
    this.label = label;
    this.maxHp = hp;
    this.hp = hp;
    this.alive = true;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.yawRate = 0;
    this.pitch = 0;
    this.roll = 0;
    this.cF = 0; this.cT = 0; this.cV = 0;     // smoothed cyclic / pedal / collective inputs
    this.flashT = 0;
    this.missileSide = 1;
    this.rotorSpeed = 1;

    const V = HELI_VARIANTS[variant];
    const m = buildApache({ paint: V.paint, emblem: V.emblem, tailNumber: number ?? V.tail });
    this.group = m.root;
    this.group.rotation.order = 'YXZ';
    Object.assign(this, {
      rotor: m.rotor, blades: m.blades, rotorDisc: m.rotorDisc, tailRotor: m.tailRotor, gun: m.gun, gunPitch: m.gunPitch,
      gunTip: m.gunTip, missileTips: m.missileTips, cockpitEye: m.cockpitEye, beaconMat: m.beaconMat, bodyMat: m.paintMat,
    });
    this.bodyMat = this.bodyMat.clone();           // per-aircraft so hit-flash / wreck tint stays local
    this.group.traverse((o) => { if (o.isMesh && o.material === m.paintMat) o.material = this.bodyMat; });
    if (withHpBar) this.makeHpBar();
  }

  get forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  get left() { return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
  get radius() { return 5; }

  makeHpBar() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    this.hpCtx = c.getContext('2d');
    this.hpTex = new THREE.CanvasTexture(c);
    this.hpTex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.SpriteMaterial({ map: this.hpTex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false, sizeAttenuation: false });
    this.hpSprite = new THREE.Sprite(m);
    this.hpSprite.scale.set(0.13, 0.0325, 1);
    this.hpSprite.renderOrder = 11;
    this.drawHp();
  }

  drawHp() {
    if (!this.hpCtx) return;
    const ctx = this.hpCtx;
    const friendly = this.variant === 'player';
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 22px Rajdhani, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.fillStyle = friendly ? '#7dff9a' : '#ff7a6a';
    ctx.strokeText(this.label, 128, 22);
    ctx.fillText(this.label, 128, 22);
    const f = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(26, 31, 204, 22);
    ctx.fillStyle = friendly ? (f > 0.6 ? '#4cff6a' : f > 0.3 ? '#ffd23f' : '#ff3b3b') : (f > 0.6 ? '#ff5a3c' : f > 0.3 ? '#ff9a2a' : '#ffd23f');
    ctx.fillRect(30, 35, 196 * f, 14);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(26, 31, 204, 22);
    this.hpTex.needsUpdate = true;
  }

  hit(dmg) {
    this.hp = Math.max(0, this.hp - dmg);
    this.flashT = 0.2;
    this.drawHp();
  }

  gunWorld(out) { return this.gunTip.getWorldPosition(out); }
  nextMissileTip(out) {
    this.missileSide = 1 - this.missileSide;
    return this.missileTips[this.missileSide].getWorldPosition(out);
  }

  /** Slew the chin gun toward a world-space target within its mechanical limits. */
  aimGun(target) {
    const local = this.group.worldToLocal(target.clone()).sub(this.gun.position);
    const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.9, 1.9);
    const pitch = THREE.MathUtils.clamp(Math.atan2(-local.y, Math.hypot(local.x, local.z)), -0.2, 1.3);
    this.gun.rotation.y += (yaw - this.gun.rotation.y) * 0.25;
    this.gunPitch.rotation.x += (pitch - this.gunPitch.rotation.x) * 0.25;
  }

  syncVisual(dt, time) {
    const rs = this.rotorSpeed;
    this.group.position.copy(this.pos);
    const wob = this.alive ? 0.005 : 0;           // airframe vibration
    this.group.rotation.set(this.pitch + Math.sin(time * 7.1) * wob, this.yaw, this.roll + Math.sin(time * 5.3 + 1) * wob);
    this.rotor.rotation.y += dt * 30 * rs;
    this.tailRotor.rotation.x += dt * 48 * rs;
    this.rotorDisc.material.opacity = 0.11 * rs;
    const cone = 0.025 + this.cV * 0.02;          // blade coning follows collective; droop when stopped
    for (const b of this.blades) b.rotation.x = -cone * rs + (1 - rs) * 0.05;
    this.beaconMat.color.setHex(Math.sin(time * 6) > 0.6 ? 0xff3030 : 0x330000);
    if (this.flashT > 0) {
      this.flashT -= dt;
      const f = Math.max(0, this.flashT) * 4;
      this.bodyMat.emissive.setRGB(f, f * 0.3, f * 0.05);
    }
    if (this.hpSprite) this.hpSprite.position.set(this.pos.x, this.pos.y + 5.2, this.pos.z);
    this.group.updateMatrixWorld(true);
  }

  wreck() {
    this.bodyMat.color.setRGB(0.15, 0.14, 0.13);
    this.bodyMat.emissive.setRGB(0, 0, 0);
    if (this.hpSprite) this.hpSprite.visible = false;
  }
}
