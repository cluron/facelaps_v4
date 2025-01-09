# FaceLaps

Un outil pour créer des timelapse de visages à partir d'une série de photos.

## Fonctionnalités

- Détection et extraction automatique des visages
- Alignement intelligent des visages basé sur les points de repère
- Vérification par lots avec interface graphique
- Création de vidéos avec transitions fluides
- Concaténation de plusieurs vidéos

## Configuration

Les paramètres peuvent être ajustés dans `config.py` :

- `sensibility` : Seuil de similarité (0.80)
  - Plus la valeur est basse, plus le script acceptera des visages différents
  - Valeurs recommandées : entre 0.75 et 0.85

- `harmony_ratio` : Ratio d'harmonie pour l'orientation du visage (0.75)
  - Contrôle l'angle acceptable du visage
  - Plus la valeur est basse, plus le script acceptera des visages non frontaux

- `quality_check_scale_factor` : Facteur de qualité (10.0)
  - Contrôle la qualité minimale acceptable des images
  - Augmenter cette valeur acceptera des images de plus basse qualité

## Utilisation

### 1. Extraction des visages
```bash
# Extraction simple
./facelaps.py extract -t template_photos -s 1_input -r 2_rejected -op 3_validated

# Extraction suivie de vérification par lots (grid par défaut 10x10)
./facelaps.py extract -t template_photos -s 1_input -r 2_rejected -op 3_validated --batch-verify

# Extraction avec vérification par lots et grid personnalisée
./facelaps.py extract -t template_photos -s 1_input -r 2_rejected -op 3_validated --batch-verify --grid 5x4
```
Options :
- `-t` : Dossier contenant les photos de référence
- `-s` : Dossier contenant les photos à traiter
- `-r` : Dossier pour les photos rejetées
- `-op` : Dossier pour les visages validés
- `--batch-verify` : Lance la vérification par lots après l'extraction
- `--grid` : Taille de la grille pour la vérification (défaut: 10x10)

### 2. Vérification par lots (optionnel)
```bash
# Avec la grid par défaut (10x10)
./facelaps.py batch-verify -i 3_validated

# Avec une grid personnalisée
./facelaps.py batch-verify -i 3_validated --grid 5x4
```
Interface graphique permettant de :
- Visualiser plusieurs visages simultanément
- Marquer/démarquer les visages à supprimer par simple clic
- Naviguer entre les pages avec les flèches < et >
- Voir la progression (Page X/Y)
- Supprimer les visages marqués en un clic

Options :
- `-i` : Dossier contenant les visages à vérifier
- `--grid` : Taille de la grille (défaut: 10x10)

### 3. Création de la vidéo
```bash
./facelaps.py make-video -i 3_validated -o 4_video -f 7 -m 0.5
```
Options :
- `-i` : Dossier contenant les visages validés
- `-o` : Dossier de sortie pour la vidéo
- `-f` : Images par seconde (ex: 7 pour 7 images/sec)
- `-m` : Force du morphing entre les images (optionnel)
  - 0.0 : Transition par fondu enchaîné simple
  - 0.5 : Mélange équilibré entre morphing et fondu (défaut)
  - 1.0 : Morphing complet entre les visages

### 4. Concaténation de vidéos (optionnel)
```bash
./facelaps.py concatenate-videos -s 4_video
```
- `-s` : Dossier contenant les vidéos à concaténer

## Workflow recommandé

1. **Préparation** :
   - Placer les photos de référence dans le dossier template_photos
   - Placer les photos à traiter dans le dossier 1_input

2. **Traitement** :
   - Extraire les visages avec `extract`
   - Vérifier et affiner la sélection avec `batch-verify`
   - Créer la vidéo avec `make-video`
   - Optionnellement, concaténer plusieurs vidéos avec `concatenate-videos`

## Structure des dossiers

```
project/
├── template_photos/    # Photos de référence
├── 1_input/           # Photos à traiter
├── 2_rejected/        # Photos rejetées
├── 3_validated/       # Visages extraits et validés
└── 4_video/          # Vidéos générées
```

## Dépendances

- OpenCV
- NumPy
- MediaPipe

## Licence

Ce projet est sous licence MIT. Voir le fichier LICENSE pour plus de détails.

## Installation

1. Cloner le repository :
```bash
git clone https://github.com/cluron/facelaps2.git
cd facelaps2
```

2. Créer un environnement virtuel (recommandé) :
```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
# ou
venv\Scripts\activate     # Windows
```

3. Installation (choisir une méthode) :

   a. Installation rapide des dépendances :
   ```bash
   pip install -r requirements.txt
   ```

   b. Installation complète du package :
   ```bash
   pip install -e .
   ```

4. Créer la structure des dossiers :
```bash
mkdir template_photos 1_input 2_rejected 3_validated 4_video
```