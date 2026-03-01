import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import exifr from 'exifr';
import { PATHS } from '../config.js';

/** Chargement paresseux de sharp (module natif) pour ne pas faire crasher le serveur au démarrage. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharpModule: any = null;
async function getSharp() {
  if (!sharpModule) sharpModule = (await import('sharp')).default;
  return sharpModule;
}

const execFileAsync = promisify(execFile);

export type VideoSortOrder = 'chronological' | 'color' | 'similarity';

/** Retourne la commande ffmpeg (doit être dans PATH). */
function getFfmpegPath(): string {
  return 'ffmpeg';
}

/** Timestamp de tri : EXIF (DateTimeOriginal / CreateDate) > mtime > 0 (nom en secours). */
async function getSortTime(filePath: string): Promise<number> {
  try {
    const exif = await exifr.parse(filePath, { pick: ['DateTimeOriginal', 'CreateDate'] });
    const d = exif?.DateTimeOriginal ?? exif?.CreateDate;
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d.getTime();
    if (typeof d === 'string') return new Date(d).getTime();
  } catch {
    /* pas d'EXIF ou erreur lecture */
  }
  try {
    const stat = fs.statSync(filePath);
    return stat.mtimeMs;
  } catch {
    return 0;
  }
}

/** Même filtre que l’API folders : pas de fichiers cachés, uniquement images. */
const VALIDATED_IMAGE_REGEX = /\.(jpe?g|png|webp)$/i;
function listValidatedImages(dirPath: string): string[] {
  return fs.readdirSync(dirPath)
    .filter(f => !f.startsWith('.') && VALIDATED_IMAGE_REGEX.test(f));
}

/** Couleur moyenne RGB (0–255) via sharp. */
async function getAverageRgb(filePath: string): Promise<{ r: number; g: number; b: number }> {
  const sharp = await getSharp();
  const stats = await sharp(filePath).stats();
  const channels = stats.channels;
  return {
    r: Math.round(channels[0]?.mean ?? 0),
    g: Math.round((channels[1]?.mean ?? channels[0]?.mean) ?? 0),
    b: Math.round((channels[2]?.mean ?? channels[0]?.mean) ?? 0),
  };
}

/** RGB (0–255) → HSV (h 0–360, s 0–1, v 0–1). */
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s, v };
}

/** Distance euclidienne entre deux RGB. */
function colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/** Trie les chemins par teinte puis luminosité (arc-en-ciel). */
function sortByColor(
  items: { path: string; rgb: { r: number; g: number; b: number } }[]
): string[] {
  return [...items]
    .map(({ path: p, rgb }) => ({ path: p, hsv: rgbToHsv(rgb.r, rgb.g, rgb.b) }))
    .sort((a, b) => {
      const d = a.hsv.h - b.hsv.h;
      if (Math.abs(d) > 180) return d > 0 ? -1 : 1;
      if (d !== 0) return d;
      return a.hsv.v - b.hsv.v;
    })
    .map((x) => x.path);
}

/** Ordre glouton : chaque image suivante est la plus proche en couleur de la précédente. */
function sortBySimilarity(
  items: { path: string; rgb: { r: number; g: number; b: number } }[]
): string[] {
  if (items.length <= 1) return items.map((i) => i.path);
  const used = new Set<number>();
  const ordered: string[] = [];
  let lastIdx = 0;
  ordered.push(items[0].path);
  used.add(0);
  while (used.size < items.length) {
    let bestIdx = -1;
    let bestDist = Infinity;
    const lastRgb = items[lastIdx].rgb;
    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;
      const d = colorDistance(lastRgb, items[i].rgb);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    ordered.push(items[bestIdx].path);
    used.add(bestIdx);
    lastIdx = bestIdx;
  }
  return ordered;
}

/**
 * Crée une vidéo à partir des images du dossier validated.
 * @param validatedDir Dossier contenant les images
 * @param outputDir Dossier de sortie pour la vidéo
 * @param fps Images par seconde (ex: 7)
 * @param sortOrder chronological (EXIF/mtime/nom) | color (teinte) | similarity (transition douce)
 * @returns Chemin du fichier vidéo créé et nombre d’images utilisées
 */
export async function createVideo(
  validatedDir: string,
  outputDir: string,
  fps: number,
  sortOrder: VideoSortOrder = 'chronological'
): Promise<{ path: string; imageCount: number }> {
  const filenames = listValidatedImages(validatedDir);

  if (filenames.length === 0) throw new Error('Aucune image dans le dossier validé.');

  let files: string[];

  if (sortOrder === 'chronological') {
    const withTime = await Promise.all(
      filenames.map(async (f) => {
        const fullPath = path.join(validatedDir, f);
        const sortTime = await getSortTime(fullPath);
        return { fullPath, filename: f, sortTime };
      })
    );
    files = withTime
      .sort((a, b) => a.sortTime - b.sortTime || a.filename.localeCompare(b.filename))
      .map((x) => x.fullPath);
  } else {
    const withRgb = await Promise.all(
      filenames.map(async (f) => {
        const fullPath = path.join(validatedDir, f);
        const rgb = await getAverageRgb(fullPath);
        return { path: fullPath, rgb };
      })
    );
    files = sortOrder === 'color'
      ? sortByColor(withRgb)
      : sortBySimilarity(withRgb);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const listPath = path.join(outputDir, 'list.txt');
  // Chaque image doit durer 1/fps seconde. Le demuxer concat n'applique pas -r aux images :
  // on met "duration 1/fps" dans la liste pour obtenir une vidéo de (nb images / fps) secondes.
  const durationSec = 1 / fps;
  const listContent = files
    .map(f => `file '${f.replace(/'/g, "'\\''")}'\nduration ${durationSec}`)
    .join('\n');
  fs.writeFileSync(listPath, listContent, 'utf8');

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const orderLabel = sortOrder === 'chronological' ? 'chrono' : sortOrder === 'color' ? 'couleur' : 'similarite';
  const outName = `timelapse_${fps}fps_${files.length}img_${orderLabel}_${dateStr}-${timeStr}.mp4`;
  const outPath = path.join(outputDir, outName);
  const ffmpeg = getFfmpegPath();

  // mpeg4 pour compatibilité avec ffmpeg sans libx264 (ex. anciennes installs macOS)
  await execFileAsync(ffmpeg, [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c:v', 'mpeg4',
    '-q:v', '3',
    '-pix_fmt', 'yuv420p',
    outPath,
  ], { maxBuffer: 10 * 1024 * 1024 });

  try { fs.unlinkSync(listPath); } catch { /* ignore */ }
  return { path: outPath, imageCount: files.length };
}

/**
 * Concatène toutes les vidéos MP4 d'un dossier (ordre alphabétique).
 */
export async function concatenateVideos(sourceDir: string): Promise<string> {
  const files = fs.readdirSync(sourceDir)
    .filter(f => f.toLowerCase().endsWith('.mp4') && f !== 'output_concatenation.mp4')
    .sort()
    .map(f => path.join(sourceDir, f));

  if (files.length === 0) throw new Error('Aucune vidéo MP4 dans le dossier.');

  const listPath = path.join(sourceDir, 'concat_list.txt');
  const listContent = files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(listPath, listContent, 'utf8');

  const outPath = path.join(sourceDir, 'output_concatenation.mp4');
  const ffmpeg = getFfmpegPath();

  await execFileAsync(ffmpeg, [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    outPath,
  ], { maxBuffer: 10 * 1024 * 1024 });

  try { fs.unlinkSync(listPath); } catch { /* ignore */ }
  return outPath;
}
