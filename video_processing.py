import cv2 as cv
import os
from moviepy.editor import VideoFileClip, concatenate_videoclips
from config import bcolors
import logging
import sys

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

def create_video(folder_in, folder_out, version, frame_per_second):
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
            out = cv.VideoWriter(filename_target_path, fourcc, frame_per_second, size)
            
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
    for image in sorted(files):
        path = os.path.join(folder_in, image)
        img = cv.imread(path)
        if img is None:
            logger.warning(f"Skipping invalid image: {path}")
            continue
        
        # Vérifier que l'image a les bonnes dimensions
        if img.shape[:2][::-1] != size:
            img = cv.resize(img, size)
        
        try:
            out.write(img)
            processed_count += 1
            logger.info(f"Building video: {processed_count}/{file_count}")
        except Exception as e:
            logger.error(f"Error writing frame: {str(e)}")

    out.release()
    
    if os.path.exists(filename_target_path):
        logger.info(f"Video successfully created: {filename_target_path}")
    else:
        logger.error("Video file was not created")

def concatenate_videos(folder_in):
    """Concatène plusieurs vidéos"""
    videos = []
    path, dirs, files = next(os.walk(folder_in))
    # Ignorer les fichiers non-MP4
    files = [f for f in files if f.endswith('.mp4')]
    total_videos = len(files)

    # Créer le dossier de sortie s'il n'existe pas
    if not os.path.exists(folder_in):
        os.makedirs(folder_in)
        logger.info(f"Created output directory: {folder_in}")

    logger.info(f"Found {total_videos} videos in {folder_in}")

    if total_videos == 0:
        logger.error("No valid videos found in the input folder")
        return

    # Charger les vidéos
    processed_count = 0
    for vid in sorted(files):
        path = os.path.join(folder_in, vid)
        try:
            video = VideoFileClip(path, audio=False)
            videos.append(video)
            processed_count += 1
            logger.info(f"Loading video: {processed_count}/{total_videos}")
        except Exception as e:
            logger.warning(f"Failed to load video {vid}: {str(e)}")
            continue

    if not videos:
        logger.error("No valid videos could be loaded")
        return

    logger.info("Starting video concatenation...")
    
    try:
        final_clip = concatenate_videoclips(videos)
        output_path = os.path.join(folder_in, "output_concatenation.mp4")
        final_clip.write_videofile(output_path,
                                 codec='libx264',
                                 threads=8,
                                 preset='faster',
                                 remove_temp=True)
        logger.info(f"Videos successfully concatenated: {output_path}")
    except Exception as e:
        logger.error(f"Error during concatenation: {str(e)}")
    finally:
        for video in videos:
            video.close() 