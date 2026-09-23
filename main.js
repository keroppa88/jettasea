import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createPlaceholderBoat } from './boat.js';
import { createClouds } from './clouds.js';

const container = document.querySelector('#scene');
const error = document.querySelector('#error');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch (e) {
  error.hidden = false;
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#293e48');
const camera = new THREE.PerspectiveCamera(52, 1, 0.08, 2400);
const initialPosition = new THREE.Vector3(0, 6.8, 19);
camera.position.copy(initialPosition);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.1, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 7;
controls.maxDistance = 90;
controls.minPolarAngle = 0.07;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.enablePan = false;
controls.update();

const uniforms = {
  uTime: { value: 0 },
  uPalette: { value: 0 },
  uCamera: { value: camera.position },
  uOceanOffset: { value: new THREE.Vector2() },
  uBoatPos: { value: new THREE.Vector2() },
  uForward: { value: new THREE.Vector2(0, -1) },
  uSpeed: { value: 0 },
};

const sharedWaves = /* glsl */ `
  uniform vec2 uBoatPos;
  uniform vec2 uForward;
  uniform float uSpeed;
  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + 1.0), f.x), f.y);
  }
  float surface(vec2 p, float t) {
    float bend = (noise2(p * 0.13 + vec2(t * 0.04, 0.0)) - 0.5) * 1.5;
    p.x += bend;
    float h = 0.0;
    h += 0.43 * sin(p.y * 0.54 + p.x * 0.17 + t * 0.48);
    h += 0.29 * sin(p.y * 0.81 - p.x * 0.37 - t * 0.72);
    h += 0.19 * sin(p.y * 1.48 + p.x * 0.41 + t * 0.92);
    h += 0.10 * sin(p.y * 3.1 - p.x * 1.6 - t * 1.52);
    h += 0.04 * sin(p.x * 5.4 + p.y * 4.5 + t * 2.3);
    vec2 rel = vec2(p.x, -p.y) - uBoatPos;
    float aft = -dot(rel, uForward);
    float side = dot(rel, vec2(-uForward.y, uForward.x));
    float spread = 2.0 + max(aft, 0.0) * 0.20;
    float wake = smoothstep(0.0, 2.0, aft) * (1.0 - smoothstep(15.0, 90.0, aft)) * exp(-side * side / (spread * spread));
    h += uSpeed * wake * 0.14 * sin(aft * 3.8 - t * 8.0);
    return h;
  }
`;

const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: /* glsl */ `
    uniform float uTime;
    uniform vec2 uOceanOffset;
    varying vec3 vWorld;
    ${sharedWaves}
    void main() {
      vec2 waveP = position.xy + uOceanOffset;
      vec3 p = vec3(position.x, surface(waveP, uTime), -position.y);
      vec4 world = modelMatrix * vec4(p, 1.0);
      vWorld = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform float uTime;
    uniform float uPalette;
    uniform vec3 uCamera;
    varying vec3 vWorld;
    ${sharedWaves}
    void main() {
      vec2 p = vec2(vWorld.x, -vWorld.z);
      float e = 0.045;
      float slopeX = (surface(p + vec2(e, 0.0), uTime) - surface(p - vec2(e, 0.0), uTime)) / (2.0 * e);
      float slopeZ = (surface(p - vec2(0.0, e), uTime) - surface(p + vec2(0.0, e), uTime)) / (2.0 * e);
      vec3 n = normalize(vec3(-slopeX, 1.0, -slopeZ));
      vec3 viewDir = normalize(uCamera - vWorld);
      vec3 lightDir = normalize(vec3(-0.42, 0.67, 0.63));

      float broad = noise2(p * 0.27 + vec2(uTime * 0.035, 0.0));
      float detail = noise2(p * 1.65 + vec2(uTime * 0.1));
      float summer = step(3.5, uPalette);
      float ink = smoothstep(mix(0.39, 0.26, summer), mix(0.76, 0.66, summer), broad * 0.6 + detail * 0.4 + 0.16 * n.x);
      vec3 shadow = mix(vec3(0.016, 0.035, 0.046), vec3(0.085, 0.145, 0.162), ink);
      vec3 warmShadow = mix(vec3(0.068, 0.073, 0.070), vec3(0.25, 0.263, 0.224), ink);
      vec3 base = shadow;
      if (uPalette > 3.5) base = mix(vec3(0.018, 0.27, 0.49), vec3(0.075, 0.62, 0.88), ink);
      else if (uPalette > 2.5) base = mix(vec3(0.083, 0.035, 0.055), vec3(0.35, 0.16, 0.15), ink);
      else if (uPalette > 1.5) base = mix(vec3(0.009, 0.018, 0.052), vec3(0.052, 0.095, 0.23), ink);
      else if (uPalette > 0.5) base = warmShadow;

      // The glints come from the moving surface normal, then break into short brush marks.
      float reflection = max(dot(reflect(-lightDir, n), viewDir), 0.0);
      float specular = pow(reflection, mix(26.0, 13.0, summer));
      float streak = noise2(p * vec2(0.47, 3.4) + vec2(0.0, uTime * 0.17));
      float gaps = smoothstep(0.34, 0.68, streak);
      float flash = pow(reflection, 62.0) * smoothstep(0.38, 0.73, detail);
      float glint = clamp(specular * (0.5 + 1.65 * gaps) * mix(1.0, 1.55, summer) + flash * 1.6, 0.0, 1.0);
      float facing = pow(1.0 - max(dot(n, viewDir), 0.0), 2.0);
      vec3 sky = vec3(0.43, 0.57, 0.61);
      if (uPalette > 3.5) sky = vec3(0.35, 0.78, 0.98);
      else if (uPalette > 2.5) sky = vec3(0.88, 0.46, 0.34);
      else if (uPalette > 1.5) sky = vec3(0.27, 0.39, 0.63);
      else if (uPalette > 0.5) sky = vec3(0.73, 0.70, 0.56);
      base = mix(base, sky, facing * mix(0.42, 0.55, summer));
      vec3 white = vec3(0.92, 0.96, 0.93);
      if (uPalette > 3.5) white = vec3(0.98, 1.0, 1.0);
      else if (uPalette > 2.5) white = vec3(1.0, 0.79, 0.56);
      else if (uPalette > 1.5) white = vec3(0.80, 0.88, 1.0);
      else if (uPalette > 0.5) white = vec3(1.0, 0.96, 0.80);
      base = mix(base, white, glint * 0.94);

      vec2 rel = vWorld.xz - uBoatPos;
      float aft = -dot(rel, uForward);
      float side = dot(rel, vec2(-uForward.y, uForward.x));
      float wakeWidth = 0.9 + max(aft, 0.0) * 0.18;
      float churn = smoothstep(-3.5, 2.5, aft) * (1.0 - smoothstep(12.0, 55.0, aft));
      float spread = exp(-side * side / (wakeWidth * wakeWidth));
      float froth = smoothstep(0.38, 0.76, noise2(p * 4.7 + vec2(uTime * 1.1, 0.0)));
      float foam = uSpeed * churn * spread * (0.25 + froth * 0.75);
      float bow = exp(-pow(length(rel - uForward * 3.7) / 2.2, 2.0)) * uSpeed * froth;
      base = mix(base, white, clamp(foam * 0.9 + bow * 0.65, 0.0, 0.9));

      // Distance haze softens the far water without turning it into a flat image.
      float distanceToEye = length(uCamera - vWorld);
      float haze = smoothstep(90.0, 1200.0, distanceToEye) * 0.96;
      vec3 horizon = vec3(0.22, 0.34, 0.43);
      if (uPalette > 3.5) horizon = vec3(0.13, 0.48, 0.78);
      else if (uPalette > 2.5) horizon = vec3(0.60, 0.33, 0.34);
      else if (uPalette > 1.5) horizon = vec3(0.16, 0.24, 0.39);
      else if (uPalette > 0.5) horizon = vec3(0.43, 0.43, 0.44);
      gl_FragColor = vec4(mix(base, horizon, haze), 1.0);
    }
  `,
});

