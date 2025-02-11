#!/usr/bin/env python3

# Imports de base
import os
import sys
import fcntl
import ctypes
import logging
import atexit

# Configuration du logging AVANT TOUT
logging.basicConfig(level=logging.ERROR)
logging.getLogger('absl').setLevel(logging.FATAL)
logging.getLogger('tensorflow').setLevel(logging.FATAL)
logging.getLogger('mediapipe').setLevel(logging.FATAL)

# Configuration silencieuse
os.environ.update({
    'TF_CPP_MIN_LOG_LEVEL': '3',
    'MEDIAPIPE_DISABLE_GPU': '1',
    'OPENCV_LOG_LEVEL': '3',
    'AUTOGRAPH_VERBOSITY': '0',
    'CPP_MIN_LOG_LEVEL': '3',
    'TF_ENABLE_ONEDNN_OPTS': '0',
    'CUDA_VISIBLE_DEVICES': '-1',
    'TF_SILENCE_DEPRECATION_WARNINGS': '1',
    'PYTHONWARNINGS': 'ignore',
    'FORCE_MEDIAPIPE_CPU': '1',
    'PYOPENGL_PLATFORM': 'egl',
    'DISPLAY': '',
    'MEDIAPIPE_USE_GPU': '0',
    'TF_FORCE_GPU_ALLOW_GROWTH': 'false',
    'CUDA_CACHE_DISABLE': '1',
    'GLOG_minloglevel': '3',
    'PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION': 'python',
    'GLOG_logtostderr': '0',
    'GLOG_stderrthreshold': '3',
    'ABSL_LOGGING_INTERNAL_LOG_LEVEL': '3',
    'ABSL_FLAGS_alsologtostderr': '0'
})

# Imports standards
import cv2 as cv
import numpy as np

# Import et configuration de MediaPipe
import mediapipe as mp

# Configuration de MediaPipe
mp.solutions.face_mesh.FaceMesh._ENABLE_GPU = False
mp.solutions.face_mesh.FACEMESH_TESSELATION = []
mp.solutions.face_mesh.FACEMESH_CONTOURS = []
mp.solutions.face_mesh.FACEMESH_IRISES = []

# Configuration des calculateurs MediaPipe
mp.solutions.drawing_utils.DrawingSpec = lambda color=(0,0,0), thickness=1, circle_radius=1: None

mp_face_detection = mp.solutions.face_detection
mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils

# Initialiser les détecteurs une seule fois avec des paramètres minimaux
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=True,
    max_num_faces=1,
    min_detection_confidence=0.5,
    refine_landmarks=False,
    min_tracking_confidence=0.5
)

face_detection = mp_face_detection.FaceDetection(
    model_selection=1,
    min_detection_confidence=0.5
)

# Imports de nos modules
from utils import *
from config import model, sensibility, dist_between_eyes_ref, quality_check_scale_factor, harmony_ratio, croping_size_x, croping_size_y, border_addition, max_faces

# Configuration du logger spécifique
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

def get_face_encodings(image):
    """Extrait les caractéristiques du visage en utilisant MediaPipe Face Mesh"""
    try:
        # Vérifier si l'image est trop petite
        h, w = image.shape[:2]
        min_size = 100
        if h < min_size or w < min_size:
            scale = min_size / min(h, w)
            new_size = (int(w * scale), int(h * scale))
            image = cv.resize(image, new_size)
            h, w = image.shape[:2]

        # Convertir l'image en RGB une seule fois
        rgb_image = cv.cvtColor(image, cv.COLOR_BGR2RGB)
        
        # Désactiver temporairement toute sortie
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        sys.stdout = open(os.devnull, 'w')
        sys.stderr = open(os.devnull, 'w')
        
        try:
            # Traiter l'image avec MediaPipe
            results = face_mesh.process(rgb_image)
        finally:
            # Restaurer les sorties
            sys.stdout = old_stdout
            sys.stderr = old_stderr

        if not results.multi_face_landmarks:
            return None

        # Extraire les points caractéristiques
        landmarks = np.array([[lm.x * w, lm.y * h, lm.z] 
                          for lm in results.multi_face_landmarks[0].landmark])
        return landmarks

    except Exception as e:
        logger.error(f"Error in face encoding: {str(e)}")
        return None

def compare_faces(known_encoding, face_encoding, tolerance=0.85):
    """Compare deux visages en utilisant la similarité cosinus"""
    if known_encoding is None or face_encoding is None:
        return 0

    try:
        # Normaliser les encodages
        known_norm = known_encoding / np.linalg.norm(known_encoding)
        face_norm = face_encoding / np.linalg.norm(face_encoding)
        
        # Calculer uniquement la similarité cosinus
        similarity = np.dot(known_norm.flatten(), face_norm.flatten())
        
        return similarity
        
    except Exception as e:
        logger.error(f"{bcolors.FAIL}Error during face comparison: {str(e)}{bcolors.RESET}")
        return 0

