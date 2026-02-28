# FaceLaps

Timelapse de visages : détection, extraction, alignement, montage vidéo.

**Stack :** Node.js 24+, TypeScript, React.

> **Important :** Toutes les commandes se lancent **à la racine du repo** (`facelaps_v4/`), pas dans un sous-dossier `app/`.

## Prérequis

- **Node.js 24+**
- **FFmpeg** dans le PATH (génération vidéo)
- Dossiers à la racine : `0_template_photos`, `1_input`, `2_rejected`, `3_validated`, `4_video` (créés au besoin)

## Installation

```bash
npm install
npm run models
```

`npm run models` télécharge les modèles face-api dans `server/models/` (une fois).

## Lancement

```bash
npm run dev
```

- **API** : http://localhost:3001 (ou 3002, 3003… si 3001 est déjà pris)
- **UI** : http://localhost:5173 (Vite peut utiliser 5174 si 5173 est pris)

Si des processus utilisent déjà ces ports, arrête-les ou laisse le script choisir un port libre pour l’API.

## Utilisation

1. **Templates** — Mettre dans `0_template_photos` quelques photos du visage à reconnaître.
2. **Photos source** — Mettre les photos à traiter dans `1_input`.
3. **Extraction** — Lancer l’extraction depuis l’UI : visages reconnus → alignés, recadrés 512×512 → `3_validated` ; les autres → `2_rejected`.
4. **Vérification** — Grille : clic pour marquer les images à retirer, « Supprimer » pour les envoyer dans `2_rejected`.
5. **Vidéo** — Choisir les fps, générer la vidéo dans `4_video`. Option : concaténer plusieurs MP4.

## Structure

```
facelaps_v4/
├── client/          # UI React (Vite)
├── server/          # API Express + face + vidéo
│   ├── src/
│   └── models/      # modèles face-api (npm run models)
├── scripts/         # download-models.js
├── 0_template_photos/
├── 1_input/
├── 2_rejected/
├── 3_validated/
└── 4_video/
```

## Config

`server/src/config.ts` : `SIMILARITY_THRESHOLD`, `FACE_OUTPUT_SIZE`, `FACE_PADDING`.

## Dépannage

- **`Cannot find module @rollup/rollup-darwin-arm64`** ou **esbuild : wrong platform (@esbuild/darwin-x64 vs darwin-arm64)**  
  Souvent dû à un `npm install` fait sous une autre architecture (ex. Rosetta) que celle utilisée pour lancer l’app. **À la racine du projet**, avec Node 24 et en natif (pas sous Rosetta) :

  ```bash
  rm -rf node_modules package-lock.json && npm install
  ```

  Puis relancer `npm run dev`.

## Licence

MIT.
