import cv2 as cv
import os
import numpy as np
from utils import bcolors
import logging

class FaceQualityAnalyzer:
    def __init__(self, validated_dir, rejected_dir):
        self.validated_dir = validated_dir
        self.rejected_dir = rejected_dir
        self.logger = logging.getLogger(__name__)

    def get_image_quality(self, image_path):
        """Analyse la qualité d'une image spécifique"""
        try:
            # Lire l'image
            image = cv.imread(str(image_path))
            if image is None:
                return {'score': 0, 'issues': ['Image non lisible']}
                
            # Calculer le score de qualité
            quality_score = self._calculate_quality_score(image)
            
            # Convertir le score en pourcentage
            score_percent = quality_score * 100
            
            # Déterminer les problèmes potentiels
            issues = []
            if score_percent < 60:
                issues.append('Qualité médiocre')
            elif score_percent < 75:
                issues.append('Qualité acceptable')
            
            return {
                'score': score_percent,
                'issues': issues
            }
            
        except Exception as e:
            self.logger.error(f"Error analyzing image quality: {str(e)}")
            return {'score': 0, 'issues': [f'Erreur: {str(e)}']}

    def analyze_faces(self):
        """Analyse la qualité des visages dans le dossier validé"""
        self.logger.info("Starting face quality analysis...")
        
        # Vérifier que les dossiers existent
        if not os.path.exists(self.validated_dir):
            self.logger.error(f"Validated directory does not exist: {self.validated_dir}")
            return "No validated faces to analyze"
            
        # Obtenir la liste des fichiers
        files = [f for f in os.listdir(self.validated_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
        if not files:
            self.logger.warning("No images found in validated directory")
            return "No images found in validated directory"
            
        total_files = len(files)
        self.logger.info(f"Found {total_files} files to analyze")
        
        # Statistiques
        total_analyzed = 0
        total_good_quality = 0
        total_poor_quality = 0
        
        for image_file in files:
            self.logger.info(f"Analyzing {image_file}...")
            image_path = os.path.join(self.validated_dir, image_file)
            
            try:
                # Lire l'image
                image = cv.imread(image_path)
                if image is None:
                    self.logger.warning(f"Could not read image: {image_file}")
                    continue
                    
                # Analyser la qualité
                quality_score = self._calculate_quality_score(image)
                
                if quality_score >= 0.7:  # Seuil arbitraire
                    total_good_quality += 1
                else:
                    total_poor_quality += 1
                    # Optionnellement, déplacer vers rejected
                    # os.rename(image_path, os.path.join(self.rejected_dir, image_file))
                
                total_analyzed += 1
                
            except Exception as e:
                self.logger.error(f"Error analyzing {image_file}: {str(e)}")
                continue
        
        # Préparer le rapport
        report = f"""
Face Quality Analysis Report:
---------------------------
Total faces analyzed: {total_analyzed}
Good quality faces: {total_good_quality}
Poor quality faces: {total_poor_quality}
Quality ratio: {(total_good_quality/total_analyzed*100):.1f}% good quality
"""
        
        return report
        
    def _calculate_quality_score(self, image):
        """Calcule un score de qualité pour une image
        Retourne un score entre 0 et 1, où 1 est la meilleure qualité"""
        try:
            # Convertir en niveaux de gris
            gray = cv.cvtColor(image, cv.COLOR_BGR2GRAY)
            
            # Calculer la variance du laplacien (netteté)
            laplacian_var = cv.Laplacian(gray, cv.CV_64F).var()
            
            # Calculer l'histogramme (contraste)
            hist = cv.calcHist([gray], [0], None, [256], [0, 256])
            hist_norm = hist.ravel()/hist.sum()
            hist_entropy = -np.sum(hist_norm[hist_norm>0]*np.log2(hist_norm[hist_norm>0]))
            
            # Normaliser les scores
            sharpness_score = min(1.0, laplacian_var / 500)  # 500 est une valeur arbitraire
            contrast_score = hist_entropy / 8  # 8 est le maximum théorique pour 256 niveaux
            
            # Combiner les scores (on peut ajuster les poids)
            final_score = 0.6 * sharpness_score + 0.4 * contrast_score
            
            return final_score
            
        except Exception as e:
            self.logger.error(f"Error calculating quality score: {str(e)}")
            return 0.0  # En cas d'erreur, retourner le score minimum 