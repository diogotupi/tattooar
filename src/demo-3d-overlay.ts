import * as THREE from "three";

export type Demo3DOverlay = {
  root: THREE.Group;
  update: (delta: number) => void;
  dispose: () => void;
};

/**
 * Torre 3D simples + partículas (estilo demos AR do YouTube), centrada no marcador.
 */
export function createDemo3DOverlay(): Demo3DOverlay {
  const root = new THREE.Group();
  root.frustumCulled = false;
  root.scale.setScalar(0.55);
  root.position.z = 0.06;

  const ambient = new THREE.AmbientLight(0xffffff, 1.2);
  const dir = new THREE.DirectionalLight(0xffffff, 1.8);
  dir.position.set(1, 2, 1.5);
  root.add(ambient, dir);

  const tower = new THREE.Group();
  const towerMat = new THREE.MeshStandardMaterial({
    color: 0x2a1448,
    metalness: 0.35,
    roughness: 0.45,
  });
  const disposables: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [towerMat];

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.42), towerMat);
  base.position.y = 0.035;
  disposables.push(base.geometry);
  tower.add(base);

  const legH = 0.55;
  const legGeo = new THREE.BoxGeometry(0.04, legH, 0.04);
  disposables.push(legGeo);
  const offsets = [
    [-0.16, 0.16],
    [0.16, 0.16],
    [-0.16, -0.16],
    [0.16, -0.16],
  ];
  for (const [x, z] of offsets) {
    const leg = new THREE.Mesh(legGeo, towerMat);
    leg.position.set(x * 0.85, 0.07 + legH / 2, z * 0.85);
    leg.rotation.x = z * 0.12;
    leg.rotation.z = -x * 0.12;
    tower.add(leg);
  }

  const top = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.12), towerMat);
  top.position.y = 0.07 + legH + 0.03;
  disposables.push(top.geometry);
  tower.add(top);

  root.add(tower);

  const particleCount = 96;
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const palette = [
    new THREE.Color(0xff6bcb),
    new THREE.Color(0x5ce1e6),
    new THREE.Color(0xb8f55a),
    new THREE.Color(0xffe566),
  ];
  const seeds = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    const r = 0.15 + Math.random() * 0.22;
    const a = Math.random() * Math.PI * 2;
    const y = 0.05 + Math.random() * 0.45;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(a) * r;
    seeds[i * 3] = Math.random() * 10;
    seeds[i * 3 + 1] = Math.random() * 10;
    seeds[i * 3 + 2] = Math.random() * 10;
    const c = palette[i % palette.length];
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const particleMat = new THREE.PointsMaterial({
    size: 0.045,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  materials.push(particleMat);

  const particles = new THREE.Points(particleGeo, particleMat);
  particles.frustumCulled = false;
  root.add(particles);

  let t = 0;

  const update = (delta: number) => {
    t += delta;
    tower.rotation.y += delta * 0.55;

    const posAttr = particleGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < particleCount; i++) {
      const sx = seeds[i * 3];
      const sy = seeds[i * 3 + 1];
      const sz = seeds[i * 3 + 2];
      const baseR = 0.15 + (i % 7) * 0.025;
      const a = t * 0.9 + sx;
      const y = 0.08 + ((i * 0.013) % 0.42) + Math.sin(t * 2 + sy) * 0.06;
      posAttr.setXYZ(
        i,
        Math.cos(a) * baseR + Math.sin(t * 1.7 + sz) * 0.03,
        y,
        Math.sin(a) * baseR + Math.cos(t * 1.5 + sx) * 0.03,
      );
    }
    posAttr.needsUpdate = true;
  };

  const dispose = () => {
    for (const g of disposables) g.dispose();
    particleGeo.dispose();
    for (const m of materials) m.dispose();
  };

  return { root, update, dispose };
}
