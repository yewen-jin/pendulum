import * as THREE from 'three';
import { get, pulse } from '../../bus';
import type { ThreeScene } from './types';

const PARTICLE_COUNT = 3000;
const SPAWN_RADIUS = 20;

// ---- Shaders ----------------------------------------------------------------

const vertexShader = /* glsl */ `
  attribute float aLife;
  attribute float aSeed;
  uniform float uPointScale;
  uniform float uBrightness;
  varying float vLife;
  varying float vSeed;

  void main() {
    vLife = aLife;
    vSeed = aSeed;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPos;
    // Size attenuates with distance, scales with life and uniform
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
    // Circular point with soft edge
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float alpha = smoothstep(1.0, 0.3, d) * vLife;

    // Color: warm embers (low centroid) -> cool sparks (high centroid)
    vec3 warm = vec3(1.0, 0.4, 0.1);
    vec3 cool = vec3(0.7, 0.85, 1.0);
    vec3 col = mix(warm, cool, uCentroid + vSeed * 0.15);
    col = hueRotate(col, uHueShift * 6.28);
    col *= uBrightness;

    gl_FragColor = vec4(col, alpha);
  }
`;

// ---- Scene ------------------------------------------------------------------

export class ParticleDebrisScene implements ThreeScene {
  readonly name = 'debrisField';

  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private points: THREE.Points | null = null;
  private trailQuad: THREE.Mesh | null = null;

  // Typed arrays for CPU-side particle state
  private positions!: Float32Array;
  private velocities!: Float32Array;
  private lives!: Float32Array;
  private seeds!: Float32Array;

  private camera: THREE.PerspectiveCamera | null = null;
  private baseFov = 65;

