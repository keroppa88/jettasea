import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
const camera = new THREE.PerspectiveCamera(52, 1, 0.08, 350);
const initialPosition = new THREE.Vector3(0, 6.2, 17);
camera.position.copy(initialPosition);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 2;
controls.maxDistance = 55;
controls.minPolarAngle = 0.07;
controls.maxPolarAngle = Math.PI / 2 - 0.012;
controls.enablePan = false;
controls.update();

const uniforms = {
  uTime: { value: 0 },
  uPalette: { value: 0 },
  uCamera: { value: camera.position },
};

const sharedWaves = /* glsl */ `
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
    h += 0.23 * sin(p.y * 1.08 + p.x * 0.21 + t * 0.50);
    h += 0.12 * sin(p.y * 2.36 - p.x * 0.48 - t * 0.92);
    h += 0.065 * sin(p.y * 4.83 + p.x * 1.42 + t * 1.43);
    h += 0.031 * sin(p.y * 9.0 - p.x * 2.4 - t * 2.12);
    h += 0.025 * sin(p.x * 3.3 + p.y * 3.9 + t * 0.85);
    return h;
  }
`;

const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying vec3 vWorld;
    ${sharedWaves}
    void main() {
      vec3 p = vec3(position.x, surface(position.xy, uTime), -position.y);
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
      float ink = smoothstep(0.39, 0.76, broad * 0.6 + detail * 0.4 + 0.16 * n.x);
      vec3 shadow = mix(vec3(0.016, 0.035, 0.046), vec3(0.085, 0.145, 0.162), ink);
      vec3 warmShadow = mix(vec3(0.068, 0.073, 0.070), vec3(0.25, 0.263, 0.224), ink);
      vec3 base = mix(shadow, warmShadow, uPalette);

      // The glints come from the moving surface normal, then break into short brush marks.
      float reflection = max(dot(reflect(-lightDir, n), viewDir), 0.0);
      float specular = pow(reflection, 26.0);
      float streak = noise2(p * vec2(0.47, 3.4) + vec2(0.0, uTime * 0.17));
      float gaps = smoothstep(0.34, 0.68, streak);
      float flash = pow(reflection, 62.0) * smoothstep(0.38, 0.73, detail);
      float glint = clamp(specular * (0.5 + 1.65 * gaps) + flash * 1.6, 0.0, 1.0);
      float facing = pow(1.0 - max(dot(n, viewDir), 0.0), 2.0);
      vec3 sky = mix(vec3(0.43, 0.57, 0.61), vec3(0.73, 0.70, 0.56), uPalette);
      base = mix(base, sky, facing * 0.42);
      vec3 white = mix(vec3(0.92, 0.96, 0.93), vec3(1.0, 0.96, 0.80), uPalette);
      base = mix(base, white, glint * 0.94);

      // Distance haze softens the far water without turning it into a flat image.
      float distanceToEye = length(uCamera - vWorld);
      float haze = smoothstep(27.0, 125.0, distanceToEye) * 0.48;
      vec3 horizon = mix(vec3(0.29, 0.41, 0.47), vec3(0.49, 0.49, 0.43), uPalette);
      gl_FragColor = vec4(mix(base, horizon, haze), 1.0);
    }
  `,
});

const geometry = new THREE.PlaneGeometry(240, 240, 280, 280);
const water = new THREE.Mesh(geometry, material);
water.frustumCulled = false;
scene.add(water);

const palettes = document.querySelectorAll('[data-palette]');
palettes.forEach(button => button.addEventListener('click', () => {
  const selected = Number(button.dataset.palette);
  uniforms.uPalette.value = selected;
  scene.background.set(selected ? '#6a6a60' : '#293e48');
  palettes.forEach(b => {
    const active = b === button;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
}));

let playing = true;
const motion = document.querySelector('#motion');
motion.addEventListener('click', () => {
  playing = !playing;
  motion.setAttribute('aria-pressed', String(playing));
  motion.innerHTML = playing ? '波を止める <span aria-hidden="true">Ⅱ</span>' : '波を動かす <span aria-hidden="true">▶</span>';
});
document.querySelector('#reset').addEventListener('click', () => {
  camera.position.copy(initialPosition);
  controls.target.set(0, 0, 0);
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
  if (playing) uniforms.uTime.value += dt;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
