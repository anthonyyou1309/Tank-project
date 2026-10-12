// Shared PBR materials for the vehicles. Skins are cached so many tanks share one set of generated textures.
import * as THREE from 'three';
import * as TX from './textures.js';

let ENV = null;
/** Environment (sky reflection) map applied to vehicle materials created afterwards. */
export function setVehicleEnv(tex) { ENV = tex; }

const skinCache = new Map();
function cached(key, make) {
  if (!skinCache.has(key)) skinCache.set(key, make());
  return skinCache.get(key);
}

function std(params) {
  const m = new THREE.MeshStandardMaterial(params);
  if (ENV) { m.envMap = ENV; m.envMapIntensity = params.envMapIntensity ?? 0.7; }
  return m;
}

/** Painted airframe with panel lines (tile ≈ 2 m). */
export function aircraftPaint(hex, seed = 1) {
  const s = cached(`air:${hex}:${seed}`, () => TX.makeAircraftSkin(hex, seed));
  s.map.repeat.set(0.5, 0.5); s.normalMap.repeat.set(0.5, 0.5);
  return std({ map: s.map, normalMap: s.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.68, metalness: 0.25, side: THREE.DoubleSide });
}

/** Armour paint with optional camouflage (tile ≈ 3 m). */
export function armorPaint(hex, seed = 1, camo = null) {
  const s = cached(`arm:${hex}:${seed}:${camo ? JSON.stringify(camo) : ''}`, () => TX.makeArmorSkin(hex, seed, camo));
  s.map.repeat.set(1 / 3, 1 / 3); s.normalMap.repeat.set(1 / 3, 1 / 3);
  return std({ map: s.map, normalMap: s.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.82, metalness: 0.2, side: THREE.DoubleSide });
}

export function trackMaterial() {
  const s = TX.makeTrackLinkTexture();        // per-vehicle so each track can scroll independently
  s.map.repeat.set(1, 1 / 0.19); s.normalMap.repeat.set(1, 1 / 0.19);
  return std({ map: s.map, normalMap: s.normalMap, roughness: 0.75, metalness: 0.55, side: THREE.DoubleSide, envMapIntensity: 0.4 });
}

export function grilleMaterial() {
  const s = cached('grille', () => TX.makeGrilleTexture());
  s.map.repeat.set(4, 4); s.normalMap.repeat.set(4, 4);
  return std({ map: s.map, normalMap: s.normalMap, roughness: 0.8, metalness: 0.5 });
}

export const plain = (color, roughness = 0.6, metalness = 0.4, extra = {}) => std({ color, roughness, metalness, ...extra });
export const glass = (tint = 0x1e3040, opacity = 0.5) => std({ color: tint, roughness: 0.04, metalness: 0.95, transparent: true, opacity, envMapIntensity: 1.4 });
export const sensorGlass = () => std({ color: 0x0b1626, roughness: 0.03, metalness: 1.0, envMapIntensity: 1.6 });
export const lamp = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });

/** Camouflage schemes for tanks (colour, blob count, blob size in px of a 3 m tile). */
export const CAMO = {
  russianDesert: [[0x6e6a3e, 10, 46], [0x6a4d32, 8, 34]],
  russianGreen: [[0x3a4228, 8, 44], [0x5b5a3a, 6, 30]],
};
