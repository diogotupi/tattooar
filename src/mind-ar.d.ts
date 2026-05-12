declare module "mind-ar/dist/mindar-image-three.prod.js" {
  import type { Group, Scene, WebGLRenderer, PerspectiveCamera } from "three";

  export type MindARAnchor = {
    group: Group;
    targetIndex: number;
    onTargetFound: (() => void) | null;
    onTargetLost: (() => void) | null;
    onTargetUpdate: (() => void) | null;
  };

  export class MindARThree {
    constructor(options: {
      container: HTMLElement;
      imageTargetSrc: string;
      uiLoading?: string;
      uiScanning?: string;
      uiError?: string;
      filterMinCF?: number | null;
      filterBeta?: number | null;
      warmupTolerance?: number | null;
      missTolerance?: number | null;
      maxTrack?: number;
      userDeviceId?: string | null;
      environmentDeviceId?: string | null;
    });

    container: HTMLElement;
    imageTargetSrc: string;
    scene: Scene;
    renderer: WebGLRenderer;
    camera: PerspectiveCamera;
    video: HTMLVideoElement;

    start(): Promise<void>;
    stop(): void;
    switchCamera(): void;
    addAnchor(targetIndex: number): MindARAnchor;
    resize(): void;
  }
}

declare module "mind-ar/src/image-target/compiler.js" {
  export class Compiler {
    compileImageTargets(
      images: HTMLImageElement[],
      progressCallback: (percent: number) => void,
    ): Promise<unknown[]>;
    exportData(): ArrayBuffer | Uint8Array;
  }
}