// Dense rings near the boat, wider rings toward the horizon.
function makeOceanGeometry() {
  const positions = [0, 0, 0], indices = [];
  const sides = 192, rings = 76;
  for (let j = 0; j < rings; j++) {
    const r = 0.4 * Math.pow(1.12, j);
    for (let i = 0; i < sides; i++) {
      const a = i * Math.PI * 2 / sides;
      positions.push(Math.cos(a) * r, Math.sin(a) * r, 0);
    }
  }
  for (let i = 0; i < sides; i++) indices.push(0, 1 + i, 1 + (i + 1) % sides);
  for (let j = 0; j < rings - 1; j++) {
    const inner = 1 + j * sides, outer = inner + sides;
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      indices.push(inner + i, outer + i, outer + next, inner + i, outer + next, inner + next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}
const water = new THREE.Mesh(makeOceanGeometry(), material);
water.frustumCulled = false;
scene.add(water);

const sky = new THREE.Mesh(new THREE.SphereGeometry(1600, 48, 24), new THREE.ShaderMaterial({
  uniforms: { uPalette: uniforms.uPalette, uTime: uniforms.uTime },
  side: THREE.BackSide,
  depthWrite: false,
  depthTest: false,
  vertexShader: `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    precision highp float;
    uniform float uPalette;
    uniform float uTime;
    varying vec3 vDir;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x),
                 mix(hash(i + vec2(0., 1.)), hash(i + 1.), f.x), f.y);
    }
    void main() {
      vec3 d = normalize(vDir);
      float alt = max(d.y, 0.0);
      vec3 horizon = vec3(0.22, 0.34, 0.43);
      vec3 zenith = vec3(0.055, 0.085, 0.18);
      if (uPalette > 3.5) { horizon = vec3(0.94, 0.98, 1.0); zenith = vec3(0.06, 0.43, 0.88); }
      else if (uPalette > 2.5) { horizon = vec3(0.60, 0.33, 0.34); zenith = vec3(0.25, 0.12, 0.25); }
      else if (uPalette > 1.5) { horizon = vec3(0.16, 0.24, 0.39); zenith = vec3(0.030, 0.045, 0.13); }
      else if (uPalette > 0.5) { horizon = vec3(0.43, 0.43, 0.44); zenith = vec3(0.19, 0.18, 0.25); }
      // A bright, continuous band of summer haze sits just above the blue sea.
      vec3 color = mix(horizon, zenith, smoothstep(0.0, uPalette > 3.5 ? 0.34 : 0.88, alt));
      gl_FragColor = vec4(color, 1.0);
    }
  `,
}));
sky.renderOrder = -10;
scene.add(sky);
const clouds = createClouds();
scene.add(clouds.mesh);

const ambient = new THREE.HemisphereLight(0xdce9f0, 0x263843, 2.2);
scene.add(ambient);
const sunlight = new THREE.DirectionalLight(0xf6e6c6, 2.2);
sunlight.position.set(-15, 30, 24);
scene.add(sunlight);
const boat = createPlaceholderBoat();
scene.add(boat);

const palettes = document.querySelectorAll('[data-palette]');
palettes.forEach(button => button.addEventListener('click', () => {
  const selected = Number(button.dataset.palette);
  uniforms.uPalette.value = selected;
  const sceneColors = ['#293e48', '#6e6d70', '#202e4e', '#99545a', '#2e85d6'];
  scene.background.set(sceneColors[selected]);
  clouds.setPalette(selected);
  sunlight.color.set(['#f6e6c6', '#f5e5c8', '#b8d4ff', '#ffb57d', '#fff4da'][selected]);
  ambient.color.set(['#dce9f0', '#e8e4d8', '#b6c8ee', '#edb8ab', '#e0f4ff'][selected]);
  palettes.forEach(b => {
    const active = b === button;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
}));

const throttle = document.querySelector('#throttle');
const throttleValue = document.querySelector('#throttle-value');
const speedDisplay = document.querySelector('#speed');
const headingDisplay = document.querySelector('#heading');
const held = new Set();
const state = { x: 0, z: 0, heading: 0, speed: 0, throttle: 0 };
const setThrottle = value => {
  state.throttle = Math.max(0, Math.min(1, value));
  throttle.value = String(Math.round(state.throttle * 100));
  throttleValue.textContent = `${Math.round(state.throttle * 100)}%`;
};
throttle.addEventListener('input', () => setThrottle(Number(throttle.value) / 100));
const keyMap = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
window.addEventListener('keydown', e => {
  const key = keyMap[e.code];
  if (!key || e.altKey || e.ctrlKey || e.metaKey) return;
  if (document.activeElement === throttle && e.code.startsWith('Arrow')) return;
  e.preventDefault();
  held.add(key);
});
window.addEventListener('keyup', e => { if (keyMap[e.code]) held.delete(keyMap[e.code]); });
window.addEventListener('blur', () => held.clear());
for (const side of ['left', 'right']) {
  const button = document.querySelector(`#${side}`);
  button.addEventListener('pointerdown', e => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    held.add(side);
    button.classList.add('pressed');
  });
  const release = () => { held.delete(side); button.classList.remove('pressed'); };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
}
function sampleWave(x, z, t) {
  const y = -z;
  return 0.43 * Math.sin(y * 0.54 + x * 0.17 + t * 0.48)
    + 0.29 * Math.sin(y * 0.81 - x * 0.37 - t * 0.72)
    + 0.19 * Math.sin(y * 1.48 + x * 0.41 + t * 0.92)
    + 0.10 * Math.sin(y * 3.1 - x * 1.6 - t * 1.52);
}
function moveBoat(dt) {
  if (held.has('up')) setThrottle(state.throttle + dt * 0.36);
  if (held.has('down')) setThrottle(state.throttle - dt * 0.47);
  state.speed += (state.throttle * 18 - state.speed) * (1 - Math.exp(-dt * 0.85));
  const steer = Number(held.has('right')) - Number(held.has('left'));
  state.heading += steer * dt * (0.14 + 0.68 * state.speed / 18);
  const forwardX = -Math.sin(state.heading), forwardZ = -Math.cos(state.heading);
  state.x += forwardX * state.speed * dt * 0.5144;
  state.z += forwardZ * state.speed * dt * 0.5144;
  uniforms.uBoatPos.value.set(state.x, state.z);
  uniforms.uForward.value.set(forwardX, forwardZ);
  uniforms.uSpeed.value = state.speed / 18;
  uniforms.uOceanOffset.value.set(state.x, -state.z);
  water.position.set(state.x, 0, state.z);
  sky.position.set(state.x, 0, state.z);
  clouds.mesh.position.set(state.x, 0, state.z);
  clouds.update(dt);

  const t = uniforms.uTime.value;
  const center = sampleWave(state.x, state.z, t);
  const front = sampleWave(state.x + forwardX * 3.0, state.z + forwardZ * 3.0, t);
  const back = sampleWave(state.x - forwardX * 3.0, state.z - forwardZ * 3.0, t);
  const rightX = -forwardZ, rightZ = forwardX;
  const left = sampleWave(state.x - rightX, state.z - rightZ, t);
  const right = sampleWave(state.x + rightX, state.z + rightZ, t);
  const targetPitch = Math.atan2(front - back, 6);
  const targetRoll = Math.atan2(right - left, 2.5);
  const smoothing = 1 - Math.exp(-dt * 3);
  boat.position.set(state.x, THREE.MathUtils.lerp(boat.position.y, center + 0.04, smoothing), state.z);
  boat.rotation.order = 'YXZ';
  boat.rotation.y = state.heading;
  boat.rotation.x = THREE.MathUtils.lerp(boat.rotation.x, targetPitch, smoothing);
  boat.rotation.z = THREE.MathUtils.lerp(boat.rotation.z, targetRoll, smoothing);

  const target = new THREE.Vector3(state.x, boat.position.y + 1.0, state.z);
  const delta = target.sub(controls.target);
  camera.position.add(delta);
  controls.target.add(delta);
  speedDisplay.textContent = state.speed.toFixed(1).padStart(4, '0');
  headingDisplay.textContent = String(((Math.round(THREE.MathUtils.radToDeg(state.heading)) % 360) + 360) % 360).padStart(3, '0');
}
document.querySelector('#reset').addEventListener('click', () => {
  const x = -Math.sin(state.heading), z = -Math.cos(state.heading);
  camera.position.set(state.x - x * 19, boat.position.y + 6.8, state.z - z * 19);
  controls.target.set(state.x, boat.position.y + 1.0, state.z);
  controls.update();
});

function resize() {
  const { clientWidth: width, clientHeight: height } = container;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
window.addEventListener('resize', resize);
resize();
let previous = 0;
function frame(now) {
  const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
  previous = now;
  uniforms.uTime.value += dt;
  moveBoat(dt);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
