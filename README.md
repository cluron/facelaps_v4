# FaceLaps

Un outil pour détecter, aligner et extraire des visages à partir d'images.

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

## Processus de traitement des visages

Le traitement des visages suit un ordre précis pour garantir un alignement correct :

1. Détection initiale
   - Détection du visage dans l'image
   - Extraction des points caractéristiques (landmarks) sur l'image entière
   - Calcul des centres des yeux

2. Vérification de l'orientation
   - Ajout des offsets aux coordonnées pour le test d'harmonie
   - Calcul du ratio d'harmonie avec les coordonnées ajustées
   - Conservation des coordonnées originales pour le traitement final

3. Traitement final
   - Calcul de l'angle de rotation avec les coordonnées originales
   - Calcul du facteur d'échelle
   - Redimensionnement de l'image entière
   - Application de la rotation
   - Ajout des bordures
   - Recadrage final centré sur les yeux

## Utilisation
```bash
# Extraction et traitement des visages
./facelaps.py extract -t template_photos -s input -r rejected -op validated

# Création d'une vidéo
./facelaps.py make-video -i validated -o video -f 7

# Concaténation de vidéos
./facelaps.py concatenate-videos -s video
```
