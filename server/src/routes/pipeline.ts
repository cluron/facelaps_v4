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

/**
 * Finalise l’extraction côté client : reçoit les visages validés, les crops rejetés (pose/qualité), et la liste des rejetés sans crop (no_face/no_match) à copier en input_xxx.
 * Body: FormData avec "validated", "rejectedCrop" (fichiers image = visages extraits rejetés), "rejected" (JSON array de noms input à copier en input_xxx).
 */
router.post('/extract/complete', (req: Request, res: Response, next: NextFunction) => {
  const inputDir = dir('input');
  const rejectedDir = dir('rejected');
  const validatedDir = dir('validated');
  if (!fs.existsSync(inputDir)) return res.status(400).json({ error: 'Dossier input manquant' });
  fs.mkdirSync(rejectedDir, { recursive: true });
  fs.mkdirSync(validatedDir, { recursive: true });

  const storage = multer.memoryStorage();
  const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
  upload.fields([
    { name: 'validated', maxCount: 500 },
    { name: 'rejectedCrop', maxCount: 500 },
  ])(req, res, (err: any) => {
    if (err) return res.status(400).json({ error: err?.message ?? 'Upload failed' });
    const allFiles = (req as any).files as { validated?: Express.Multer.File[]; rejectedCrop?: Express.Multer.File[] } | undefined;
    const validatedFiles = allFiles?.validated ?? [];
    const rejectedCropFiles = allFiles?.rejectedCrop ?? [];
    const rejectedRaw = (req as any).body?.rejected;
    const validatedSourceRaw = (req as any).body?.validatedSourceNames;
    let rejectedCopyFromInput: { sourceName: string; reason: string }[] = [];
    let validatedSourceNames: string[] = [];
    try {
      const parsed = typeof rejectedRaw === 'string' ? JSON.parse(rejectedRaw) : Array.isArray(rejectedRaw) ? rejectedRaw : [];
      rejectedCopyFromInput = parsed.map((x: unknown) =>
        typeof x === 'object' && x !== null && 'sourceName' in x && 'reason' in x
          ? { sourceName: String((x as any).sourceName), reason: String((x as any).reason) }
          : { sourceName: String(x), reason: 'no_face' }
      );
    } catch (_) {}
    try {
      validatedSourceNames = typeof validatedSourceRaw === 'string' ? JSON.parse(validatedSourceRaw) : Array.isArray(validatedSourceRaw) ? validatedSourceRaw : [];
    } catch (_) {}

    const written: string[] = [];
    for (const f of validatedFiles) {
      const base = path.basename(f.originalname || 'image.jpg').replace(/\.[a-z]+$/i, '.jpg');
      const outPath = path.join(validatedDir, base);
      try {
        fs.writeFileSync(outPath, f.buffer);
        written.push(base);
      } catch (_) {}
    }
    // Crops rejetés (visage tourné / qualité) : même format que validés, en 2_rejected.
    for (const f of rejectedCropFiles) {
      const base = path.basename(f.originalname || 'image.jpg').replace(/\.[a-z]+$/i, '.jpg');
      if (base.includes('..')) continue;
      try {
        fs.writeFileSync(path.join(rejectedDir, base), f.buffer);
      } catch (_) {}
    }
    // Rejetés sans crop (no_face, no_match) : copie de l’original en input_xxx pour référence (non récupérable).
    for (const { sourceName, reason } of rejectedCopyFromInput) {
      const base = path.basename(sourceName);
      if (base.includes('..')) continue;
      const src = path.join(inputDir, base);
      if (fs.existsSync(src)) {
        try {
          fs.copyFileSync(src, path.join(rejectedDir, `${reason}_input_${base}`));
        } catch (_) {}
      }
    }
    res.json({ validated: written, matched: written.length });
  });
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

const RESTORE_PREFIXES = ['face_turned_', 'low_quality_', 'no_match_'];

/** Récupérer des images (déplacer de rejected vers validated). Crops reason_xxx → renommés en xxx ; rejets manuels → même nom. */
router.post('/restore', (req, res) => {
  const { files } = req.body as { files: string[] };
  if (!Array.isArray(files) || files.length === 0) return res.status(400).json({ error: 'files array required' });
  const rejectedDir = dir('rejected');
  const validatedDir = dir('validated');
  fs.mkdirSync(validatedDir, { recursive: true });
  const restored: string[] = [];
  for (const f of files) {
    const base = path.basename(f);
    if (base.includes('..')) continue;
    const src = path.join(rejectedDir, base);
    if (!fs.existsSync(src)) continue;
    const prefix = RESTORE_PREFIXES.find((p) => base.startsWith(p));
    const validatedName = prefix ? base.slice(prefix.length) : base;
    try {
      fs.renameSync(src, path.join(validatedDir, validatedName));
      restored.push(validatedName);
    } catch (_) {}
  }
  res.json({ restored });
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
