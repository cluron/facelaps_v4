import * as path from 'node:path';
import * as fs from 'node:fs';
import type { Image } from 'canvas';
// TensorFlow.js CPU (sans tfjs-node) + face-api build ESM
import '@tensorflow/tfjs';
// @ts-ignore - build ESM pour éviter tfjs-node
import * as faceapi from '@vladmandic/face-api/dist/face-api.esm.js';
import sharp from 'sharp';
import { PATHS, SIMILARITY_THRESHOLD, FACE_OUTPUT_SIZE, FACE_PADDING } from '../config.js';

let modelsLoaded = false;

let canvasPatched = false;
/** Patch pour Node: canvas comme backend image (une seule fois). */
async function patchCanvas(): Promise<void> {
  if (canvasPatched) return;
  const { Canvas, Image } = await import('canvas');
  (faceapi.env as any).monkeyPatch({ Canvas, Image });
  canvasPatched = true;
}

/** Charge les modèles face-api depuis le dossier server/models. */
export async function loadModels(modelsDir?: string): Promise<void> {
  if (modelsLoaded) return;
  await patchCanvas();
  const dir = modelsDir ?? path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'models');
  if (!fs.existsSync(dir)) {
    throw new Error(
      `Dossier modèles introuvable: ${dir}. Placez-y les modèles face-api (ssdMobilenetv1, faceLandmarks68, faceRecognition).`
    );
  }
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(dir);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(dir);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(dir);
  modelsLoaded = true;
}

export type FaceDescriptor = Float32Array;

/** Charge une image depuis le disque (Node). */
async function loadImageFromPath(filePath: string): Promise<Image> {
  await patchCanvas();
  const { loadImage } = await import('canvas');
  return loadImage(filePath);
}

/** Encode les templates: charge chaque image, détecte 1 visage, retourne les descripteurs. */
export async function encodeTemplates(templateDir: string): Promise<FaceDescriptor[]> {
  await loadModels();
  const entries = fs.readdirSync(templateDir, { withFileTypes: true })
    .filter(e => e.isFile() && /\.(jpe?g|png|webp)$/i.test(e.name))
    .map(e => path.join(templateDir, e.name));
  const descriptors: FaceDescriptor[] = [];
  for (const filePath of entries) {
    try {
      const img = await loadImageFromPath(filePath);
      const detection = await faceapi
        .detectSingleFace(img as any)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (detection) descriptors.push(detection.descriptor);
    } catch (_) {
      // skip invalid or no-face images
    }
  }
  return descriptors;
}

/** Distance euclidienne entre deux descripteurs (plus petit = plus similaire). */
function euclideanDistance(a: FaceDescriptor, b: FaceDescriptor): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Similarité entre deux visages (0–1, 1 = identique). On utilise un seuil typique ~0.6. */
export function faceSimilarity(a: FaceDescriptor, b: FaceDescriptor): number {
  const d = euclideanDistance(a, b);
  return Math.max(0, 1 - d);
}

/** Vérifie si le descripteur correspond à au moins un template. */
export function isMatchingFace(descriptor: FaceDescriptor, templates: FaceDescriptor[]): boolean {
  if (templates.length === 0) return false;
  const best = Math.max(...templates.map(t => faceSimilarity(descriptor, t)));
  return best >= SIMILARITY_THRESHOLD;
}

/** Angle en radians entre la ligne des yeux et l’horizontale. */
function eyeAngle(landmarks: faceapi.FaceLandmarks68): number {
  const left = landmarks.getLeftEye().reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
  const right = landmarks.getRightEye().reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
  const leftEye = { x: left.x / 6, y: left.y / 6 };
  const rightEye = { x: right.x / 6, y: right.y / 6 };
  return Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
}

/** Extrait un visage aligné et redimensionné depuis une image (buffer). */
export async function extractAlignedFace(
  imagePath: string,
  detection: faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }, faceapi.FaceLandmarks68>>
): Promise<Buffer> {
  const img = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = img;
  const { width, height } = info;
  const box = detection.detection.box;
  const padX = box.width * FACE_PADDING;
  const padY = box.height * FACE_PADDING;
  let x = Math.max(0, Math.round(box.x - padX));
  let y = Math.max(0, Math.round(box.y - padY));
  let w = Math.min(width - x, Math.round(box.width + 2 * padX));
  let h = Math.min(height - y, Math.round(box.height + 2 * padY));
  if (x + w > width) w = width - x;
  if (y + h > height) h = height - y;

  let pipeline = sharp(data, { raw: { width, height, channels: 4 } })
    .extract({ left: x, top: y, width: w, height: h });

  const angleDeg = (eyeAngle(detection.landmarks) * 180) / Math.PI;
  if (Math.abs(angleDeg) > 1) pipeline = pipeline.rotate(-angleDeg);

  return pipeline
    .resize(FACE_OUTPUT_SIZE, FACE_OUTPUT_SIZE, { fit: 'cover' })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** Résultat pour une image source. */
export type ExtractResult =
  | { ok: true; path: string; similarity: number }
  | { ok: false; path: string; reason: 'no_face' | 'no_match' };

/**
 * Extrait les visages qui correspondent aux templates: détection, matching, alignement, crop, resize.
 * Les images matchées sont écrites dans validatedDir, les autres déplacées vers rejectedDir.
 */
export async function extractFaces(
  inputDir: string,
  templateDir: string,
  rejectedDir: string,
  validatedDir: string
): Promise<{ results: ExtractResult[]; matched: number }> {
  await loadModels();
  const templates = await encodeTemplates(templateDir);
  if (templates.length === 0) throw new Error('Aucun visage valide dans les templates.');

  const files = fs.readdirSync(inputDir)
    .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
    .map(f => path.join(inputDir, f));
  const results: ExtractResult[] = [];
  let matched = 0;

  fs.mkdirSync(rejectedDir, { recursive: true });
  fs.mkdirSync(validatedDir, { recursive: true });

  for (const filePath of files) {
    const basename = path.basename(filePath);
    try {
      const img = await loadImageFromPath(filePath);
      const withDescriptor = await faceapi
        .detectSingleFace(img as any)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!withDescriptor) {
        fs.renameSync(filePath, path.join(rejectedDir, basename));
        results.push({ ok: false, path: basename, reason: 'no_face' });
        continue;
      }

      if (!isMatchingFace(withDescriptor.descriptor, templates)) {
        fs.renameSync(filePath, path.join(rejectedDir, basename));
        const sim = Math.max(...templates.map(t => faceSimilarity(withDescriptor.descriptor, t)));
        results.push({ ok: false, path: basename, reason: 'no_match' });
        continue;
      }

      const similarity = Math.max(...templates.map(t => faceSimilarity(withDescriptor.descriptor, t)));
      const faceBuffer = await extractAlignedFace(filePath, withDescriptor);
      const outName = basename.replace(/\.[a-z]+$/i, '.jpg');
      const outPath = path.join(validatedDir, outName);
      fs.writeFileSync(outPath, faceBuffer);
      fs.unlinkSync(filePath);
      results.push({ ok: true, path: outName, similarity });
      matched++;
    } catch (e) {
      fs.renameSync(filePath, path.join(rejectedDir, basename));
      results.push({ ok: false, path: basename, reason: 'no_face' });
    }
  }

  return { results, matched };
}