def get_face_location(image):
    """Détecte les visages dans l'image et retourne leurs coordonnées"""
    with mp_face_detection.FaceDetection(
        model_selection=1 if model == "full" else 0,
        min_detection_confidence=sensibility * 0.8) as face_detection:  # Réduire légèrement la sensibilité
        
        results = face_detection.process(cv.cvtColor(image, cv.COLOR_BGR2RGB))
        if not results.detections:
            return []
        
        locations = []
        for detection in results.detections:
            bbox = detection.location_data.relative_bounding_box
            h, w, _ = image.shape
            
            # Calculer les coordonnées de base
            x = int(bbox.xmin * w)
            y = int(bbox.ymin * h)
            width = int(bbox.width * w)
            height = int(bbox.height * h)
            
            # Ajouter une marge de 40% pour capturer plus de contexte
            margin_x = int(width * 0.4)
            margin_y = int(height * 0.4)
            
            # Ajuster les coordonnées en respectant les limites de l'image
            top = max(0, y - margin_y)
            bottom = min(h, y + height + margin_y)
            left = max(0, x - margin_x)
            right = min(w, x + width + margin_x)
            
            locations.append((top, right, bottom, left))  # (top, right, bottom, left)
        
        return locations

def get_facial_landmarks(image):
    """Extrait les points caractéristiques du visage"""
    try:
        # Ajouter un padding autour du visage
        h, w = image.shape[:2]
        padding = int(min(h, w) * 0.1)  # 10% de padding
        padded_image = cv.copyMakeBorder(image, padding, padding, padding, padding, 
                                       cv.BORDER_CONSTANT, value=[0, 0, 0])
        
        with mp_face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=max_faces,
            min_detection_confidence=sensibility) as face_mesh:
            
            results = face_mesh.process(cv.cvtColor(padded_image, cv.COLOR_BGR2RGB))
            if not results.multi_face_landmarks:
                return None
            
            landmarks_dict = {
                'left_eye': [],
                'right_eye': [],
                'nose_tip': []
            }
            
            # Points spécifiques pour MediaPipe
            LEFT_EYE = [33, 133, 157, 158, 159, 160, 161, 173, 246]
            RIGHT_EYE = [362, 263, 386, 387, 388, 389, 390, 398, 466]
            NOSE_TIP = [1]
            
            landmarks = results.multi_face_landmarks[0].landmark
            
            # Ajuster les coordonnées pour tenir compte du padding
            for idx in LEFT_EYE:
                landmarks_dict['left_eye'].append([
                    landmarks[idx].x * w + padding,
                    landmarks[idx].y * h + padding
                ])
            for idx in RIGHT_EYE:
                landmarks_dict['right_eye'].append([
                    landmarks[idx].x * w + padding,
                    landmarks[idx].y * h + padding
                ])
            for idx in NOSE_TIP:
                landmarks_dict['nose_tip'].append([
                    landmarks[idx].x * w + padding,
                    landmarks[idx].y * h + padding
                ])
            
            return landmarks_dict
            
    except Exception as e:
        return None

def map_reference_image(folder_in):
    """Analyse et encode les images de référence"""
    logger.info(f"Found {len(os.listdir(folder_in))} reference images")
    
    ref_encodings = []
    ref_landmarks = []

    for images in sorted(os.listdir(folder_in)):
        path = os.path.join(folder_in, images)
        img = cv.imread(path)
        if img is None:
            logger.error(f"└── {bcolors.FAIL}✗ Could not read: {images}{bcolors.RESET}")
            continue

        try:
            # Détecter les visages
            locations = get_face_location(img)
            
            if len(locations) != 1:
                if len(locations) == 0:
                    logger.error(f"└── {bcolors.FAIL}✗ No face in: {images}{bcolors.RESET}")
                else:
                    logger.error(f"└── {bcolors.FAIL}✗ Multiple faces in: {images}{bcolors.RESET}")
                continue

            # Obtenir l'encodage et les points caractéristiques
            top, right, bottom, left = locations[0]
            face_image = img[top:bottom, left:right]
            encoding = get_face_encodings(face_image)
            landmarks = get_facial_landmarks(face_image)

            if encoding is not None and landmarks is not None:
                ref_encodings.append(encoding)
                ref_landmarks.append(landmarks)
                logger.info(f"└── {bcolors.OK}✓ Encoded: {images}{bcolors.RESET}")
            else:
                logger.error(f"└── {bcolors.FAIL}✗ Failed to encode: {images}{bcolors.RESET}")

        except Exception as e:
            logger.error(f"└── {bcolors.FAIL}✗ Error processing: {images}{bcolors.RESET}")

    if len(ref_encodings) < 1:
        logger.error(f"{bcolors.FAIL}✗ No valid reference faces found{bcolors.RESET}")
        sys.exit(1)

    logger.info(f"\n{bcolors.OK}✓ Successfully loaded {len(ref_encodings)} reference faces{bcolors.RESET}\n")
    return ref_encodings, ref_landmarks

