// Tank unit: picks a real-world vehicle model for its role and side, and carries combat state + HP bar.
//   Enemy convoy : standard → T-72B3, heavy → T-90, elite → 2K22 Tunguska (SAM)
//   Friendly     : standard → M1A2 Abrams, heavy → M1A2 Abrams TUSK, elite (player) → 2K22-style AA vehicle
import * as THREE from 'three';
import { buildAbrams, buildEastMBT, buildTunguska } from './armor.js';
import { CAMO } from './materials.js';

export const TANK_TYPES = {
  standard: { label: 'T-72B3', allyLabel: 'M1A2', hp: 160, speed: 10, fire: [2.8, 4.4], score: 100 },
  heavy: { label: 'T-90', allyLabel: 'M1A2 TUSK', hp: 260, speed: 7.5, fire: [2.4, 3.6], score: 150 },
  elite: { label: 'TUNGUSKA SAM', allyLabel: 'AA TRACK', hp: 200, speed: 9, fire: [3.2, 4.8], score: 250, sam: true },
};

/**
 * Vehicles the player can command in Tank Commander mode. Vehicles without missiles get a high-velocity
 * main gun firing proximity-fused airburst rounds that hit far harder than the Tunguska's flak.
 */
export const PLAYER_VEHICLES = {
  tunguska: { name: '2K22 Tunguska', short: 'TUNGUSKA', hp: 450, speed: 16, sam: true, weapon: 'gun', desc: 'Rapid-fire twin 30mm + lock-on SAMs' },
  abrams: { name: 'M1A2 Abrams', short: 'M1A2', hp: 620, speed: 17, sam: false, weapon: 'cannon', desc: '120mm high-velocity airburst gun',
    gun: { speed: 560, reload: 2.2, direct: 200, splash: 55, prox: 9 } },
  abrams_tusk: { name: 'M1A2 TUSK', short: 'M1A2 TUSK', hp: 740, speed: 15, sam: false, weapon: 'cannon', desc: 'Up-armoured Abrams, 120mm gun',
    gun: { speed: 560, reload: 2.3, direct: 200, splash: 55, prox: 9 } },
  t72: { name: 'T-72B3', short: 'T-72B3', hp: 480, speed: 18, sam: false, weapon: 'cannon', desc: 'Fast and light, 125mm gun',
    gun: { speed: 540, reload: 2.1, direct: 190, splash: 50, prox: 9 } },
  t90: { name: 'T-90', short: 'T-90', hp: 580, speed: 16, sam: false, weapon: 'cannon', desc: 'Heavier armour, 125mm gun',
    gun: { speed: 550, reload: 2.2, direct: 195, splash: 52, prox: 9 } },
};

function buildModel(typeKey, friendly, theme, seed, model) {
  const desert = theme === 'desert';
  if (model) {
    const ruPaint = desert ? 0xa89870 : 0x4f5733;
    const ruCamo = desert ? CAMO.russianDesert : CAMO.russianGreen;
    if (model === 'tunguska') return buildTunguska({ paint: desert ? 0xb7a47c : 0x56603e, seed });
    if (model === 'abrams' || model === 'abrams_tusk') return buildAbrams({ paint: desert ? 0xbca984 : 0x4b5320, seed, tusk: model === 'abrams_tusk' });
    return buildEastMBT({ paint: ruPaint, camo: ruCamo, seed, t90: model === 't90' });
  }
  if (friendly) {
    if (typeKey === 'elite') return buildTunguska({ paint: desert ? 0xb7a47c : 0x56603e, seed });
    return buildAbrams({ paint: desert ? 0xbca984 : 0x4b5320, seed, tusk: typeKey === 'heavy' });
  }
  const paint = desert ? 0xa89870 : 0x4f5733;
  const camo = desert ? CAMO.russianDesert : CAMO.russianGreen;
  if (typeKey === 'elite') return buildTunguska({ paint, camo, seed });
  return buildEastMBT({ paint, camo, seed, t90: typeKey === 'heavy' });
}

