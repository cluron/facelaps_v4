/**
 * Extraction des visages dans le navigateur (face-api + tfjs).
 * Plus de module natif canvas côté serveur.
 */
import * as faceapi from '@vladmandic/face-api';

const MODELS_URL = '/models';

/** Paramètres d'extraction (valeurs par défaut si non fournis). */
export interface ExtractOptions {
  faceOutputSize?: number;
  eyeSpanRatio?: number;
  jpegQuality?: number;
  canonEyeY?: number;
  /** Seuil de similarité template ↔ visage (0–1). Plus bas = plus de photos acceptées. */
  similarityThreshold?: number;
  /** Confiance min. de détection (0–1). Plus bas = plus de visages détectés. */
  detectionMinConfidence?: number;
  /**
   * Seuil de frontalité (0–1). Rapport min(dL,dR)/max(dL,dR) des distances œil gauche/ droit → nez.
   * Plus bas = on accepte des visages plus tournés. 0 = désactivé.
   */
  faceTurnThreshold?: number;
  /**
   * Variance du Laplacien minimum pour accepter l'image (anti-flou). 0 = désactivé.
   */
  minBlurVariance?: number;
}

const DEFAULT_EXTRACT_OPTIONS: Required<ExtractOptions> = {
  faceOutputSize: 4096,
  eyeSpanRatio: 0.2,
  jpegQuality: 1,
  canonEyeY: 0.5,
  similarityThreshold: 0.4,
  detectionMinConfidence: 0.28,
  faceTurnThreshold: 0.55,
  minBlurVariance: 80,
};

type FaceDescriptor = Float32Array;

function euclideanDistance(a: FaceDescriptor, b: FaceDescriptor): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function faceSimilarity(a: FaceDescriptor, b: FaceDescriptor): number {
  return Math.max(0, 1 - euclideanDistance(a, b));
}

function isMatching(descriptor: FaceDescriptor, templates: FaceDescriptor[], threshold: number): boolean {
  if (templates.length === 0) return false;
  const best = Math.max(...templates.map((t) => faceSimilarity(descriptor, t)));
  return best >= threshold;
}

function getEyeCenters(landmarks: faceapi.FaceLandmarks68): { left: { x: number; y: number }; right: { x: number; y: number }; center: { x: number; y: number } } {
  const leftPoints = landmarks.getLeftEye();
  const rightPoints = landmarks.getRightEye();
  const left = {
    x: leftPoints.reduce((s, p) => s + p.x, 0) / leftPoints.length,
    y: leftPoints.reduce((s, p) => s + p.y, 0) / leftPoints.length,
  };
  const right = {
    x: rightPoints.reduce((s, p) => s + p.x, 0) / rightPoints.length,
    y: rightPoints.reduce((s, p) => s + p.y, 0) / rightPoints.length,
  };
  const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
  return { left, right, center };
}

function getNoseCenter(landmarks: faceapi.FaceLandmarks68): { x: number; y: number } {
  const nosePoints = landmarks.getNose();
  return {
    x: nosePoints.reduce((s, p) => s + p.x, 0) / nosePoints.length,
    y: nosePoints.reduce((s, p) => s + p.y, 0) / nosePoints.length,
  };
}

/**
 * Score de frontalité : rapport min(dL,dR)/max(dL,dR) où dL = distance œil gauche → nez, dR = œil droit → nez.
 * 1 = parfaitement de face, < 1 = visage tourné.
 */
function facePoseScore(landmarks: faceapi.FaceLandmarks68): number {
  const { left, right } = getEyeCenters(landmarks);
  const nose = getNoseCenter(landmarks);
  const dL = Math.hypot(nose.x - left.x, nose.y - left.y) || 1e-6;
  const dR = Math.hypot(nose.x - right.x, nose.y - right.y) || 1e-6;
  return Math.min(dL, dR) / Math.max(dL, dR);
}

