/**
 * Gera public/demo/overlay-teste.glb — forma dourada simples (teste de sobreposição AR).
 * Executar: npm run gen-demo-glb
 */
import "./polyfill-filereader.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "public", "demo");
const outFile = join(outDir, "overlay-teste.glb");

mkdirSync(outDir, { recursive: true });

const scene = new THREE.Scene();
const group = new THREE.Group();

const mat = new THREE.MeshStandardMaterial({
  color: 0xffc107,
  emissive: 0xff6f00,
  emissiveIntensity: 0.55,
  metalness: 0.35,
  roughness: 0.28,
});

// “Polegar”: esfera + cilindro inclinado (bem visível em AR)
const bola = new THREE.Mesh(new THREE.SphereGeometry(0.38, 28, 28), mat);
bola.position.set(0, 0, 0);
group.add(bola);

const dedo = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.62, 18), mat);
dedo.rotation.z = Math.PI * 0.15;
dedo.position.set(-0.18, 0.48, 0.02);
group.add(dedo);

const anel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 12, 32), mat);
anel.rotation.x = Math.PI / 2;
anel.position.set(0.12, -0.08, 0);
group.add(anel);

scene.add(group);

const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(scene, { binary: true });
writeFileSync(outFile, Buffer.from(glb));
console.log("Escrito:", outFile);
