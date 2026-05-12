import * as THREE from "three";
import { AnimationMixer } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MindARThree } from "mind-ar/dist/mindar-image-three.prod.js";
import type { ArBundle } from "./storage";

type RunningAr = {
  mindar: InstanceType<typeof MindARThree>;
  mixers: AnimationMixer[];
  clock: THREE.Clock;
  mindObjectUrl: string;
  cleanupModelUrls: string[];
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
  if (current === r) {
    current = null;
  }
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

    for (let i = 0; i < bundle.entries.length; i++) {
      const entry = bundle.entries[i];
      const modelUrl = URL.createObjectURL(new Blob([entry.glb], { type: "model/gltf-binary" }));
      cleanupModelUrls.push(modelUrl);

      const anchor = mindar.addAnchor(i);

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

    const { renderer, scene, camera } = mindar;
    await mindar.start();

    const running: RunningAr = {
      mindar,
      mixers,
      clock,
      mindObjectUrl: mindObjectUrl!,
      cleanupModelUrls,
    };
    mindObjectUrl = null;
    current = running;

    const frame = () => {
      const delta = clock.getDelta();
      for (const m of mixers) {
        m.update(delta);
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