/** Variance du Laplacien sur un canvas (indicateur de netteté ; faible = flou). */
function computeBlurVariance(source: HTMLCanvasElement, sampleSize = 32): number {
  const w = source.width;
  const h = source.height;
  const s = Math.min(sampleSize, w, h);
  const work = document.createElement('canvas');
  work.width = s;
  work.height = s;
  const ctx = work.getContext('2d')!;
  ctx.drawImage(source, 0, 0, w, h, 0, 0, s, s);
  const data = ctx.getImageData(0, 0, s, s).data;
  const gray: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  const lap: number[] = [];
  for (let y = 1; y < s - 1; y++) {
    for (let x = 1; x < s - 1; x++) {
      const i = y * s + x;
      const v =
        -gray[i - s] - gray[i - 1] + 4 * gray[i] - gray[i + 1] - gray[i + s];
      lap.push(v);
    }
  }
  const n = lap.length;
  const mean = lap.reduce((a, b) => a + b, 0) / n;
  const variance = lap.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
  return variance;
}

let modelsLoaded = false;

export async function loadModels(): Promise<void> {
  if (modelsLoaded) return;
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
  ]);
  modelsLoaded = true;
}

function loadImageAsHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

const MIN_OUTPUT_SIZE = 512;
const MAX_OUTPUT_SIZE = 4096;

/**
 * Crop aligné : yeux à position fixe (centrée). Résolution adaptative = meilleure possible
 * sans upscaler : on ne dépasse pas la résolution source ni la taille du visage en pixels.
 * Retourne le blob et la variance du Laplacien (netteté) pour un éventuel rejet qualité.
 */
function extractAlignedFaceBlob(
  img: HTMLImageElement,
  detection: faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>>,
  opts: Required<ExtractOptions>
): Promise<{ blob: Blob; blurVariance: number }> {
  const { left: srcLeft, right: srcRight, center: srcCenter } = getEyeCenters(detection.landmarks);
  const srcDist = Math.hypot(srcRight.x - srcLeft.x, srcRight.y - srcLeft.y) || 1;
  const angle = Math.atan2(srcRight.y - srcLeft.y, srcRight.x - srcLeft.x);

  // Résolution max sans upscaler : taille "naturelle" du visage (srcDist/eyeSpanRatio) et bord de l'image
  const naturalSize = Math.round(srcDist / opts.eyeSpanRatio);
  const S = Math.max(
    MIN_OUTPUT_SIZE,
    Math.min(
      opts.faceOutputSize,
      MAX_OUTPUT_SIZE,
      img.width,
      img.height,
      naturalSize
    )
  );

  const canonCenterX = 0.5 * S;
  const canonCenterY = opts.canonEyeY * S;
  const scale = (opts.eyeSpanRatio * S) / srcDist;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const out = document.createElement('canvas');
  out.width = S;
  out.height = S;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, S, S);
  ctx.clip();
  ctx.setTransform(
    scale * cos,
    -scale * sin,
    scale * sin,
    scale * cos,
    canonCenterX - scale * (cos * srcCenter.x + sin * srcCenter.y),
    canonCenterY - scale * (-sin * srcCenter.x + cos * srcCenter.y)
  );
  ctx.drawImage(img, 0, 0, img.width, img.height);
  ctx.restore();

  const blurVariance = computeBlurVariance(out);

  return new Promise((resolve, reject) => {
    out.toBlob(
      (blob) => (blob ? resolve({ blob, blurVariance }) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      opts.jpegQuality
    );
  });
}

export type RejectReason = 'no_face' | 'no_match' | 'face_turned' | 'low_quality';

export type ExtractResult =
  | { ok: true; path: string; similarity: number }
  | { ok: false; path: string; reason: RejectReason };

export type ValidatedFile = { name: string; blob: Blob; sourceName: string };

/** Rejet avec motif (encodé dans le nom du fichier en 2_rejected pour étiquettes et filtres). */
export type RejectedItem = { sourceName: string; blob?: Blob; reason: RejectReason };

export type ExtractProgress = (message: string) => void;

/** Appelé après chaque image traitée (pour affichage en direct). */
export type ExtractOnItemDone = (result: ExtractResult) => void;

/**
 * Extrait les visages côté client. Templates et input sont des URLs d'images.
 * options : paramètres de recadrage (taille, zoom, qualité, position des yeux).
 */
