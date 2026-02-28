// Polyfill pour TensorFlow.js / face-api en Node (le bundle attend util.TextEncoder)
import * as nodeUtil from 'node:util';
(globalThis as any).util = nodeUtil;
(globalThis as any).TextEncoder = nodeUtil.TextEncoder;
(globalThis as any).TextDecoder = nodeUtil.TextDecoder;

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pipeline from './routes/pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

app.use(cors());
app.use(express.json());

app.use('/api', pipeline);

// Servir les images/vidéos des dossiers du projet (folder = templates | input | rejected | validated | video)
app.get('/files/:folder/:filename', (req, res) => {
  const { folder, filename } = req.params;
  const allowed: Record<string, string> = {
    templates: '0_template_photos',
    input: '1_input',
    rejected: '2_rejected',
    validated: '3_validated',
    video: '4_video',
  };
  const realFolder = allowed[folder];
  if (!realFolder || !filename || filename.includes('..')) return res.status(400).end();
  const root = path.resolve(__dirname, '..', '..');
  const file = path.join(root, realFolder, filename);
  res.sendFile(file, (err) => {
    if (err) res.status(404).end();
  });
});

// En prod, servir le client buildé (Vite sort dans client/dist)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`FaceLaps API: http://localhost:${PORT}`);
});
