#!/usr/bin/env python3

# Imports de nos modules (qui contiennent déjà la redirection stderr)
from utils import *
from config import model, sensibility, dist_between_eyes_ref, quality_check_scale_factor, harmony_ratio, croping_size_x, croping_size_y, border_addition, max_faces

import cv2 as cv
import numpy as np
import sys
import logging
import mediapipe as mp  # Ajout de l'import mediapipe

# Initialisation des modules MediaPipe
mp_face_detection = mp.solutions.face_detection  # Pour la détection des visages
mp_face_mesh = mp.solutions.face_mesh  # Pour les points caractéristiques

def setup_logger():
    """Configure le logger avec un format personnalisé"""
    class ColoredFormatter(logging.Formatter):
        def format(self, record):
            # Formats spéciaux pour différents types de messages
            if record.levelno == logging.INFO:
                if "Summary" in record.msg:
                    # Format pour le résumé
                    return f"\n{bcolors.JUST}{record.msg}{bcolors.RESET}"
                elif "Processing" in record.msg:
                    # Format pour les étapes de traitement
                    return f"{bcolors.OK}{record.msg}{bcolors.RESET}"
                else:
                    # Format standard pour INFO
                    return f"{record.msg}"
            elif record.levelno == logging.WARNING:
                # Format pour les avertissements
                return f"{bcolors.WARNING}⚠ {record.msg}{bcolors.RESET}"
            elif record.levelno == logging.ERROR:
                # Format pour les erreurs
                return f"{bcolors.FAIL}✗ {record.msg}{bcolors.RESET}"
            return record.msg

    # Configuration du logger
    logger = logging.getLogger(__name__)
    logger.setLevel(logging.INFO)
    
    # Handler pour stdout
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(ColoredFormatter())
    logger.addHandler(handler)
    
    return logger

# Initialiser le logger
logger = setup_logger()

def get_face_encodings(image):
    """Extrait les caractéristiques du visage en utilisant MediaPipe Face Mesh"""
    try:
        # Vérifier si l'image est trop petite
        h, w = image.shape[:2]
        min_size = 100  # taille minimale en pixels
        if h < min_size or w < min_size:
            # Redimensionner l'image si elle est trop petite
            scale = min_size / min(h, w)
            new_size = (int(w * scale), int(h * scale))
            image = cv.resize(image, new_size)
            h, w = image.shape[:2]

        # Ajouter un padding plus important pour les petits visages
        padding = int(min(h, w) * 0.3)  # 30% de padding
        padded_image = cv.copyMakeBorder(
            image, 
            padding, padding, padding, padding,
            cv.BORDER_CONSTANT,
            value=[0, 0, 0]
        )

        # Améliorer le contraste de l'image
        lab = cv.cvtColor(padded_image, cv.COLOR_BGR2LAB)
        l, a, b = cv.split(lab)
        clahe = cv.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
        cl = clahe.apply(l)
        enhanced_image = cv.merge((cl,a,b))
        enhanced_image = cv.cvtColor(enhanced_image, cv.COLOR_LAB2BGR)

        with mp_face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=max_faces,
            min_detection_confidence=sensibility * 0.8  # Réduire légèrement la sensibilité
        ) as face_mesh:
            
            results = face_mesh.process(cv.cvtColor(enhanced_image, cv.COLOR_BGR2RGB))
            if not results.multi_face_landmarks:
                # Essayer une seconde fois avec l'image originale si ça échoue
                results = face_mesh.process(cv.cvtColor(padded_image, cv.COLOR_BGR2RGB))
                if not results.multi_face_landmarks:
                    return None
            
            # Ajuster les coordonnées pour tenir compte du padding
            landmarks = np.array([[lm.x * w + padding, lm.y * h + padding, lm.z] 
                              for lm in results.multi_face_landmarks[0].landmark])
            return landmarks
            
    except Exception as e:
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