def get_face_status_formatted(status, similarity=None, error_details=None):
    """Retourne le statut formaté avec icône et couleur"""
    if status == "matched":
        return f"{bcolors.OK}✓ matched ({similarity:.3f}){bcolors.RESET}"
    elif status == "not encoded":
        return f"{bcolors.WARNING}⚠ not encoded{bcolors.RESET}"
    elif status == "no match":
        return f"{bcolors.FAIL}✗ no match ({similarity:.3f}){bcolors.RESET}"
    elif status == "not front":
        return f"{bcolors.WARNING}⚠ not front{bcolors.RESET}"
    elif status == "low quality":
        return f"{bcolors.WARNING}⚠ low quality{bcolors.RESET}"
    else:
        error_msg = f" ({error_details})" if error_details else ""
        return f"{bcolors.FAIL}✗ error{error_msg}{bcolors.RESET}"

def save_rejected_face(img_original, top, bottom, left, right, rejected_path):
    """Sauvegarde un visage rejeté après vérification"""
    try:
        # Extraire la portion de l'image
        rejected_face = img_original[top:bottom, left:right]
        
        # Vérifier que l'image n'est pas noire ou vide
        if rejected_face is None or rejected_face.size == 0:
            return False
            
        # Vérifier que l'image n'est pas complètement noire
        if np.mean(rejected_face) < 1.0:  # Seuil pour détecter une image noire
            return False
            
        # Sauvegarder l'image
        cv.imwrite(rejected_path, rejected_face)
        return True
        
    except Exception as e:
        logger.error(f"Error saving rejected face: {str(e)}")
        return False

def extract_faces(source_dir, template_dir, rejected_dir, validated_dir):
    """Extrait et aligne les visages des photos"""
    logger.info(f"Starting face extraction process...")
    logger.info(f"Source directory: {source_dir}")
    logger.info(f"Template directory: {template_dir}")
    
    # Vérifier l'existence des dossiers
    if not os.path.exists(source_dir):
        logger.error(f"Source directory does not exist: {source_dir}")
        return
    if not os.path.exists(template_dir):
        logger.error(f"Template directory does not exist: {template_dir}")
        return
        
    # Obtenir la liste des fichiers
    template_files = [f for f in os.listdir(template_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    source_files = [f for f in os.listdir(source_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    
    if not template_files:
        logger.error(f"No template images found in {template_dir}")
        return
    if not source_files:
        logger.error(f"No source images found in {source_dir}")
        return
        
    logger.info(f"Found {len(template_files)} template images and {len(source_files)} source images")
    
    # Traiter les images template
    template_encodings = []
    for template_file in template_files:
        logger.info(f"Processing template image: {template_file}")
        template_path = os.path.join(template_dir, template_file)
        template_image = cv.imread(template_path)
        if template_image is None:
            logger.warning(f"Could not read template image: {template_file}")
            continue
            
        template_encoding = get_face_encodings(template_image)
        if template_encoding is not None:
            template_encodings.append(template_encoding)
            logger.info(f"Successfully extracted template face from {template_file}")
        else:
            logger.warning(f"No face found in template image: {template_file}")
    
    if not template_encodings:
        logger.error("No valid template faces found. Aborting.")
        return
        
    logger.info(f"Successfully processed {len(template_encodings)} template faces")
    
    # Traiter les images source
    processed_count = 0
    for source_file in source_files:
        logger.info(f"Processing source image: {source_file}")
        source_path = os.path.join(source_dir, source_file)
        source_image = cv.imread(source_path)
        if source_image is None:
            logger.warning(f"Could not read source image: {source_file}")
            continue
            
        source_encoding = get_face_encodings(source_image)
        if source_encoding is not None:
            # Comparer avec les templates
            max_similarity = max(compare_faces(template_encoding, source_encoding) 
                               for template_encoding in template_encodings)
            
            if max_similarity >= sensibility:
                logger.info(f"Face matched in {source_file} with similarity {max_similarity:.2f}")
                # Déplacer vers validated
                os.rename(source_path, os.path.join(validated_dir, source_file))
                processed_count += 1
            else:
                logger.warning(f"Face not matched in {source_file} (similarity: {max_similarity:.2f})")
                # Déplacer vers rejected
                os.rename(source_path, os.path.join(rejected_dir, source_file))
        else:
            logger.warning(f"No face found in source image: {source_file}")
            # Déplacer vers rejected
            os.rename(source_path, os.path.join(rejected_dir, source_file))
    
    logger.info(f"Processing complete. {processed_count} images validated.")