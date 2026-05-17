import * as THREE from "three";
import { AnimationMixer } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MindARThree } from "mind-ar/dist/mindar-image-three.prod.js";
import {
  createClippingStencilOverlay,
  enableRendererStencilClipping,
} from "./clipping-stencil-overlay";
import { createDemo3DOverlay } from "./demo-3d-overlay";
import type { ArBundle, ArEntryMeta, ArBuiltinOverlay } from "./storage";

type VideoPlane = {
  video: HTMLVideoElement;
  texture: THREE.VideoTexture;
  material: THREE.ShaderMaterial;
  geometry: THREE.PlaneGeometry;
  mesh: THREE.Mesh;
};

type RunningAr = {
  mindar: InstanceType<typeof MindARThree>;
  mixers: AnimationMixer[];
  clock: THREE.Clock;
  mindObjectUrl: string;
  cleanupModelUrls: string[];
  wobble: { mesh: THREE.Object3D; baseY: number; phase: number }[];
  videoPlanes: VideoPlane[];
  overlayUpdates: Array<(delta: number) => void>;
  overlayDisposers: Array<() => void>;
};

let current: RunningAr | null = null;

const videoPlaneVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Mistura tipo screen no preto + alpha suave; `object-fit: cover` no plano do marcador. */
const videoPlaneFragmentShader = `
uniform sampler2D vidTex;
uniform float uMarkerAspect;
uniform float uVideoAspect;
uniform float uKeyCutoff;
uniform float uKeyFeather;

varying vec2 vUv;

void main() {
  float ratio = uVideoAspect / uMarkerAspect;
  vec2 uv = vUv;
  if (ratio > 1.0) {
    uv.x = (uv.x - 0.5) / ratio + 0.5;
  } else {
    uv.y = (uv.y - 0.5) * ratio + 0.5;
  }

  if (uv.x < 0.001 || uv.x > 0.999 || uv.y < 0.001 || uv.y > 0.999) {
    discard;
  }

  vec4 texel = texture2D(vidTex, uv);
  float k = max(texel.r, max(texel.g, texel.b));
  float a = smoothstep(uKeyCutoff, uKeyCutoff + uKeyFeather, k);
  gl_FragColor = vec4(texel.rgb * a, a);
}
`;

function disposeRunning(r: RunningAr): void {
  try {
    r.mindar.renderer.setAnimationLoop(null);
  } catch {
    /* ignore */
  }
  try {
    r.mindar.stop();
  } catch {
    /* ignore */
  }
  try {
    r.mindar.renderer.dispose();
  } catch {
    /* ignore */
  }
  URL.revokeObjectURL(r.mindObjectUrl);
  for (const u of r.cleanupModelUrls) {
    URL.revokeObjectURL(u);
  }
  for (const vp of r.videoPlanes) {
    try {
      vp.video.pause();
    } catch {
      /* ignore */
    }
    vp.video.removeAttribute("src");
    vp.video.load();
    vp.texture.dispose();
    vp.material.dispose();
    vp.geometry.dispose();
  }
  for (const dispose of r.overlayDisposers) {
    dispose();
  }
  if (current === r) {
    current = null;
  }
}

function baseHrefFromVite(): string {
  return `${import.meta.env.BASE_URL.replace(/\/?$/, "/")}`;
}

function createBuiltinOverlay(kind: ArBuiltinOverlay): {
  root: THREE.Group;
  update: (delta: number) => void;
  dispose: () => void;
} {
  if (kind === "demo-3d") return createDemo3DOverlay();
  return createClippingStencilOverlay();
}

async function createVideoPlane(
  entry: ArEntryMeta & { glb: ArrayBuffer },
  baseHref: string,
): Promise<VideoPlane> {
  if (!entry.videoSrc) {
    throw new Error("videoSrc em falta.");
  }

  const video = document.createElement("video");
  video.src = `${baseHref}${entry.videoSrc}`;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Vídeo inválido ou inacessível."));
  });

  video.pause();

  const texture = new THREE.VideoTexture(video);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const videoAspect = vw / vh;
  const markerAspect =
    typeof entry.targetAspect === "number" && Number.isFinite(entry.targetAspect) && entry.targetAspect > 0
      ? entry.targetAspect
      : videoAspect;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      vidTex: { value: texture },
      uMarkerAspect: { value: markerAspect },
      uVideoAspect: { value: videoAspect },
      uKeyCutoff: { value: 0.032 },
      uKeyFeather: { value: 0.07 },
    },
    vertexShader: videoPlaneVertexShader,
    fragmentShader: videoPlaneFragmentShader,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    premultipliedAlpha: true,
  });

  const planeW = 1;
  const planeH = 1 / markerAspect;
  const geometry = new THREE.PlaneGeometry(planeW, planeH);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.position.z = 0.08;

  return { video, texture, material, geometry, mesh };
}

