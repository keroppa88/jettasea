import * as THREE from 'three';

// Camera-following line rain, adapted from car2026/js/main.js's weather rain.
export function createRain() {
  const maxDrops = 2700;
  const spread = 58;
  const positions = new Float32Array(maxDrops * 6);
  function writeDrop(i, x, y, z, length) {
    const offset = i * 6;
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
    positions[offset + 3] = x - length * 0.14;
    positions[offset + 4] = y - length;
    positions[offset + 5] = z + length * 0.19;
  }
  for (let i = 0; i < maxDrops; i++) {
    writeDrop(i, (Math.random() - 0.5) * spread, Math.random() * 44 - 8,
      (Math.random() - 0.5) * spread, 0.85);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);
  const material = new THREE.LineBasicMaterial({
    color: 0xc9dce7, transparent: true, opacity: 0.67, depthWrite: false,
  });
  const mesh = new THREE.LineSegments(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  let count = 0;
  let fallSpeed = 0;
  let dropLength = 0.85;

  function setLevel(level) {
    count = level === 4 ? 900 : level === 5 ? maxDrops : 0;
    fallSpeed = level === 5 ? 39 : 27;
    dropLength = level === 5 ? 1.35 : 0.85;
    material.opacity = level === 5 ? 0.78 : 0.56;
    mesh.visible = count > 0;
    geometry.setDrawRange(0, count * 2);
  }
  function update(dt, camera) {
    if (!count) return;
    for (let i = 0; i < count; i++) {
      const offset = i * 6;
      let y = positions[offset + 1] - fallSpeed * dt;
      let x = positions[offset] - dt * (count === maxDrops ? 4.5 : 2.2);
      const z = positions[offset + 2];
      if (y < -9 || x < -spread / 2) {
        y = 33 + Math.random() * 11;
        x = (Math.random() - 0.5) * spread;
        writeDrop(i, x, y, (Math.random() - 0.5) * spread, dropLength);
      } else {
        writeDrop(i, x, y, z, dropLength);
      }
    }
    geometry.attributes.position.needsUpdate = true;
    mesh.position.copy(camera.position);
  }
  setLevel(3);
  return { mesh, setLevel, update };
}