export async function extractInBrowser(
  templateUrls: string[],
  inputFiles: { name: string; url: string }[],
  onProgress?: ExtractProgress,
  options?: ExtractOptions,
  onItemDone?: ExtractOnItemDone
): Promise<{ results: ExtractResult[]; validated: ValidatedFile[]; rejected: RejectedItem[] }> {
  const opts: Required<ExtractOptions> = { ...DEFAULT_EXTRACT_OPTIONS, ...options };
  const report = (msg: string) => onProgress?.(msg);

  report('Chargement des modèles (détection + reconnaissance)…');
  await loadModels();

  const templateDescriptors: FaceDescriptor[] = [];
  const totalTemplates = templateUrls.length;
  const detectionOpts = new faceapi.SsdMobilenetv1Options({ minConfidence: opts.detectionMinConfidence });
  for (let i = 0; i < templateUrls.length; i++) {
    report(`Encodage des templates (${i + 1}/${totalTemplates})…`);
    try {
      const img = await loadImageAsHtmlImage(templateUrls[i]);
      const det = await faceapi
        .detectSingleFace(img, detectionOpts)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (det) templateDescriptors.push(det.descriptor);
    } catch (_) {}
  }
  if (templateDescriptors.length === 0) throw new Error('Aucun visage valide dans les templates.');

  const results: ExtractResult[] = [];
  const validated: ValidatedFile[] = [];
  const rejected: RejectedItem[] = [];
  const totalInput = inputFiles.length;

  for (let idx = 0; idx < inputFiles.length; idx++) {
    const { name, url } = inputFiles[idx];
    report(`Traitement des images (${idx + 1}/${totalInput})…`);
    try {
      const img = await loadImageAsHtmlImage(url);
      const allDetections = await faceapi
        .detectAllFaces(img, detectionOpts)
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (allDetections.length === 0) {
        const r: ExtractResult = { ok: false, path: name, reason: 'no_face' };
        results.push(r);
        rejected.push({ sourceName: name, reason: 'no_face' });
        onItemDone?.(r);
        continue;
      }

      // Parmi tous les visages détectés, garder celui qui matche le mieux les templates.
      let bestDet: typeof allDetections[0] | null = null;
      let bestSimilarity = 0;
      for (const d of allDetections) {
        const sim = Math.max(...templateDescriptors.map((t) => faceSimilarity(d.descriptor, t)));
        if (sim > bestSimilarity) {
          bestSimilarity = sim;
          bestDet = d;
        }
      }

      if (!bestDet || bestSimilarity < opts.similarityThreshold) {
        const r: ExtractResult = { ok: false, path: name, reason: 'no_match' };
        results.push(r);
        // Envoyer le crop du visage extrait qui n'a pas matché (comme pour face_turned/low_quality)
        const { blob } = await extractAlignedFaceBlob(img, bestDet!, opts);
        rejected.push({ sourceName: name, blob, reason: 'no_match' });
        onItemDone?.(r);
        continue;
      }

      if (opts.faceTurnThreshold > 0 && facePoseScore(bestDet.landmarks) < opts.faceTurnThreshold) {
        const r: ExtractResult = { ok: false, path: name, reason: 'face_turned' };
        results.push(r);
        const { blob } = await extractAlignedFaceBlob(img, bestDet, opts);
        rejected.push({ sourceName: name, blob, reason: 'face_turned' });
        onItemDone?.(r);
        continue;
      }

      const { blob, blurVariance } = await extractAlignedFaceBlob(img, bestDet, opts);
      if (opts.minBlurVariance > 0 && blurVariance < opts.minBlurVariance) {
        const r: ExtractResult = { ok: false, path: name, reason: 'low_quality' };
        results.push(r);
        rejected.push({ sourceName: name, blob, reason: 'low_quality' });
        onItemDone?.(r);
        continue;
      }

      const outName = name.replace(/\.[a-z]+$/i, '.jpg');
      validated.push({ name: outName, blob, sourceName: name });
      const r: ExtractResult = { ok: true, path: outName, similarity: bestSimilarity };
      results.push(r);
      onItemDone?.(r);
    } catch (_) {
      const r: ExtractResult = { ok: false, path: name, reason: 'no_face' };
      results.push(r);
      rejected.push({ sourceName: name, reason: 'no_face' });
      onItemDone?.(r);
    }
  }

  return { results, validated, rejected };
}
