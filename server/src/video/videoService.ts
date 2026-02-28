import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PATHS } from '../config.js';

const execFileAsync = promisify(execFile);

/** Retourne la commande ffmpeg (doit être dans PATH). */
function getFfmpegPath(): string {
  return 'ffmpeg';
}

/**
 * Crée une vidéo à partir des images du dossier validated (ordre alphabétique),
 * avec crossfade entre les images.
 * @param validatedDir Dossier contenant les images
 * @param outputDir Dossier de sortie pour la vidéo
 * @param fps Images par seconde (ex: 7)
 * @returns Chemin du fichier vidéo créé
 */
export async function createVideo(
  validatedDir: string,
  outputDir: string,
  fps: number
): Promise<string> {
  const files = fs.readdirSync(validatedDir)
    .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
    .sort()
    .map(f => path.join(validatedDir, f));

  if (files.length === 0) throw new Error('Aucune image dans le dossier validé.');

  fs.mkdirSync(outputDir, { recursive: true });
  const listPath = path.join(outputDir, 'list.txt');
  const listContent = files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(listPath, listContent, 'utf8');

  const outName = `output_${fps}fps.mp4`;
  const outPath = path.join(outputDir, outName);
  const ffmpeg = getFfmpegPath();

  // mpeg4 pour compatibilité avec ffmpeg sans libx264 (ex. anciennes installs macOS)
  await execFileAsync(ffmpeg, [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-r', String(fps),
    '-i', listPath,
    '-c:v', 'mpeg4',
    '-q:v', '3',
    '-pix_fmt', 'yuv420p',
    outPath,
  ], { maxBuffer: 10 * 1024 * 1024 });

  try { fs.unlinkSync(listPath); } catch { /* ignore */ }
  return outPath;
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
