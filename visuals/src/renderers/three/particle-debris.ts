import * as THREE from 'three';
import { get, pulse } from '../../bus';
import { getKeypointsSmoothed, getActiveTags } from '../../mediapipe';
import { config } from '../../settings';
import type { ThreeScene } from './types';

const PARTICLE_COUNT = 3000;
const SPAWN_RADIUS = 20;

// MediaPipe upper-body landmark indices used as spawn anchors.
const ANCHOR_INDICES = [
  0,   // nose
  11, 12, // shoulders
  13, 14, // elbows
  15, 16, // wrists
];

// Base world-space extents of the view at z=0 with our base camera.
// Picked so normalised pose coords map to a comfortable area on screen.
// The final extent is BASE_VIEW_HALF_* × config.particleViewScale,
// so the rehearsal panel can widen or tighten the mapping live.
const BASE_halfW = 18;
const BASE_halfH = 11;

// ---- Shaders ----------------------------------------------------------------

const vertexShader = /* glsl */ `
  attribute float aLife;
  attribute float aSeed;
  attribute float aPerformer;
  uniform float uPointScale;
  varying float vLife;
  varying float vSeed;
  varying float vPerformer;

  void main() {
    vLife = aLife;
    vSeed = aSeed;
    vPerformer = aPerformer;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPos;
    float size = (0.5 + aLife * 1.5) * uPointScale;
    gl_PointSize = size * (300.0 / -mvPos.z);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uCentroid;
  uniform float uHueShift;
  uniform float uBrightness;
  varying float vLife;
  varying float vSeed;
  varying float vPerformer;

  vec3 hueRotate(vec3 c, float angle) {
    float s = sin(angle);
    float co = cos(angle);
    mat3 m = mat3(
      0.299 + 0.701*co - 0.300*s,  0.587 - 0.587*co + 0.769*s,  0.114 - 0.114*co - 0.497*s,
      0.299 - 0.299*co - 0.299*s,  0.587 + 0.413*co + 0.328*s,  0.114 - 0.114*co - 0.029*s,
      0.299 - 0.300*co + 1.250*s,  0.587 - 0.588*co - 1.050*s,  0.114 + 0.886*co - 0.203*s
    );
    return clamp(m * c, 0.0, 1.0);
  }

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float alpha = smoothstep(1.0, 0.3, d) * vLife;

    // Per-performer palette: p1 cool/cyan↔amber, p2 warm/magenta↔crimson.
    // vPerformer < 0 → untagged particle, blended average.
    float perfT = clamp(vPerformer, 0.0, 1.0);
    vec3 warmP1 = vec3(1.0, 0.45, 0.1);
    vec3 coolP1 = vec3(0.55, 0.85, 1.0);
    vec3 warmP2 = vec3(1.0, 0.15, 0.35);
    vec3 coolP2 = vec3(0.95, 0.55, 1.0);
    vec3 warm = mix(warmP1, warmP2, perfT);
    vec3 cool = mix(coolP1, coolP2, perfT);

    float mixT = clamp(uCentroid + vSeed * 0.15, 0.0, 1.0);
    vec3 col = mix(warm, cool, mixT);

    col = hueRotate(col, uHueShift * 6.28);
    col *= uBrightness;

    gl_FragColor = vec4(col, alpha);
  }
`;

// ---- Scene ------------------------------------------------------------------

// Per-performer, per-frame anchor data (resolved world positions and
// velocities from prev frame's normalised landmarks).
type AnchorData = {
  tag: string;
  performerIdx: number;       // 0 or 1 → p1 or p2
  positions: THREE.Vector3[]; // length = ANCHOR_INDICES.length
  velocities: THREE.Vector3[];
  centroid: THREE.Vector3;    // midpoint of shoulders
};

export class ParticleDebrisScene implements ThreeScene {
  readonly name = 'debrisField';

  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private points: THREE.Points | null = null;
  private trailQuad: THREE.Mesh | null = null;