export class Tank {
  constructor({ typeKey, theme = 'desert', seed = 1, label, friendly = false, hp, model }) {
    this.kind = 'tank';
    this.typeKey = typeKey;
    this.friendly = friendly;
    const m = buildModel(typeKey, friendly, theme, seed, model);
    // per-instance stats: gameplay offsets scale with the real vehicle size
    this.stats = { ...TANK_TYPES[typeKey], scale: m.hitScale };
    this.label = label ?? (friendly ? this.stats.allyLabel : this.stats.label);
    this.maxHp = hp ?? this.stats.hp;
    this.hp = this.maxHp;
    this.alive = true;
    this.escaped = false;

    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.turretYaw = 0;
    this.barrelElev = 0;
    this.groundPitch = 0;
    this.groundRoll = 0;
    this.flashT = 0;
    this.recoil = 0;
    this.muzzleIdx = 0;

    this.group = m.root;
    this.group.rotation.order = 'YXZ';
    Object.assign(this, {
      body: m.body, turret: m.turret, barrel: m.gun, recoilGroup: m.recoil, muzzles: m.muzzles, rocketTip: m.rocketTip,
      wheels: m.wheels, trackMat: m.trackMat, spinners: m.spinners, hpHeight: m.hpHeight, recoilDist: m.recoilDist,
    });
    // Per-vehicle copies of the paint so hit flashes / burnt wrecks don't affect other tanks
    this.paintMats = m.paintMats.map((src) => {
      const c = src.clone();
      this.group.traverse((o) => {
        if (!o.isMesh) return;
        if (o.material === src) o.material = c;
        else if (Array.isArray(o.material)) o.material = o.material.map((x) => (x === src ? c : x));
      });
      return c;
    });
    this.makeHpBar();
  }

  get forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  get radius() { return 3.0 * this.stats.scale; }

  makeHpBar() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    this.hpCtx = c.getContext('2d');
    this.hpTex = new THREE.CanvasTexture(c);
    this.hpTex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.SpriteMaterial({ map: this.hpTex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false, sizeAttenuation: false });
    this.hpSprite = new THREE.Sprite(m);
    this.hpSprite.scale.set(0.11, 0.0275, 1);
    this.hpSprite.renderOrder = 10;
    this.drawHp();
  }

  drawHp() {
    const ctx = this.hpCtx;
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 22px Rajdhani, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.fillStyle = this.friendly ? '#7dff9a' : this.stats.sam ? '#ff7a6a' : '#ffffff';
    ctx.strokeText(this.label, 128, 22);
    ctx.fillText(this.label, 128, 22);
    const f = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(26, 31, 204, 22);
    ctx.fillStyle = this.friendly ? (f > 0.6 ? '#4cff6a' : f > 0.3 ? '#ffd23f' : '#ff3b3b') : (f > 0.6 ? '#ff5a3c' : f > 0.3 ? '#ff9a2a' : '#ffd23f');
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

  destroy() {
    this.alive = false;
    this.speed = 0;
    for (const m of this.paintMats) { m.color.setRGB(0.16, 0.15, 0.14); m.emissive.setRGB(0, 0, 0); }
    this.trackMat.color.setRGB(0.3, 0.3, 0.3);
    this.hpSprite.visible = false;
  }

  /** World position of the next gun muzzle (multi-barrel vehicles alternate). */
  muzzleWorld(out) {
    const tip = this.muzzles[this.muzzleIdx % this.muzzles.length];
    this.muzzleIdx++;
    return tip.getWorldPosition(out);
  }
  rocketWorld(out) { return (this.rocketTip || this.muzzles[0]).getWorldPosition(out); }

  syncVisual(dt, time) {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    this.group.rotation.x = this.groundPitch;
    this.group.rotation.z = this.groundRoll;
    if (this.alive) {
      for (const w of this.wheels) w.rotation.x += (this.speed * dt) / w.userData.r;
      const d = (this.speed * dt) / 0.19;
      this.trackMat.map.offset.y += d;
      this.trackMat.normalMap.offset.y += d;
      // engine idle vibration + slight squat under acceleration
      this.body.position.y = Math.sin(time * 31 + this.pos.x) * 0.006 + Math.sin(time * 7 + this.pos.z) * 0.01 * Math.min(1, Math.abs(this.speed) / 6);
      for (const s of this.spinners) s.obj.rotation.y += s.speed * dt;
    }
    if (this.turret.parent === this.body) this.turret.rotation.y = this.turretYaw;
    this.barrel.rotation.x = -this.barrelElev;
    this.recoil = Math.max(0, this.recoil - dt * 3);
    this.recoilGroup.position.z = -this.recoil * this.recoilDist;
    if (this.flashT > 0) {
      this.flashT -= dt;
      const f = Math.max(0, this.flashT) * 5;
      for (const m of this.paintMats) m.emissive.setRGB(f, f * 0.3, f * 0.05);
    }
    this.hpSprite.position.set(this.pos.x, this.pos.y + this.hpHeight + 1.2, this.pos.z);
    this.group.updateMatrixWorld(true);
  }
}
