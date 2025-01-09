# FaceLaps

Un outil pour créer des timelapse de visages à partir d'une série de photos.

## Fonctionnalités

- Détection et extraction automatique des visages
- Alignement intelligent des visages basé sur les points de repère
- Vérification par lots avec interface graphique et analyse de qualité
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
./facelaps.py extract -t 0_template_photos -s 1_input -r 2_rejected -op 3_validated

# Extraction suivie de vérification par lots (grid par défaut 10x10)
./facelaps.py extract -t 0_template_photos -s 1_input -r 2_rejected -op 3_validated --batch-verify

# Extraction avec vérification par lots et grid personnalisée
./facelaps.py extract -t 0_template_photos -s 1_input -r 2_rejected -op 3_validated --batch-verify --grid 5x4
```

### 2. Vérification par lots
```bash
# Avec la grid par défaut (10x10)
./facelaps.py batch-verify -i 3_validated

# Avec une grid personnalisée
./facelaps.py batch-verify -i 3_validated --grid 5x4
```

L'interface de vérification par lots offre :

- **Analyse de qualité automatique**
  - Score de qualité pour chaque image (0-100%)
  - Classification par niveau :
    - Vert : Bonne qualité (≥ 75%)
    - Jaune : Qualité acceptable (60-74%)
    - Rouge : Qualité médiocre (< 60%)
  - Tri automatique (moins bonnes images en premier)

- **Interface intuitive**
  - Navigation par pages avec compteur
  - Clic simple pour marquer/démarquer une image
  - Visualisation en grand avec Espace
  - Retour à la grille avec Espace/Échap/q
  - Bouton "Supprimer" pour valider les rejets
  - Quitter avec le bouton X, Échap ou q

### 3. Création de la vidéo
```bash
./facelaps.py make-video -i 3_validated -o 4_video -f 7 -m 0.5
```
Options :
- `-i` : Dossier contenant les visages validés
- `-o` : Dossier de sortie pour la vidéo
- `-f` : Images par seconde (ex: 7 pour 7 images/sec)
- `-m` : Force du morphing entre les images
  - 0.0 : Transition par fondu enchaîné simple
  - 0.5 : Mélange équilibré entre morphing et fondu (défaut)
  - 1.0 : Morphing complet entre les visages

### 4. Concaténation de vidéos
```bash
./facelaps.py concatenate-videos -s 4_video
```
- `-s` : Dossier contenant les vidéos à concaténer

## Workflow recommandé

1. **Préparation** :
   - Placer les photos de référence dans `0_template_photos`
   - Placer les photos à traiter dans `1_input`

2. **Traitement** :
   - Extraire les visages avec `extract`
   - Vérifier et affiner la sélection avec `batch-verify`
   - Créer la vidéo avec `make-video`
   - Optionnellement, concaténer plusieurs vidéos avec `concatenate-videos`

## Structure des dossiers

```
project/
├── 0_template_photos/  # Photos de référence
├── 1_input/           # Photos à traiter
├── 2_rejected/        # Photos rejetées
├── 3_validated/       # Visages extraits et validés
└── 4_video/          # Vidéos générées
```

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
mkdir 0_template_photos 1_input 2_rejected 3_validated 4_video
```

## Dépendances

- OpenCV
- NumPy
- MediaPipe

## Licence

Ce projet est sous licence MIT. Voir le fichier LICENSE pour plus de détails.