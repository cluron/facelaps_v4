# Fonctionnalités de l’ancien script (Python) non reprises dans v4

Ce fichier liste ce qui existait dans l’ancien pipeline FaceLaps (Python / MediaPipe / OpenCV) et qui n’a pas été porté dans la version 4 (Node/TS, face-api, ffmpeg). À traiter plus tard si besoin.

---

## 1. Vidéo : transitions entre images

**Ancien script** (`video_processing.py`) :
- **Crossfade** (fondu) entre chaque paire d’images : `addWeighted` sur quelques frames.
- Option **`--adaptive`** : transition adaptative selon la similarité entre 2 images consécutives (SSIM) — images très similaires → transition douce, images différentes → morphing plus marqué.
- **Morphing** optionnel entre visages (landmarks MediaPipe, homographie).
- Vidéo construite avec **OpenCV** (VideoWriter) : chaque image tient un nombre de frames calculé à partir du fps, avec des frames de transition entre deux images.

**v4** : concaténation simple des images via ffmpeg, sans crossfade ni morphing.

**À faire plus tard** : crossfade, transitions adaptatives, et éventuellement morphing (implémentation possible côté serveur avec OpenCV ou ffmpeg filter_complex, ou génération des frames en Node puis ffmpeg).

---

## 2. Vérification : tri et affichage par qualité

**Ancien script** (`batch_verify.py` + `face_quality.py`) :
- **Tri des images par score de qualité** (netteté + contraste), **les moins bonnes en premier**.
- **Couleur par cellule** selon le score :
  - Vert : bonne qualité (≥ 75 %),
  - Jaune : acceptable (60–74 %),
  - Rouge : médiocre (< 60 %).
- Légende dans l’interface : "Les images sont triées par qualité (moins bonnes en premier)", etc.

**v4** : pas de tri par qualité dans l’étape Vérification, pas d’indicateur couleur (vert/jaune/rouge).

**À faire plus tard** : calcul du score de qualité côté client (ou API) pour les validés, tri optionnel "moins bonnes en premier", et indicateurs couleur sur les cartes (ex. bord ou badge selon score).

---

## 3. Récapitulatif

| Fonctionnalité | Ancien script | v4 |
|----------------|----------------|-----|
| Transitions vidéo (crossfade / morphing / adaptatif) | Oui | Non (concat simple) |
| Tri des validés par qualité (moins bonnes en premier) | Oui | Non |
| Indicateur couleur qualité (vert / jaune / rouge) en vérification | Oui | Non |
| Option `--adaptive` pour la vidéo | Oui | Non |

---

*Référence : ancien code dans l’historique git (commit avant suppression des fichiers Python).*
