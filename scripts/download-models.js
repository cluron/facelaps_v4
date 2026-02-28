#!/usr/bin/env node
/**
 * Télécharge les modèles face-api (vladmandic) dans server/models.
 * Nécessaire avant la première utilisation de l'extraction.
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = 'https://raw.githubusercontent.com/vladmandic/face-api/master/model';
const FILES = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model.bin',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model.bin',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
];

const outDir = path.join(__dirname, '..', 'server', 'models');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`${url} => ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  console.log('Téléchargement des modèles face-api dans', outDir);
  for (const file of FILES) {
    process.stdout.write(`  ${file}... `);
    try {
      const buf = await get(`${BASE}/${file}`);
      fs.writeFileSync(path.join(outDir, file), buf);
      console.log('OK');
    } catch (e) {
      console.log('ERREUR', e.message);
    }
  }
  console.log('Terminé.');
})();
