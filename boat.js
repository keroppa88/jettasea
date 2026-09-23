import * as THREE from 'three';

// Deliberately self-contained: replace this group with a VOX model later.
export function createPlaceholderBoat() {
  const boat = new THREE.Group();
  const hullWhite = new THREE.MeshStandardMaterial({ color: 0xb4bec1, roughness: 0.83, flatShading: true });
  const hullDark = new THREE.MeshStandardMaterial({ color: 0x364952, roughness: 0.9, flatShading: true });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x6b7570, roughness: 0.95 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a3039, roughness: 0.35, metalness: 0.15 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x6e7776, roughness: 0.7 });

  const sections = [
    { z: -4.6, w: 0.06, y: 0.75 }, { z: -3.4, w: 1.12, y: 0.82 },
    { z: -1.2, w: 1.5, y: 0.76 }, { z: 2.7, w: 1.34, y: 0.71 },
    { z: 4.1, w: 0.85, y: 0.65 },
  ];
  const makeHull = (bottom, material) => {
    const verts = [], indices = [];
    sections.forEach(s => {
      verts.push(-s.w, bottom ? -0.5 : s.y, s.z, s.w, bottom ? -0.5 : s.y, s.z);
    });
    for (let i = 0; i < sections.length - 1; i++) {
      const a = i * 2, b = a + 2;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.material.side = THREE.DoubleSide;
    boat.add(mesh);
  };
  makeHull(false, deckMat);
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i], b = sections[i + 1];
    for (const sign of [-1, 1]) {
      const verts = [sign * a.w, a.y, a.z, sign * b.w, b.y, b.z,
        sign * a.w * 0.43, -0.55, a.z, sign * b.w * 0.43, -0.55, b.z];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex([0, 2, 1, 1, 2, 3]);
      geo.computeVertexNormals();
      boat.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xb7b9b0, side: THREE.DoubleSide, roughness: 0.86, flatShading: true })));
    }
  }
  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 6.9), hullDark);
  keel.position.set(0, -0.54, 0.15);
  boat.add(keel);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.4, 2.2), hullWhite);
  cabin.position.set(0, 1.45, 1.5);
  boat.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 2.55), hullDark);
  roof.position.set(0, 2.22, 1.5);
  boat.add(roof);
  const frontWindow = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.56, 0.03), glass);
  frontWindow.position.set(0, 1.75, 0.38);
  boat.add(frontWindow);
  for (const side of [-1, 1]) {
    const window = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.58, 1.13), glass);
    window.position.set(side * 1.066, 1.76, 1.35);
    boat.add(window);
  }
  const rod = (from, to, radius = 0.025, material = metal) => {
    const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to);
    const obj = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, start.distanceTo(end), 6), material);
    obj.position.copy(start).add(end).multiplyScalar(0.5);
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
    boat.add(obj);
  };
  rod([0, 0.8, -2.9], [0, 5.4, -2.7], 0.04);
  rod([0, 2.2, 2.0], [0, 6.4, 2.1], 0.045);
  rod([-1.3, 0.8, -2.5], [0, 5.3, -2.7], 0.012);
  rod([1.3, 0.8, -2.5], [0, 5.3, -2.7], 0.012);
  rod([-1.15, 0.8, 3.4], [0, 6.3, 2.1], 0.012);
  rod([1.15, 0.8, 3.4], [0, 6.3, 2.1], 0.012);
  rod([-2.9, 2.2, 0.7], [2.9, 2.2, 0.7], 0.035);
  rod([-2.9, 2.2, 0.7], [-1.4, 0.73, -1.0], 0.014);
  rod([2.9, 2.2, 0.7], [1.4, 0.73, -1.0], 0.014);
  return boat;
}