def extract_faces(folder_in, DIR_template_photos, DIR_rejected, DIR_validated):
    """Extrait et traite les visages des images sources"""
    # Initialisation des compteurs
    i_total_files = 0
    i_total_files_analyzed = 0
    i_total_files_rejected = 0
    i_total_files_rejected_face_not_found = 0
    i_total_faces_detected = 0
    i_total_faces_ok = 0
    i_total_faces_rejected_no_match = 0
    i_total_faces_rejected_quality_problem = 0
    i_total_faces_rejected_not_front = 0
    i_total_faces_rejected_rotation_or_export_problem = 0
    i_total_faces_rejected_encoding = 0

    # Obtenir la liste des fichiers (sans les fichiers cachés)
    files = [f for f in sorted(os.listdir(folder_in)) if not f.startswith('.')]
    i_total_files = len(files)

    # Logs plus structurés
    logger.info("┌── Starting Face Detection Process")
    logger.info(f"├── Found {i_total_files} files to process")
    logger.info("└── Loading reference faces...")

    ref_encodings, ref_landmarks = map_reference_image(DIR_template_photos)
    
    # Ajouter un titre pour la section de traitement
    logger.info(f"\n{bcolors.JUST}[Face Processing]{bcolors.RESET}")
        
    for images in files:
        progress_msg = f"Processing {i_total_files_analyzed + 1}/{i_total_files} : {images}"
        path = os.path.join(folder_in, images)
        rejected_filename_target_path = os.path.join(DIR_rejected, images)

        try:
            img = cv.imread(path)
            if img is None:
                logger.info(f"{progress_msg} - Invalid image")
                i_total_files_rejected += 1
                i_total_files_analyzed += 1
                continue

            img_original = img.copy()  # Garder une copie de l'image originale
            locations = get_face_location(img)
            i_total_faces_detected += len(locations)

            if len(locations) == 0:
                logger.info(f"{progress_msg} - No faces found")
                os.rename(path, rejected_filename_target_path)
                i_total_files_rejected_face_not_found += 1
                i_total_files_rejected += 1
                i_total_files_analyzed += 1
                continue

            faces_info = []
            # Pré-encoder tous les visages détectés et obtenir leurs landmarks
            face_encodings = []
            face_landmarks_list = []
            for face_location in locations:
                top, right, bottom, left = face_location
                face_img = img[top:bottom, left:right]
                # Encoder le visage
                encoding = get_face_encodings(face_img)
                face_encodings.append(encoding)
                # Obtenir les landmarks
                landmarks = get_facial_landmarks(face_img)
                face_landmarks_list.append(landmarks)

            # Ensuite traiter chaque visage
            for face_number, (face_location, face_encoding, face_landmarks) in enumerate(zip(locations, face_encodings, face_landmarks_list)):
                try:
                    top, right, bottom, left = face_location

                    # 2. Vérifier l'encodage
                    if face_encoding is None:
                        faces_info.append(f"F{face_number + 1}: {get_face_status_formatted('not encoded', error_details='Failed to generate face encoding')}")
                        image_final = f"{os.path.splitext(images)[0]}_{face_number + 1}{os.path.splitext(images)[1]}"
                        rejected_path = os.path.join(DIR_rejected, image_final)
                        if save_rejected_face(img_original, top, bottom, left, right, rejected_path):
                            i_total_faces_rejected_encoding += 1
                        continue

                    # 3. Vérifier la correspondance
                    match_found = False
                    best_similarity = 0
                    for ref_encoding in ref_encodings:
                        similarity = compare_faces(ref_encoding, face_encoding, tolerance=sensibility)
                        if similarity > sensibility:
                            match_found = True
                            best_similarity = max(best_similarity, similarity)
                            break

                    if not match_found:
                        faces_info.append(f"F{face_number + 1}: {get_face_status_formatted('no match', best_similarity)}")
                        image_final = f"{os.path.splitext(images)[0]}_{face_number + 1}{os.path.splitext(images)[1]}"
                        rejected_path = os.path.join(DIR_rejected, image_final)
                        if save_rejected_face(img_original, top, bottom, left, right, rejected_path):
                            i_total_faces_rejected_no_match += 1
                        continue

                    # 4. Seulement si c'est le bon visage, continuer avec les autres vérifications et traitements
                    # ... (reste du code pour l'orientation, la rotation, etc.)

                    # Vérifier l'orientation du visage
                    if face_landmarks is None:
                        faces_info.append(f"F{face_number + 1}: {get_face_status_formatted('error', error_details='Failed to detect facial landmarks')}")
                        image_final = f"{os.path.splitext(images)[0]}_{face_number + 1}{os.path.splitext(images)[1]}"
                        rejected_path = os.path.join(DIR_rejected, image_final)
                        if save_rejected_face(img_original, top, bottom, left, right, rejected_path):
                            i_total_faces_rejected_rotation_or_export_problem += 1
                        continue

                    # Obtenir les coordonnées des yeux
                    left_eye = face_landmarks['left_eye']
                    right_eye = face_landmarks['right_eye']
                    left_eye_center = np.mean(left_eye, axis=0)
                    right_eye_center = np.mean(right_eye, axis=0)
                    nose_tip_center = np.mean(face_landmarks['nose_tip'], axis=0)

                    # Garder une copie des coordonnées originales pour le traitement final
                    left_eye_center_orig = left_eye_center.copy()
                    right_eye_center_orig = right_eye_center.copy()

                    # Ajuster les coordonnées avec les offsets (uniquement pour le test d'harmonie)
                    left_eye_center[0] += left
                    left_eye_center[1] += top
                    right_eye_center[0] += left
                    right_eye_center[1] += top
                    nose_tip_center[0] += left
                    nose_tip_center[1] += top

                    # Vérifier l'harmonie
                    d1 = np.linalg.norm(left_eye_center - nose_tip_center)
                    d2 = np.linalg.norm(right_eye_center - nose_tip_center)
                    face_harmony = d1/d2

                    if face_harmony <= harmony_ratio or face_harmony >= 1/harmony_ratio:
                        faces_info.append(f"F{face_number + 1}: {get_face_status_formatted('not front')}")
                        image_final = f"{os.path.splitext(images)[0]}_{face_number + 1}{os.path.splitext(images)[1]}"
                        rejected_path = os.path.join(DIR_rejected, image_final)
                        if save_rejected_face(img_original, top, bottom, left, right, rejected_path):
                            i_total_faces_rejected_not_front += 1
                        continue

                    # Traitement final du visage validé
                    try:
                        # Restaurer l'image originale
                        img = img_original.copy()

                        # Ajuster les coordonnées des yeux pour l'image complète
                        left_eye_center_orig[0] += left
                        left_eye_center_orig[1] += top
                        right_eye_center_orig[0] += left
                        right_eye_center_orig[1] += top

                        # Calculer l'angle et l'échelle
                        delta = left_eye_center_orig - right_eye_center_orig
                        angle = np.arctan2(delta[1], delta[0])
                        angle = (angle * 180) / np.pi + 180

                        scale = dist_between_eyes_ref/np.linalg.norm(right_eye_center_orig-left_eye_center_orig)
                        if scale > quality_check_scale_factor:
                            faces_info.append(f"F{face_number + 1}: {get_face_status_formatted('low quality')}")
                            image_final = f"{os.path.splitext(images)[0]}_{face_number + 1}{os.path.splitext(images)[1]}"
                            rejected_path = os.path.join(DIR_rejected, image_final)
                            if save_rejected_face(img_original, top, bottom, left, right, rejected_path):
                                i_total_faces_rejected_quality_problem += 1
                            continue

                        # Redimensionner l'image
                        dim = (int(scale*img.shape[1]+0.5), int(scale*img.shape[0]+0.5))
                        img = cv.resize(img, dim)

                        # Ajuster les coordonnées après le redimensionnement
                        left_eye_center_orig *= scale
                        right_eye_center_orig *= scale

                        # Appliquer la rotation
                        center = (0.5 * (right_eye_center_orig + left_eye_center_orig)).tolist()
                        M = cv.getRotationMatrix2D(center, angle, 1.0)
                        img = cv.warpAffine(img, M, (img.shape[1], img.shape[0]))

                        # Ajouter les bordures et recadrer
                        img = cv.copyMakeBorder(img, border_addition, border_addition, border_addition, border_addition, cv.BORDER_CONSTANT)
                        center[0] += border_addition
                        center[1] += border_addition
                        final_img = img[int(center[1]+0.5)-croping_size_x:int(center[1]+0.5)+croping_size_x,
                                      int(center[0]+0.5)-croping_size_y:int(center[0]+0.5)+croping_size_y]

                        # Exportation
                        image_final = f"{os.path.splitext(images)[0]}_{face_number + 1}{os.path.splitext(images)[1]}"
                        final_path = os.path.join(DIR_validated, image_final)
                        cv.imwrite(final_path, final_img)

                        faces_info.append(f"F{face_number + 1}: {get_face_status_formatted('matched', best_similarity)}")
                        i_total_faces_ok += 1

                    except Exception as e:
                        # Capturer le nom de l'erreur et sa description pour les erreurs de rotation/export
                        error_type = type(e).__name__
                        error_desc = str(e)
                        faces_info.append(f"F{face_number + 1}: {get_face_status_formatted('error', error_details=f'{error_type}: {error_desc}')}")
                        i_total_faces_rejected_rotation_or_export_problem += 1

                except Exception as e:
                    error_type = type(e).__name__
                    error_desc = str(e)
                    faces_info.append(f"F{face_number + 1}: {get_face_status_formatted('error', error_details=f'{error_type}: {error_desc}')}")

            # Log final pour l'image
            logger.info(f"{progress_msg} - {len(locations)}F - {' '.join(faces_info)}")
            i_total_files_analyzed += 1

        except Exception as e:
            error_type = type(e).__name__
            error_desc = str(e)
            logger.error(f"{progress_msg} - Error: {error_type}: {error_desc}")
            i_total_files_rejected += 1

    # Calcul du total des visages rejetés
    i_total_faces_rejected = (i_total_faces_rejected_no_match + 
                            i_total_faces_rejected_quality_problem + 
                            i_total_faces_rejected_not_front + 
                            i_total_faces_rejected_rotation_or_export_problem +
                            i_total_faces_rejected_encoding)

    # Ligne de séparation avant le résumé
    logger.info("\n" + "=" * 50)

    # Résumé final plus propre
    logger.info("=== Processing Summary ===")
    logger.info(f"Files Analyzed      : {i_total_files:>4}")
    logger.info(f"├── Processed       : {i_total_files_analyzed - i_total_files_rejected:>4}")
    logger.info(f"└── Rejected        : {i_total_files_rejected:>4}")
    logger.info(f"    ├── No Faces    : {i_total_files_rejected_face_not_found:>4}")
    logger.info(f"    └── Too Many    : {i_total_files_rejected - i_total_files_rejected_face_not_found:>4}")
    logger.info(f"\nFaces Detected      : {i_total_faces_detected:>4}")
    logger.info(f"├── Matched         : {i_total_faces_ok:>4}")
    logger.info(f"└── Rejected        : {i_total_faces_rejected:>4}")
    logger.info(f"    ├── Not Encoded : {i_total_faces_rejected_encoding:>4}")
    logger.info(f"    ├── Not Matched : {i_total_faces_rejected_no_match:>4}")
    logger.info(f"    ├── Quality     : {i_total_faces_rejected_quality_problem:>4}")
    logger.info(f"    ├── Not Front   : {i_total_faces_rejected_not_front:>4}")
    logger.info(f"    └── Processing  : {i_total_faces_rejected_rotation_or_export_problem:>4}") 

    if i_total_files_rejected > 0:
        logger.error(f"{bcolors.FAIL}Some faces were rejected during processing{bcolors.RESET}")
        sys.exit(1) 

    # Avant le résumé
    logger.info("=" * 50)