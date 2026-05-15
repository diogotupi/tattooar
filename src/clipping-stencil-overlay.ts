import * as THREE from "three";

/** Baseado em [webgl_clipping_stencil](https://threejs.org/examples/#webgl_clipping_stencil). */
function createPlaneStencilGroup(
  geometry: THREE.BufferGeometry,
  plane: THREE.Plane,
  renderOrder: number,
): THREE.Group {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshBasicMaterial();
  baseMat.depthWrite = false;
  baseMat.depthTest = false;
  baseMat.colorWrite = false;
  baseMat.stencilWrite = true;
  baseMat.stencilFunc = THREE.AlwaysStencilFunc;

  const mat0 = baseMat.clone();
  mat0.side = THREE.BackSide;
  mat0.clippingPlanes = [plane];
  mat0.stencilFail = THREE.IncrementWrapStencilOp;
  mat0.stencilZFail = THREE.IncrementWrapStencilOp;
  mat0.stencilZPass = THREE.IncrementWrapStencilOp;

  const mesh0 = new THREE.Mesh(geometry, mat0);
  mesh0.renderOrder = renderOrder;
  group.add(mesh0);

  const mat1 = baseMat.clone();
  mat1.side = THREE.FrontSide;
  mat1.clippingPlanes = [plane];
  mat1.stencilFail = THREE.DecrementWrapStencilOp;
  mat1.stencilZFail = THREE.DecrementWrapStencilOp;
  mat1.stencilZPass = THREE.DecrementWrapStencilOp;

  const mesh1 = new THREE.Mesh(geometry, mat1);
  mesh1.renderOrder = renderOrder;
  group.add(mesh1);

  return group;
}

export type ClippingStencilOverlay = {
  root: THREE.Group;
  update: (delta: number) => void;
  dispose: () => void;
};

/**
 * Torus knot com planos de corte animados, centrado no marcador Mind AR (largura ≈ 1).
 */
export function createClippingStencilOverlay(): ClippingStencilOverlay {
  const root = new THREE.Group();
  root.frustumCulled = false;

  const fitScale = 0.72;
  root.scale.setScalar(fitScale);

  const ambient = new THREE.AmbientLight(0xffffff, 1.4);
  const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
  dirLight.position.set(2, 3, 2);
  root.add(ambient, dirLight);

  const object = new THREE.Group();
  root.add(object);

  const planes = [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), 0),
  ];

  const geometry = new THREE.TorusKnotGeometry(0.4, 0.15, 220, 60);
  const planeGeom = new THREE.PlaneGeometry(1.2, 1.2);
  const planeObjects: THREE.Mesh[] = [];
  const disposables: THREE.Material[] = [];

  for (let i = 0; i < 3; i++) {
    const poGroup = new THREE.Group();
    const plane = planes[i];
    const stencilGroup = createPlaneStencilGroup(geometry, plane, i + 1);
    object.add(stencilGroup);

    const planeMat = new THREE.MeshStandardMaterial({
      color: 0xe91e63,
      metalness: 0.1,
      roughness: 0.75,
      clippingPlanes: planes.filter((p) => p !== plane),
      stencilWrite: true,
      stencilRef: 0,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.ReplaceStencilOp,
      stencilZFail: THREE.ReplaceStencilOp,
      stencilZPass: THREE.ReplaceStencilOp,
    });
    disposables.push(planeMat);

    const po = new THREE.Mesh(planeGeom, planeMat);
    po.onAfterRender = (renderer) => {
      renderer.clearStencil();
    };
    po.renderOrder = i + 1.1;
    po.frustumCulled = false;

    poGroup.add(po);
    planeObjects.push(po);
    object.add(poGroup);
  }

  const material = new THREE.MeshStandardMaterial({
    color: 0xffc107,
    metalness: 0.1,
    roughness: 0.75,
    clippingPlanes: planes,
    clipShadows: true,
    shadowSide: THREE.DoubleSide,
  });
  disposables.push(material);

  const clippedColorFront = new THREE.Mesh(geometry, material);
  clippedColorFront.castShadow = false;
  clippedColorFront.renderOrder = 6;
  clippedColorFront.frustumCulled = false;
  object.add(clippedColorFront);

  root.position.z = 0.06;

  const update = (delta: number) => {
    object.rotation.x += delta * 0.5;
    object.rotation.y += delta * 0.2;

    for (let i = 0; i < planeObjects.length; i++) {
      const plane = planes[i];
      const po = planeObjects[i];
      plane.coplanarPoint(po.position);
      po.lookAt(
        po.position.x - plane.normal.x,
        po.position.y - plane.normal.y,
        po.position.z - plane.normal.z,
      );
    }
  };

  const dispose = () => {
    geometry.dispose();
    planeGeom.dispose();
    for (const m of disposables) {
      m.dispose();
    }
  };

  return { root, update, dispose };
}

/** Mind AR cria o renderer sem stencil; recria com `stencil: true` no mesmo canvas. */
export function enableRendererStencilClipping(renderer: THREE.WebGLRenderer): THREE.WebGLRenderer {
  const gl = renderer.getContext();
  const attrs = gl.getContextAttributes();
  if (attrs?.stencil) {
    renderer.localClippingEnabled = true;
    return renderer;
  }

  const canvas = renderer.domElement;
  const size = renderer.getSize(new THREE.Vector2());
  const dpr = renderer.getPixelRatio();
  const encoding = renderer.outputEncoding;

  renderer.dispose();

  const next = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    stencil: true,
  });
  next.setPixelRatio(dpr);
  next.setSize(size.x, size.y);
  next.outputEncoding = encoding;
  next.localClippingEnabled = true;
  return next;
}
