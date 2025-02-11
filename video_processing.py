import os
import sys
import tempfile
import fcntl

# Redirection de stderr vers /dev/null
devnull = open(os.devnull, 'w')
stderr_fd = sys.stderr.fileno()
# Sauvegarder une copie du stderr original
stderr_save = os.dup(stderr_fd)
# Rediriger stderr vers /dev/null
os.dup2(devnull.fileno(), stderr_fd)

# Configuration silencieuse avant tout import
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
    'FORCE_MEDIAPIPE_CPU': '1'
})

# Supprimer tous les handlers existants
import logging
root = logging.getLogger()
if root.handlers:
    for handler in root.handlers:
        root.removeHandler(handler)
        
# Configurer le logging de base
logging.basicConfig(level=logging.ERROR)

import cv2 as cv
from config import (bcolors, min_morph_strength, max_morph_strength, 
                   similarity_threshold)
import mediapipe as mp
import numpy as np
from tqdm import tqdm
import time

# Désactiver tous les loggers après les imports
logging.getLogger('tensorflow').setLevel(logging.ERROR)
logging.getLogger('mediapipe').setLevel(logging.ERROR)
logging.getLogger('absl').setLevel(logging.ERROR)
logging.getLogger('matplotlib').setLevel(logging.ERROR)
logging.getLogger('numba').setLevel(logging.ERROR)

# Configuration de MediaPipe pour utiliser le CPU uniquement
mp.solutions.face_mesh.FaceMesh._ENABLE_GPU = False
mp_face_mesh = mp.solutions.face_mesh

# Restaurer stderr pour nos propres messages
os.dup2(stderr_save, stderr_fd)
os.close(stderr_save)
devnull.close()

# Configuration du logger
def setup_logger():
    """Configure le logger avec un format personnalisé"""
    class ColoredFormatter(logging.Formatter):
        def format(self, record):
            if record.levelno == logging.INFO:
                if "Starting" in record.msg or "Processing" in record.msg:
                    return f"{bcolors.JUST}[{record.msg}]{bcolors.RESET}"
                return f"{record.msg}"
            elif record.levelno == logging.WARNING:
                return f"{bcolors.WARNING}⚠ {record.msg}{bcolors.RESET}"
            elif record.levelno == logging.ERROR:
                return f"{bcolors.FAIL}✗ {record.msg}{bcolors.RESET}"
            return record.msg

    logger = logging.getLogger(__name__)
    logger.setLevel(logging.INFO)
    
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(ColoredFormatter())
    logger.addHandler(handler)
    
    return logger

# Initialiser le logger
logger = setup_logger()

class ColoredFormatter(logging.Formatter):
    def format(self, record):
        if record.levelno == logging.INFO:
            if "Starting" in record.msg or "Processing" in record.msg:
                return f"{bcolors.JUST}[{record.msg}]{bcolors.RESET}"
            return f"{record.msg}"
        elif record.levelno == logging.WARNING:
            return f"{bcolors.WARNING}⚠ {record.msg}{bcolors.RESET}"
        elif record.levelno == logging.ERROR:
            return f"{bcolors.FAIL}✗ {record.msg}{bcolors.RESET}"
        return record.msg

def create_transition(img1, img2, nb_frames):
    """Crée une transition fluide (fondu enchaîné) entre deux images"""
    frames = []
    for i in range(nb_frames):
        alpha = i / nb_frames
        blended = cv.addWeighted(img1, 1 - alpha, img2, alpha, 0)
        frames.append(blended)
    return frames

def get_face_landmarks(image):
    """Extrait les points caractéristiques du visage"""
    # Rediriger stderr temporairement
    old_stderr = sys.stderr
    sys.stderr = open(os.devnull, 'w')
    
    try:
        with mp_face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            min_detection_confidence=0.5) as face_mesh:
            
            results = face_mesh.process(cv.cvtColor(image, cv.COLOR_BGR2RGB))
            if not results.multi_face_landmarks:
                return None
            
            h, w = image.shape[:2]
            landmarks = np.array([[int(lm.x * w), int(lm.y * h)] for lm in results.multi_face_landmarks[0].landmark])
            return landmarks
    finally:
        # Restaurer stderr
        sys.stderr = old_stderr

