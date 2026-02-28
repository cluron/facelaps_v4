import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PATHS = {
  /** Racine du repo (parent de server/) */
  projectRoot: path.resolve(__dirname, '..', '..'),
  /** Dossiers du pipeline (relatifs à projectRoot) */
  dirs: {
    templates: '0_template_photos',
    input: '1_input',
    rejected: '2_rejected',
    validated: '3_validated',
    video: '4_video',
  },
} as const;

/** Seuil de similarité pour accepter un visage (0–1). Plus haut = plus strict. */
export const SIMILARITY_THRESHOLD = 0.6;

/** Taille finale des visages extraits (carré). */
export const FACE_OUTPUT_SIZE = 512;

/** Padding autour de la boîte du visage pour le crop (ratio, ex: 0.2 = 20%). */
export const FACE_PADDING = 0.25;