  private positions!: Float32Array;
  private velocities!: Float32Array;
  private lives!: Float32Array;
  private seeds!: Float32Array;
  private performerAttr!: Float32Array;

  private camera: THREE.PerspectiveCamera | null = null;
  private baseFov = 65;

  // Prev-frame normalised landmark storage, keyed by performer tag.
  private prevNormLandmarks = new Map<string, { x: number; y: number }[]>();

  // Scratch objects reused each frame to avoid allocation churn.
  private _anchorScratch: AnchorData[] = [];

  setup(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.camera = camera;
    camera.position.set(0, 0, 30);
    camera.lookAt(0, 0, 0);
    camera.fov = this.baseFov;
    camera.updateProjectionMatrix();

    scene.fog = new THREE.FogExp2(0x000000, 0.012);

    this.positions = new Float32Array(PARTICLE_COUNT * 3);
    this.velocities = new Float32Array(PARTICLE_COUNT * 3);
    this.lives = new Float32Array(PARTICLE_COUNT);
    this.seeds = new Float32Array(PARTICLE_COUNT);
    this.performerAttr = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.seeds[i] = Math.random();
      this.lives[i] = Math.random() * 4;
      this.performerAttr[i] = -1;
      this.spawnFree(i, SPAWN_RADIUS);
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(this.lives, 1));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, 1));
    this.geometry.setAttribute('aPerformer', new THREE.BufferAttribute(this.performerAttr, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uPointScale: { value: 1.0 },
        uCentroid: { value: 0.3 },
        uHueShift: { value: 0.0 },
        uBrightness: { value: 1.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    scene.add(this.points);

    // Trail effect: fullscreen quad drawn before particles with partial opacity
    const trailGeo = new THREE.PlaneGeometry(2, 2);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 1.0,
      depthTest: false,
      depthWrite: false,
    });
    this.trailQuad = new THREE.Mesh(trailGeo, trailMat);
    this.trailQuad.renderOrder = -1;
    this.trailQuad.frustumCulled = false;
    scene.add(this.trailQuad);
  }

  tick(dt: number): void {
    if (!this.geometry || !this.material || !this.camera) return;
    dt = Math.min(dt, 0.1);

    // ---- Read bus signals ----
    const rms = get('audio.rms');
    const centroid = get('audio.centroid', 0.3);
    const onset = pulse('audio.onset');
    const motion = get('pose.motion');
    const openness = get('pose.openness');
    const compact = get('pose.state.compact');
    const expansive = get('pose.state.expansive');
    const elevated = get('pose.state.elevated');
    const leftReach = get('pose.state.leftReach');
    const rightReach = get('pose.state.rightReach');
    const intensity = get('phone.intensity', 0.6);
    const phoneX = get('phone.x', 0.5);
    const phoneY = get('phone.y', 0.5);

    const cc16 = get('midi.cc.16');  // density
    const cc17 = get('midi.cc.17');  // color shift
    const cc19 = get('midi.cc.19');  // flow speed
    const cc20 = get('midi.cc.20');  // turbulence
    const cc21 = get('midi.cc.21');  // trail/smear
    const cc22 = get('midi.cc.22');  // rotation
    const cc23 = get('midi.cc.23');  // zoom
    const cc24 = get('midi.cc.24');  // glitch
    const cc25 = get('midi.cc.25');  // brightness

    // ---- Resolve live anchors for every active performer ----
    const anchors = this.resolveAnchors(dt);
    const hasPose = anchors.length > 0;

    // Midpoint between all active performers — used as the "local origin"
    // so compact/expansive forces pull toward / push from the bodies.
    const center = new THREE.Vector3();
    if (hasPose) {
      for (const a of anchors) center.add(a.centroid);
      center.multiplyScalar(1 / anchors.length);
    }
    if (this.points) {
      this.points.position.lerp(center, 0.12);
    }

    // ---- Derived values ----
    const velocityMult = (0.3 + motion * 2.0 + cc19 * 1.5) * (1 + rms * 3) * (0.5 + intensity);
    const wind = (leftReach - rightReach) * 2.0;
    const lift = elevated * 3.0;
    const turbulence = cc20 * 4.0;
    const densityRatio = 0.3 + cc16 * 0.5 + phoneY * 0.2;
    const fallbackRadius = SPAWN_RADIUS * (1 + expansive * 1.5 - compact * 0.5 + rms * 0.5);
    const burstActive = onset > 0.3;
    let burstCount = 0;

    const now = performance.now() * 0.001;

    // ---- Update particles ----
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      this.lives[i] -= dt * (0.3 + rms * 0.2);

      if (i / PARTICLE_COUNT > densityRatio) {
        this.lives[i] -= dt * 2.0;
      }

      if (this.lives[i] <= 0) {
        if (hasPose) {
          // Respawn from a random anchor on a random active performer.
          const a = anchors[(Math.random() * anchors.length) | 0];
          const burst = burstActive && burstCount < 300;
          this.spawnAtAnchor(i, a, burst);
          if (burst) burstCount++;
        } else if (burstActive && burstCount < 300) {
          this.spawnBurstFree(i);
          burstCount++;
        } else {
          this.spawnFree(i, fallbackRadius);
        }
        continue;
      }

      // Read current velocity/position (positions are in points.position-local space)
      let vx = this.velocities[i3];
      let vy = this.velocities[i3 + 1];
      let vz = this.velocities[i3 + 2];
      const px = this.positions[i3];
      const py = this.positions[i3 + 1];
      const pz = this.positions[i3 + 2];

      // Apply forces
      vx += wind * dt;
      vy += lift * dt;

      if (compact > 0.01) {
        const pull = compact * 2.0 * dt;
        vx -= px * pull;
        vy -= py * pull;
        vz -= pz * pull;
      }

      if (expansive > 0.01) {
        const dist = Math.sqrt(px * px + py * py + pz * pz) || 1;
        const push = expansive * 3.0 * dt / dist;
        vx += px * push;
        vy += py * push;
        vz += pz * push;
      }

      if (turbulence > 0.01) {
        const seed = this.seeds[i];
        const t = now * 2.0 + seed * 100;
        vx += Math.sin(t * 1.3 + seed * 7.0) * turbulence * dt;
        vy += Math.cos(t * 0.9 + seed * 13.0) * turbulence * dt;
        vz += Math.sin(t * 1.1 + seed * 23.0) * turbulence * dt;
      }

      if (cc24 > 0.01 && Math.random() < cc24 * 0.1 * dt) {
        vx += (Math.random() - 0.5) * cc24 * 40;
        vy += (Math.random() - 0.5) * cc24 * 40;
      }

      const damp = 0.97;
      vx *= damp;
      vy *= damp;
      vz *= damp;

      this.velocities[i3] = vx;
      this.velocities[i3 + 1] = vy;
      this.velocities[i3 + 2] = vz;

      this.positions[i3]     = px + vx * dt * velocityMult;
      this.positions[i3 + 1] = py + vy * dt * velocityMult;
      this.positions[i3 + 2] = pz + vz * dt * velocityMult;
    }

    this.geometry.attributes.position.needsUpdate = true;
    (this.geometry.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aPerformer as THREE.BufferAttribute).needsUpdate = true;

    // ---- Update uniforms ----
    const u = this.material.uniforms;
    u.uCentroid.value = centroid + (phoneX - 0.5) * 0.4;
    u.uHueShift.value = cc17;
    u.uBrightness.value = 0.6 + cc25 * 0.8 + elevated * 0.4 + rms * 0.3;
    u.uPointScale.value = 1.0 - compact * 0.3 + expansive * 0.4;

    // ---- Camera ----
    const targetFov = this.baseFov + openness * 20 - compact * 10;
    this.camera.fov += (targetFov - this.camera.fov) * 0.05;
    // Orbit camera around scene origin driven by face yaw/pitch. Signals are
    // already bus-smoothed (α=0.85); the 0.08 lerp adds a touch of cinematic
    // inertia so the camera glides rather than snaps.
    const faceYaw = get('face.yaw');     // [-1, 1] ≈ ±45°
    const facePitch = get('face.pitch');
    const R = 30 - cc23 * 20;
    const strength = config.faceCamStrength;
    const theta = faceYaw * 0.7 * strength;   // ±40° max yaw
    const phi   = facePitch * 0.5 * strength; // ±28° max pitch (nausea-prone axis)
    const tx = R * Math.sin(theta) * Math.cos(phi);
    const ty = R * Math.sin(phi);
    const tz = R * Math.cos(theta) * Math.cos(phi);
    this.camera.position.x += (tx - this.camera.position.x) * 0.08;
    this.camera.position.y += (ty - this.camera.position.y) * 0.08;
    this.camera.position.z += (tz - this.camera.position.z) * 0.08;
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();

    if (this.points) {
      this.points.rotation.z += cc22 * 0.02;
    }

    if (this.trailQuad) {
      const mat = this.trailQuad.material as THREE.MeshBasicMaterial;
      mat.opacity = 1.0 - cc21 * 0.97;
    }
  }

  resize(_w: number, _h: number, camera: THREE.PerspectiveCamera): void {
    this.camera = camera;
  }

  dispose(): void {
    this.geometry?.dispose();
    this.material?.dispose();
    (this.trailQuad?.material as THREE.Material)?.dispose();
    this.trailQuad?.geometry?.dispose();
    this.geometry = null;
    this.material = null;
    this.points = null;
    this.trailQuad = null;
    this.camera = null;
    this.prevNormLandmarks.clear();
    this._anchorScratch.length = 0;
  }

  // ---- Anchor resolution ----------------------------------------------------

  /** For each active performer with current keypoints, compute world-space
   *  anchor positions + per-anchor velocity derived from the previous frame.
   *  Stores prev-frame landmarks for the next call. */
  private resolveAnchors(dt: number): AnchorData[] {
    const tags = getActiveTags();
    const out = this._anchorScratch;
    out.length = 0;

    const invDt = dt > 0 ? 1 / dt : 0;
    const halfW = BASE_halfW * config.particleViewScale;
    const halfH = BASE_halfH * config.particleViewScale;

    for (let pIdx = 0; pIdx < tags.length && pIdx < 2; pIdx++) {
      const tag = tags[pIdx];
      const lm = getKeypointsSmoothed(tag);
      if (!lm) continue;

      const prev = this.prevNormLandmarks.get(tag);
      const positions: THREE.Vector3[] = [];
      const velocities: THREE.Vector3[] = [];

      for (const idx of ANCHOR_INDICES) {
        const l = lm[idx];
        if (!l) {
          positions.push(new THREE.Vector3());
          velocities.push(new THREE.Vector3());
          continue;
        }
        // MediaPipe: x is mirrored, y is top-down. Flip both into world space.
        const worldX = (0.5 - l.x) * 2 * halfW;
        const worldY = (0.5 - l.y) * 2 * halfH;
        positions.push(new THREE.Vector3(worldX, worldY, 0));

        if (prev && prev[idx]) {
          const dxN = l.x - prev[idx].x;
          const dyN = l.y - prev[idx].y;
          const vWorldX = -dxN * 2 * halfW * invDt;
          const vWorldY = -dyN * 2 * halfH * invDt;
          velocities.push(new THREE.Vector3(vWorldX, vWorldY, 0));
        } else {
          velocities.push(new THREE.Vector3());
        }
      }

      // Body centroid: midpoint of shoulders (indices 1 and 2 in anchor list).
      const centroid = positions[1].clone().add(positions[2]).multiplyScalar(0.5);

      out.push({ tag, performerIdx: pIdx, positions, velocities, centroid });

      // Snapshot this frame's normalised landmarks for next tick.
      this.prevNormLandmarks.set(tag, lm.map(l => ({ x: l.x, y: l.y })));
    }

    // Drop stale entries for performers who are no longer active.
    for (const tag of this.prevNormLandmarks.keys()) {
      if (!tags.includes(tag)) this.prevNormLandmarks.delete(tag);
    }

    return out;
  }

  // ---- Particle spawn helpers ----------------------------------------------

  /** Spawn particle i at a performer anchor, inheriting keypoint velocity. */
  private spawnAtAnchor(i: number, a: AnchorData, burst: boolean): void {
    const i3 = i * 3;
    const anchorIdx = (Math.random() * a.positions.length) | 0;
    const pos = a.positions[anchorIdx];
    const vel = a.velocities[anchorIdx];

    // Position: anchor + small random offset (offset from scene centroid,
    // because points.position is lerped to the scene centroid each tick).
    const spread = burst ? 0.8 : 1.4;
    this.positions[i3]     = (pos.x - a.centroid.x) + (Math.random() - 0.5) * spread;
    this.positions[i3 + 1] = (pos.y - a.centroid.y) + (Math.random() - 0.5) * spread;
    this.positions[i3 + 2] = (Math.random() - 0.5) * spread;

    // Velocity: inherit keypoint motion + outward kick.
    const kick = burst ? 14 : 3;
    const kTheta = Math.random() * Math.PI * 2;
    const kPhi = Math.acos(2 * Math.random() - 1);
    const kx = Math.sin(kPhi) * Math.cos(kTheta) * kick * (0.5 + Math.random());
    const ky = Math.sin(kPhi) * Math.sin(kTheta) * kick * (0.5 + Math.random());
    const kz = Math.cos(kPhi) * kick * (0.5 + Math.random());

    this.velocities[i3]     = vel.x * config.particleVelScale + kx;
    this.velocities[i3 + 1] = vel.y * config.particleVelScale + ky;
    this.velocities[i3 + 2] = kz;

    this.performerAttr[i] = a.performerIdx;
    this.lives[i] = burst ? 0.6 + Math.random() * 1.0 : 2 + Math.random() * 4;
  }

  /** Fallback: spawn on a sphere around the scene origin with slow drift. */
  private spawnFree(i: number, radius: number): void {
    const i3 = i * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = radius * (0.3 + Math.random() * 0.7);
    this.positions[i3]     = r * Math.sin(phi) * Math.cos(theta);
    this.positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    this.positions[i3 + 2] = r * Math.cos(phi);

    this.velocities[i3]     = (Math.random() - 0.5) * 2;
    this.velocities[i3 + 1] = (Math.random() - 0.5) * 2;
    this.velocities[i3 + 2] = (Math.random() - 0.5) * 2;

    this.performerAttr[i] = -1;
    this.lives[i] = 2 + Math.random() * 4;
  }

  /** Fallback burst: no pose data, tight cluster + outward velocity. */
  private spawnBurstFree(i: number): void {
    const i3 = i * 3;
    this.positions[i3]     = (Math.random() - 0.5) * 2;
    this.positions[i3 + 1] = (Math.random() - 0.5) * 2;
    this.positions[i3 + 2] = (Math.random() - 0.5) * 2;

    const speed = 8 + Math.random() * 12;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    this.velocities[i3]     = speed * Math.sin(phi) * Math.cos(theta);
    this.velocities[i3 + 1] = speed * Math.sin(phi) * Math.sin(theta);
    this.velocities[i3 + 2] = speed * Math.cos(phi);

    this.performerAttr[i] = -1;
    this.lives[i] = 0.5 + Math.random() * 1.0;
  }
}