def create_morphing_transition(img1, img2, nb_frames, strength=0.5):
    """Crée une transition morphing entre deux images"""
    # Rediriger stderr temporairement
    old_stderr = sys.stderr
    null_fd = open(os.devnull, 'w')
    sys.stderr = null_fd
    
    try:
        landmarks1 = get_face_landmarks(img1)
        landmarks2 = get_face_landmarks(img2)
        
        if landmarks1 is None or landmarks2 is None:
            sys.stderr = old_stderr
            null_fd.close()
            return create_transition(img1, img2, nb_frames)
        
        frames = []
        h, w = img1.shape[:2]
        
        # Points clés du visage
        key_points = [
            33,   # Nez
            133, 362,  # Yeux
            61, 291,   # Bouche
            152, 382,  # Sourcils
            10, 152,   # Contour gauche
            234, 454,  # Contour droit
            0, 17,     # Menton
            50, 280,   # Joues
        ]
        
        # Extraire les points clés
        filtered_landmarks1 = landmarks1[key_points]
        filtered_landmarks2 = landmarks2[key_points]
        
        # Ajouter les coins de l'image
        corners = np.array([[0, 0], [w-1, 0], [0, h-1], [w-1, h-1]])
        filtered_landmarks1 = np.vstack([filtered_landmarks1, corners])
        filtered_landmarks2 = np.vstack([filtered_landmarks2, corners])
        
        # Pour chaque frame
        for i in range(nb_frames):
            alpha = i / nb_frames
            # Interpoler les points
            landmarks_morphed = filtered_landmarks1 * (1 - alpha) + filtered_landmarks2 * alpha
            
            # Créer un masque pour le visage
            mask = np.zeros((h, w), dtype=np.uint8)
            hull = cv.convexHull(landmarks_morphed.astype(np.int32))
            cv.fillConvexPoly(mask, hull, 255)
            
            # Appliquer une transformation perspective
            src_points = filtered_landmarks1.astype(np.float32)
            dst_points = landmarks_morphed.astype(np.float32)
            M = cv.findHomography(src_points, dst_points)[0]
            
            # Warper l'image
            warped = cv.warpPerspective(img1, M, (w, h), borderMode=cv.BORDER_REFLECT)
            
            # Créer l'image finale
            mask = cv.GaussianBlur(mask, (31, 31), 0)
            mask = mask.astype(float) / 255
            mask = np.stack([mask] * 3, axis=-1)
            
            # Ajuster le masque selon la force du morphing
            mask = mask * strength
            
            result = warped * mask + img2 * (1 - mask)
            result = result.astype(np.uint8)
            
            # Ajouter un peu de crossfade pour adoucir
            blended = cv.addWeighted(result, 1 - alpha, img2, alpha, 0)
            frames.append(blended)
            
        return frames
    
    except Exception as e:
        print(f"Error in morphing: {str(e)}")
        return create_transition(img1, img2, nb_frames)
    finally:
        # Restaurer stderr
        sys.stderr = old_stderr
        null_fd.close()

def calculate_image_similarity(img1, img2):
    """Calcule la similarité entre deux images"""
    # Redimensionner les images pour accélérer la comparaison
    size = (100, 100)
    img1_small = cv.resize(img1, size)
    img2_small = cv.resize(img2, size)
    
    # Convertir en niveaux de gris
    gray1 = cv.cvtColor(img1_small, cv.COLOR_BGR2GRAY)
    gray2 = cv.cvtColor(img2_small, cv.COLOR_BGR2GRAY)
    
    # Calculer la similarité structurelle (SSIM)
    score = cv.matchTemplate(gray1, gray2, cv.TM_CCOEFF_NORMED)[0][0]
    
    return max(0, min(1, (score + 1) / 2))  # Normaliser entre 0 et 1

def get_adaptive_strength(img1, img2, base_strength, min_strength=min_morph_strength, 
                         max_strength=max_morph_strength, threshold=similarity_threshold):
    """Calcule la force de transition adaptative"""
    similarity = calculate_image_similarity(img1, img2)
    
    if similarity >= threshold:
        # Images très similaires -> transition douce
        return min_strength
    else:
        # Adapter la force en fonction de la différence
        strength_range = max_strength - min_strength
        similarity_factor = (threshold - similarity) / threshold
        return min_strength + (strength_range * similarity_factor)

