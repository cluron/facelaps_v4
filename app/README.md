# FaceLaps (app)

Application **Node.js + TypeScript** pour créer des timelapses de visages : détection du bon visage, extraction, alignement (redressement), mise à la même taille, puis montage vidéo. Interface web moderne, sans Python.

## Prérequis

- **Node.js** 20 ou plus récent (LTS recommandé, ex. 22)
- **FFmpeg** installé et disponible dans le PATH (pour la génération vidéo)
- Dossiers du pipeline (créés automatiquement au besoin) :
  - `0_template_photos` — photos de référence du visage à reconnaître
  - `1_input` — photos à traiter
  - `2_rejected` — photos rejetées (non reconnues ou supprimées à la main)
  - `3_validated` — visages extraits et validés (alignés, même taille)
  - `4_video` — vidéos générées

## Installation

```bash
cd app
npm install
```

## Modèles IA (obligatoire pour l’extraction)

Avant la première extraction, téléchargez les modèles face-api :

```bash
npm run models
```

Cela remplit `server/models/` avec les fichiers nécessaires (détection, landmarks, reconnaissance).

> **En cas d’erreur** (ex. `TextEncoder is not a constructor`) au premier lancement de l’extraction : le bundle TensorFlow.js peut être sensible à l’environnement Node. Vérifiez que Node est en 20+ et que le dossier `server/models` contient bien les 6 fichiers téléchargés. Si le problème persiste, vous pouvez garder l’UI Node pour la vérification et la vidéo, et utiliser l’ancien script Python uniquement pour l’étape d’extraction.

## Lancement

```bash
npm run dev
```

- **API** : http://localhost:3001  
- **Interface** : http://localhost:5173 (dev), avec proxy vers l’API

Ouvrez http://localhost:5173 dans le navigateur.

### C’est quoi Vite ?

**Vite** est l’outil qui sert et compile la partie « interface » (client) du projet. Concrètement :

- En **dev** (`npm run dev`), Vite lance un serveur sur le port 5173 qui affiche l’UI React, recompile à chaque modification, et redirige les appels `/api` et `/files` vers le serveur Node (port 3001).
- En **build** (`npm run build`), Vite produit les fichiers statiques (HTML, JS, CSS) dans `client/dist`, que le serveur Express peut servir en production.

On pourrait faire la même chose avec Webpack ou autre ; Vite est simplement plus rapide et simple à configurer pour un front React/TypeScript moderne, sans dette technique.

## Utilisation

1. **Templates** — Mettez dans `0_template_photos` quelques photos du visage à reconnaître (même personne, face de préférence).
2. **Photos source** — Mettez les photos à analyser dans `1_input`.
3. **Extraction** — Cliquez sur « Lancer l’extraction ». Les visages reconnus sont extraits, redressés (selon les yeux), recadrés et redimensionnés à 512×512, puis enregistrés dans `3_validated`. Les autres images sont déplacées dans `2_rejected`.
4. **Vérification** — Dans l’onglet « Vérification », cliquez sur les images à retirer du timelapse, puis « Supprimer » pour les envoyer dans `2_rejected`.
5. **Vidéo** — Choisissez le nombre d’images par seconde (fps) et générez la vidéo. Option : concaténer plusieurs MP4 du dossier `4_video`.

## Structure technique

- **client/** — React (TypeScript), interface en 5 étapes ; build et dev via Vite (voir ci‑dessus)
- **server/** — Express, API REST ; services :
  - **face** — @vladmandic/face-api (détection, landmarks, descripteur), sharp (alignement + resize)
  - **video** — FFmpeg (concat + encodage)
- Les dossiers `0_…` à `4_…` sont au **niveau du projet** (parent du dossier `app`), pour rester compatibles avec l’ancien workflow Python.

## Configuration (seuil de similarité)

Dans `server/src/config.ts` :

- `SIMILARITY_THRESHOLD` (défaut 0.6) — plus haut = plus strict sur la reconnaissance
- `FACE_OUTPUT_SIZE` (512) — taille du carré de sortie
- `FACE_PADDING` (0.25) — marge autour du visage avant crop

## Licence

MIT.