export async function startArSession(
  container: HTMLElement,
  bundle: ArBundle,
  onStatus: (text: string) => void,
): Promise<{ stop: () => void }> {
  if (current) {
    disposeRunning(current);
  }

  const mindBlob = new Blob([bundle.mind], { type: "application/octet-stream" });
  let mindObjectUrl: string | null = URL.createObjectURL(mindBlob);

  try {
    const mindar = new MindARThree({
      container,
      imageTargetSrc: mindObjectUrl,
      uiLoading: "no",
      uiScanning: "no",
      uiError: "no",
    });

    const mixers: AnimationMixer[] = [];
    const cleanupModelUrls: string[] = [];
    const clock = new THREE.Clock();
    const loader = new GLTFLoader();

    const wobble: { mesh: THREE.Object3D; baseY: number; phase: number }[] = [];
    const videoPlanes: VideoPlane[] = [];
    const overlayUpdates: Array<(delta: number) => void> = [];
    const overlayDisposers: Array<() => void> = [];
    const baseHref = baseHrefFromVite();

    const needsStencil = bundle.entries.some((e) => e.overlay === "clipping-stencil");
    if (needsStencil) {
      const patched = enableRendererStencilClipping(mindar.renderer);
      (mindar as { renderer: THREE.WebGLRenderer }).renderer = patched;
    }

    for (let i = 0; i < bundle.entries.length; i++) {
      const entry = bundle.entries[i];
      const anchor = mindar.addAnchor(i);
      const useOverlay = entry.overlay === "demo-3d" || entry.overlay === "clipping-stencil";
      const useVideo = Boolean(entry.videoSrc) && entry.glb.byteLength === 0 && !useOverlay;

      if (useOverlay && entry.overlay) {
        const effect = createBuiltinOverlay(entry.overlay);
        anchor.group.add(effect.root);
        overlayUpdates.push(effect.update);
        overlayDisposers.push(effect.dispose);

        anchor.onTargetFound = () => {
          onStatus(`Reconhecido: ${entry.title}`);
        };
        anchor.onTargetLost = () => {
          onStatus("Procurando arte…");
        };
      } else if (useVideo) {
        const plane = await createVideoPlane(entry, baseHref);
        videoPlanes.push(plane);
        anchor.group.add(plane.mesh);

        const v = plane.video;
        anchor.onTargetFound = () => {
          onStatus(`Reconhecido: ${entry.title}`);
          void v.play();
        };
        anchor.onTargetLost = () => {
          onStatus("Procurando arte…");
          v.pause();
        };
      } else {
        const modelUrl = URL.createObjectURL(new Blob([entry.glb], { type: "model/gltf-binary" }));
        cleanupModelUrls.push(modelUrl);

        const gltf = await loader.loadAsync(modelUrl);
        const model = gltf.scene;

        model.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.frustumCulled = false;
          }
        });

        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
        const s = 0.75 / maxDim;
        model.scale.setScalar(s);

        const center = new THREE.Vector3();
        box.getCenter(center);
        model.position.sub(center.multiplyScalar(s));
        model.position.z += 0.08;

        anchor.group.add(model);

        wobble.push({ mesh: model, baseY: model.position.y, phase: i * 1.7 });

        if (gltf.animations.length > 0) {
          const mixer = new AnimationMixer(model);
          for (const clip of gltf.animations) {
            mixer.clipAction(clip).play();
          }
          mixers.push(mixer);
        }

        anchor.onTargetFound = () => {
          onStatus(`Reconhecido: ${entry.title}`);
        };
        anchor.onTargetLost = () => {
          onStatus("Procurando arte…");
        };
      }
    }

    const { renderer, scene, camera } = mindar;
    await mindar.start();

    const running: RunningAr = {
      mindar,
      mixers,
      clock,
      mindObjectUrl: mindObjectUrl!,
      cleanupModelUrls,
      wobble,
      videoPlanes,
      overlayUpdates,
      overlayDisposers,
    };
    mindObjectUrl = null;
    current = running;

    const frame = () => {
      const delta = clock.getDelta();
      const t = performance.now() * 0.004;
      for (const w of wobble) {
        w.mesh.position.y = w.baseY + Math.sin(t + w.phase) * 0.06;
        w.mesh.rotation.z = Math.sin(t * 1.3 + w.phase) * 0.12;
      }
      for (const m of mixers) {
        m.update(delta);
      }
      for (const tick of running.overlayUpdates) {
        tick(delta);
      }
      for (const vp of running.videoPlanes) {
        vp.texture.needsUpdate = true;
      }
      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(frame);

    return {
      stop: () => {
        if (current !== running) {
          return;
        }
        try {
          running.mindar.renderer.setAnimationLoop(null);
        } catch {
          /* ignore */
        }
        disposeRunning(running);
      },
    };
  } finally {
    if (mindObjectUrl) {
      URL.revokeObjectURL(mindObjectUrl);
    }
  }
}