def create_video(folder_in, folder_out, version, frame_per_second, morph_strength=0.5, use_adaptive=False):
    """Crée une vidéo à partir des images"""
    # Créer le dossier de sortie s'il n'existe pas
    if not os.path.exists(folder_out):
        os.makedirs(folder_out)
        logger.info(f"Created output directory: {folder_out}")

    path, dirs, files = next(os.walk(folder_in))
    # Ignorer les fichiers cachés comme .DS_Store
    files = [f for f in files if not f.startswith('.')]
    file_count = len(files)
    
    logger.info(f"Found {file_count} files in {folder_in}")
    
    if file_count == 0:
        logger.error("No valid images found in the input folder")
        return

    logger.info("Initializing video writer...")
    
    # Obtenir les dimensions de la première image valide
    size = None
    for image in sorted(files):
        path = os.path.join(folder_in, image)
        img = cv.imread(path)
        if img is not None:
            size = (img.shape[1], img.shape[0])
            logger.info(f"Using dimensions: {size}")
            break
    
    if size is None:
        logger.error("No valid images found to determine video dimensions")
        return

    # Créer le writer une fois qu'on a les dimensions
    video_fps = 30  # fps standard de la vidéo
    output_filename = f'output_{version}_{frame_per_second}fps.mp4'
    filename_target_path = os.path.join(folder_out, output_filename)
    logger.info(f"Will create video: {filename_target_path}")
    
    # Essayer différents codecs, en privilégiant MP4
    codecs = [('mp4v', '.mp4'), ('avc1', '.mp4'), ('MJPG', '.avi'), ('XVID', '.avi')]
    
    for codec, ext in codecs:
        try:
            output_filename = f'output_{version}_{frame_per_second}fps{ext}'
            filename_target_path = os.path.join(folder_out, output_filename)
            fourcc = cv.VideoWriter_fourcc(*codec)
            out = cv.VideoWriter(filename_target_path, fourcc, video_fps, size)
            
            if out.isOpened():
                logger.info(f"Successfully created video writer with codec {codec}")
                break
        except Exception as e:
            logger.warning(f"Failed with codec {codec}: {str(e)}")
    else:
        logger.error("Could not create video writer with any codec")
        return

    # Ajouter toutes les images valides
    processed_count = 0
    
    # Calculer le nombre de frames à maintenir chaque image
    frames_per_image = int(video_fps / frame_per_second)
    transition_frames = min(2, frames_per_image // 2)

    # Préparer la liste des images à traiter
    files_sorted = sorted(files)
    total_images = len(files_sorted)
    
    # Utiliser tqdm de manière plus simple
    for idx, image in enumerate(tqdm(files_sorted[:-1], desc="Creating video"), 1):
        path_current = os.path.join(folder_in, image)
        path_next = os.path.join(folder_in, files_sorted[idx])
        
        curr_img = cv.imread(path_current)
        next_img = cv.imread(path_next)
        
        if curr_img is None or next_img is None:
            tqdm.write(f"\nSkipping invalid image pair: {path_current} or {path_next}")
            continue
            
        if curr_img.shape[:2][::-1] != size:
            curr_img = cv.resize(curr_img, size)
        if next_img.shape[:2][::-1] != size:
            next_img = cv.resize(next_img, size)
        
        try:
            # Créer la transition (uniquement fondu enchaîné)
            transition = create_transition(curr_img, next_img, transition_frames)
            
            # Écrire les frames
            for frame in transition:
                out.write(frame)
            
            for _ in range(frames_per_image - transition_frames):
                out.write(curr_img)
            
            processed_count += 1
            
        except Exception as e:
            tqdm.write(f"\nError processing transition {idx}: {str(e)}")
    
    # Ajouter la dernière image
    if files_sorted:
        last_img = cv.imread(os.path.join(folder_in, files_sorted[-1]))
        if last_img is not None:
            if last_img.shape[:2][::-1] != size:
                last_img = cv.resize(last_img, size)
            for _ in range(frames_per_image):
                out.write(last_img)
            processed_count += 1  # Compter la dernière image
    
    out.release()
    print(f"\nProcessed {processed_count} images out of {total_images}")
    
    if os.path.exists(filename_target_path):
        print(f"\nVideo successfully created: {filename_target_path}")
    else:
        print("\nError: Video file was not created")

def concatenate_videos(folder_in):
    """Concatène plusieurs vidéos"""
    # Ignorer les fichiers non-MP4
    files = [f for f in os.listdir(folder_in) if f.endswith('.mp4')]
    total_videos = len(files)

    logger.info(f"Found {total_videos} videos in {folder_in}")

    if total_videos == 0:
        logger.error("No valid videos found in the input folder")
        return

    # Obtenir les propriétés de la première vidéo
    first_video = cv.VideoCapture(os.path.join(folder_in, files[0]))
    if not first_video.isOpened():
        logger.error("Could not open first video")
        return

    frame_width = int(first_video.get(cv.CAP_PROP_FRAME_WIDTH))
    frame_height = int(first_video.get(cv.CAP_PROP_FRAME_HEIGHT))
    fps = int(first_video.get(cv.CAP_PROP_FPS))
    first_video.release()

    # Créer le writer pour la vidéo de sortie
    output_path = os.path.join(folder_in, "output_concatenation.mp4")
    fourcc = cv.VideoWriter_fourcc(*'mp4v')
    out = cv.VideoWriter(output_path, fourcc, fps, (frame_width, frame_height))

    # Concaténer les vidéos
    for vid in sorted(files):
        logger.info(f"Processing video: {vid}")
        cap = cv.VideoCapture(os.path.join(folder_in, vid))
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            out.write(frame)
        
        cap.release()

    out.release()
    logger.info(f"Videos successfully concatenated: {output_path}") 