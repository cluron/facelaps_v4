import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { PATHS } from '../config.js';
import { createVideo, concatenateVideos } from '../video/videoService.js';

const router = Router();
const root = PATHS.projectRoot;

function dir(name: keyof typeof PATHS.dirs): string {
  return path.join(root, PATHS.dirs[name]);
}

const FOLDER_NAMES = Object.keys(PATHS.dirs) as (keyof typeof PATHS.dirs)[];

function isValidFolder(name: string): name is keyof typeof PATHS.dirs {
  return FOLDER_NAMES.includes(name as keyof typeof PATHS.dirs);
}

/** Upload de fichiers vers un dossier du pipeline (multipart, field: "files"). */
router.post('/upload/:folder', (req: Request, res: Response, next: NextFunction) => {
  const folder = req.params.folder as string;
  if (!isValidFolder(folder)) return res.status(400).json({ error: 'Dossier invalide' });
  const dirPath = dir(folder);
  fs.mkdirSync(dirPath, { recursive: true });
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dirPath),
    filename: (_req, file, cb) => {
      const base = path.basename(file.originalname || 'file');
      const ext = path.extname(base);
      const name = path.basename(base, ext);
      let final = base;
      if (fs.existsSync(path.join(dirPath, base))) {
        final = `${name}_${Date.now()}${ext}`;
      }
      cb(null, final);
    },
  });
  multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } }).array('files', 100)(req, res, next);
}, (req: Request, res: Response) => {
  const files = (req as any).files as Express.Multer.File[] | undefined;
  const names = files?.map((f) => f.filename) ?? [];
  res.json({ uploaded: names });
}, (err: any, _req: Request, res: Response, _next: NextFunction) => {
  res.status(400).json({ error: err?.message ?? 'Erreur upload' });
});

/** Supprimer des fichiers d’un dossier (body: { folder, files: string[] }). */
router.post('/delete', (req, res) => {
  const { folder, files: fileList } = req.body as { folder?: string; files?: string[] };
  if (!folder || !Array.isArray(fileList) || fileList.length === 0) {
    return res.status(400).json({ error: 'folder et files (array) requis' });
  }
  if (!isValidFolder(folder)) return res.status(400).json({ error: 'Dossier invalide' });
  const dirPath = dir(folder);
  const deleted: string[] = [];
  for (const f of fileList) {
    const base = path.basename(f);
    if (base.includes('..')) continue;
    const full = path.join(dirPath, base);
    if (fs.existsSync(full)) {
      try {
        fs.unlinkSync(full);
        deleted.push(base);
      } catch (_) {}
    }
  }
  res.json({ deleted });
});

/** Liste les fichiers d’un dossier du pipeline. */
router.get('/folders/:name', (req, res) => {
  const name = req.params.name as keyof typeof PATHS.dirs;
  if (!(name in PATHS.dirs)) return res.status(400).json({ error: 'Dossier invalide' });
  const d = dir(name);
  if (!fs.existsSync(d)) return res.json({ files: [] });
  const files = fs.readdirSync(d)
    .filter(f => !f.startsWith('.') && /\.(jpe?g|png|webp|mp4)$/i.test(f))
    .sort();
  res.json({ path: d, files });
});

/** Lance l’extraction: templates + input -> validated / rejected. */
router.post('/extract', async (req, res) => {
  try {
    const templateDir = dir('templates');
    const inputDir = dir('input');
    const rejectedDir = dir('rejected');
    const validatedDir = dir('validated');
    if (!fs.existsSync(templateDir)) return res.status(400).json({ error: 'Dossier templates manquant' });
    if (!fs.existsSync(inputDir)) return res.status(400).json({ error: 'Dossier input manquant' });
    // Chargement différé pour appliquer le polyfill Node avant face-api/TensorFlow
    const { extractFaces } = await import('../face/faceService.js');
    const { results, matched } = await extractFaces(inputDir, templateDir, rejectedDir, validatedDir);
    res.json({ results, matched, total: results.length });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Extraction failed' });
  }
});

/** Rejeter des images (déplacer de validated vers rejected). */
router.post('/reject', (req, res) => {
  const { files } = req.body as { files: string[] };
  if (!Array.isArray(files) || files.length === 0) return res.status(400).json({ error: 'files array required' });
  const validatedDir = dir('validated');
  const rejectedDir = dir('rejected');
  fs.mkdirSync(rejectedDir, { recursive: true });
  const rejected: string[] = [];
  for (const f of files) {
    const base = path.basename(f);
    const src = path.join(validatedDir, base);
    if (fs.existsSync(src)) {
      try {
        fs.renameSync(src, path.join(rejectedDir, base));
        rejected.push(base);
      } catch (_) {}
    }
  }
  res.json({ rejected });
});

/** Créer la vidéo à partir du dossier validated. */
router.post('/make-video', async (req, res) => {
  const fps = Number(req.body?.fps) || 7;
  try {
    const validatedDir = dir('validated');
    const outputDir = dir('video');
    const outPath = await createVideo(validatedDir, outputDir, fps);
    res.json({ path: outPath });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Video creation failed' });
  }
});

/** Concaténer les vidéos du dossier video. */
router.post('/concatenate-videos', async (req, res) => {
  try {
    const videoDir = dir('video');
    const outPath = await concatenateVideos(videoDir);
    res.json({ path: outPath });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Concatenation failed' });
  }
});

export default router;
