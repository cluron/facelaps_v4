#!/usr/bin/env python3

# Imports de nos modules
from utils import *

# Variables de contrôle
model = "full"
sensibility = 0.80
dist_between_eyes_ref = 250
quality_check_scale_factor = 10.0
harmony_ratio = 0.75
croping_size_x = 1100
croping_size_y = 1000
border_addition = 2000

# Variables de transition adaptative
adaptive_transition = True  # Active les transitions adaptatives
min_morph_strength = 0.2   # Plus de fondu enchaîné, pour images similaires
max_morph_strength = 1.0   # Plus de morphing, pour images différentes
similarity_threshold = 0.6  # Seuil pour décider du type de transition

# Variables techniques
version = "2.3-arm"
max_faces = 5 