  setup(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.camera = camera;
    camera.position.set(0, 0, 30);
    camera.lookAt(0, 0, 0);
    camera.fov = this.baseFov;
    camera.updateProjectionMatrix();

    scene.fog = new THREE.FogExp2(0x000000, 0.012);

    // Allocate buffers
    this.positions = new Float32Array(PARTICLE_COUNT * 3);
    this.velocities = new Float32Array(PARTICLE_COUNT * 3);
    this.lives = new Float32Array(PARTICLE_COUNT);
    this.seeds = new Float32Array(PARTICLE_COUNT);

    // Stagger initial lifetimes so particles don't all pop in at once
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.seeds[i] = Math.random();
      this.lives[i] = Math.random() * 4; // random starting life
      this.spawnParticle(i, SPAWN_RADIUS);
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(this.lives, 1));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, 1));

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
    // Clamp dt to avoid huge jumps on tab-switch
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

    // ---- Derived values ----
    const velocityMult = (0.3 + motion * 2.0 + cc19 * 1.5) * (1 + rms * 3) * (0.5 + intensity);
    const spawnRadius = SPAWN_RADIUS * (1 + expansive * 1.5 - compact * 0.5 + rms * 0.5);
    const wind = (leftReach - rightReach) * 2.0;
    const lift = elevated * 3.0;
    const turbulence = cc20 * 4.0;
    const densityRatio = 0.3 + cc16 * 0.5 + phoneY * 0.2;

    // ---- Update particles ----
    const now = performance.now() * 0.001;
    let burstCount = 0;
    const burstActive = onset > 0.3;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      this.lives[i] -= dt * (0.3 + rms * 0.2);

      // Density gating: if particle is beyond the density ratio, accelerate death
      if (i / PARTICLE_COUNT > densityRatio) {
        this.lives[i] -= dt * 2.0;
      }

      if (this.lives[i] <= 0) {
        // Burst: respawn with high velocity from a tight origin
        if (burstActive && burstCount < 300) {
          this.spawnBurst(i);
          burstCount++;
        } else {
          this.spawnParticle(i, spawnRadius);
        }
        continue;
      }

      // Read current velocity
      let vx = this.velocities[i3];
      let vy = this.velocities[i3 + 1];
      let vz = this.velocities[i3 + 2];

      // Apply forces
      vx += wind * dt;
      vy += lift * dt;

      // Compact: pull toward center
      if (compact > 0.01) {
        const px = this.positions[i3];
        const py = this.positions[i3 + 1];
        const pz = this.positions[i3 + 2];
        const pull = compact * 2.0 * dt;
        vx -= px * pull;
        vy -= py * pull;
        vz -= pz * pull;
      }

      // Expansive: push outward
      if (expansive > 0.01) {
        const px = this.positions[i3];
        const py = this.positions[i3 + 1];
        const pz = this.positions[i3 + 2];
        const dist = Math.sqrt(px * px + py * py + pz * pz) || 1;
        const push = expansive * 3.0 * dt / dist;
        vx += px * push;
        vy += py * push;
        vz += pz * push;
      }

      // Turbulence: pseudo-noise displacement
      if (turbulence > 0.01) {
        const seed = this.seeds[i];
        const t = now * 2.0 + seed * 100;
        vx += Math.sin(t * 1.3 + seed * 7.0) * turbulence * dt;
        vy += Math.cos(t * 0.9 + seed * 13.0) * turbulence * dt;
        vz += Math.sin(t * 1.1 + seed * 23.0) * turbulence * dt;
      }

      // Glitch: random large offset
      if (cc24 > 0.01 && Math.random() < cc24 * 0.1 * dt) {
        vx += (Math.random() - 0.5) * cc24 * 40;
        vy += (Math.random() - 0.5) * cc24 * 40;
      }

      // Damping
      const damp = 0.97;
      vx *= damp;
      vy *= damp;
      vz *= damp;

      // Store velocity
      this.velocities[i3] = vx;
      this.velocities[i3 + 1] = vy;
      this.velocities[i3 + 2] = vz;

      // Update position
      this.positions[i3] += vx * dt * velocityMult;
      this.positions[i3 + 1] += vy * dt * velocityMult;
      this.positions[i3 + 2] += vz * dt * velocityMult;
    }

    // Mark buffers for upload
    this.geometry.attributes.position.needsUpdate = true;
    (this.geometry.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;

    // ---- Update uniforms ----
    const u = this.material.uniforms;
    u.uCentroid.value = centroid + (phoneX - 0.5) * 0.4;
    u.uHueShift.value = cc17;
    u.uBrightness.value = 0.6 + cc25 * 0.8 + elevated * 0.4 + rms * 0.3;
    u.uPointScale.value = 1.0 - compact * 0.3 + expansive * 0.4;

    // ---- Camera ----
    // FOV: openness widens, compact tightens
    const targetFov = this.baseFov + openness * 20 - compact * 10;
    this.camera.fov += (targetFov - this.camera.fov) * 0.05;
    // Zoom: cc23 pulls camera in/out
    const targetZ = 30 - cc23 * 20;
    this.camera.position.z += (targetZ - this.camera.position.z) * 0.05;
    this.camera.updateProjectionMatrix();

    // Rotation: cc22 rotates the particle system
    if (this.points) {
      this.points.rotation.z += cc22 * 0.02;
    }

    // Trail effect: cc21 controls how much of the previous frame persists
    if (this.trailQuad) {
      const mat = this.trailQuad.material as THREE.MeshBasicMaterial;
      // At cc21=0, fully clear (opacity 1.0). At cc21=1, heavy trails (opacity 0.03)
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
  }

  // ---- Particle helpers ----

  private spawnParticle(i: number, radius: number): void {
    const i3 = i * 3;
    // Random position on a sphere
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = radius * (0.3 + Math.random() * 0.7);
    this.positions[i3] = r * Math.sin(phi) * Math.cos(theta);
    this.positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    this.positions[i3 + 2] = r * Math.cos(phi);

    // Slow random drift velocity
    this.velocities[i3] = (Math.random() - 0.5) * 2;
    this.velocities[i3 + 1] = (Math.random() - 0.5) * 2;
    this.velocities[i3 + 2] = (Math.random() - 0.5) * 2;

    this.lives[i] = 2 + Math.random() * 4;
  }

  private spawnBurst(i: number): void {
    const i3 = i * 3;
    // Tight cluster near origin
    this.positions[i3] = (Math.random() - 0.5) * 2;
    this.positions[i3 + 1] = (Math.random() - 0.5) * 2;
    this.positions[i3 + 2] = (Math.random() - 0.5) * 2;

    // High outward velocity
    const speed = 8 + Math.random() * 12;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    this.velocities[i3] = speed * Math.sin(phi) * Math.cos(theta);
    this.velocities[i3 + 1] = speed * Math.sin(phi) * Math.sin(theta);
    this.velocities[i3 + 2] = speed * Math.cos(phi);

    this.lives[i] = 0.5 + Math.random() * 1.0; // short-lived burst
  }
}
