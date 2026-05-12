import * as THREE from "three";
import { AnimationMixer } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MindARThree } from "mind-ar/dist/mindar-image-three.prod.js";
import type { ArBundle, ArEntryMeta } from "./storage";

type VideoPlane = {
  video: HTMLVideoElement;
  texture: THREE.VideoTexture;
  material: THREE.MeshBasicMaterial;
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
};

let current: RunningAr | null = null;

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
  if (current === r) {
    current = null;
  }
}

function baseHrefFromVite(): string {
  return `${import.meta.env.BASE_URL.replace(/\/?$/, "/")}`;
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

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const aspect = vw / vh;
  const planeW = 0.75;
  const planeH = planeW / aspect;
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
    const baseHref = baseHrefFromVite();

    for (let i = 0; i < bundle.entries.length; i++) {
      const entry = bundle.entries[i];
      const anchor = mindar.addAnchor(i);
      const useVideo = Boolean(entry.videoSrc) && entry.glb.byteLength === 0;

      if (useVideo) {
        const plane = await createVideoPlane(entry, baseHref);
        videoPlanes.push(plane);
        anchor.group.add(plane.mesh);
        wobble.push({ mesh: plane.mesh, baseY: plane.mesh.position.y, phase: i * 1.7 });

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
