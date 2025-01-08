#!/usr/bin/env python3

# Imports de nos modules
from utils import print_banner, loading_animation, sysArgs, bcolors
from config import version, model, sensibility, harmony_ratio, quality_check_scale_factor, max_faces
from face_detection import extract_faces
from video_processing import create_video, concatenate_videos

# Autres imports standards
import threading
import time
import os
import sys
import argparse

def sysArgs():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest='action')

    # ... (autres parsers)

    # Parser pour make-video
    parser_video = subparsers.add_parser('make-video')
    parser_video.add_argument('-i', '--input', required=True, help='Input directory with validated faces')
    parser_video.add_argument('-o', '--outV', required=True, help='Output directory for video')
    parser_video.add_argument('-f', '--fps', type=int, required=True, help='Frames per second')
    parser_video.add_argument('-m', '--morph-strength', type=float, default=0.5,
                            help='Morphing strength between 0 (crossfade) and 1 (full morphing). Default: 0.5')

    return vars(parser.parse_args())

class LoadingAnimationManager:
    def __init__(self):
        self.done = False
        self.thread = None

    def start(self):
        self.done = False
        self.thread = threading.Thread(target=loading_animation, args=(lambda: self.done,))
        self.thread.start()

    def stop(self):
        self.done = True
        if self.thread:
            self.thread.join()

if __name__ == "__main__":
    # Afficher la bannière
    print_banner(version)
    
    # Récupérer et traiter les arguments
    args = sysArgs()
    loading_manager = LoadingAnimationManager()
    
    try:        
        if args['action'] == "extract":
            # Afficher les paramètres uniquement pour le mode extract
            print(f"{bcolors.JUST}[Configuration Parameters]{bcolors.RESET}")
            print(f"Detection Model      : {model} ({'high accuracy' if model == 'full' else 'faster detection'})")
            print(f"Similarity Threshold : {sensibility:.2f} (higher = stricter matching)")
            print(f"Face Orientation     : {harmony_ratio:.2f} (higher = stricter frontal)")
            print(f"Quality Factor       : {quality_check_scale_factor:.1f} (higher = accepts lower quality)")
            print(f"Max Faces per Image  : {max_faces}")
            
            # Mode extraction et reconnaissance de visages
            DIR_template_photos = args['template']
            DIR_input = args['source']
            DIR_rejected = args['rejected']
            DIR_validated = args['outP']
            
            # Vérifier que les dossiers existent
            for directory in [DIR_rejected, DIR_validated]:
                if not os.path.exists(directory):
                    os.makedirs(directory)
            
            # Démarrer l'animation de chargement
            print(f"{bcolors.JUST}\n[Arguments for {args['action']} mode are valid and stored]{bcolors.RESET}")
            loading_manager.start()
            time.sleep(1)
            
            try:
                print(f"{bcolors.JUST}\n[Initializing MediaPipe Face Detection and Face Mesh modules]{bcolors.RESET}")
                print(f"{bcolors.JUST}\n[Reference Face Analysis]{bcolors.RESET}")
                extract_faces(DIR_input, DIR_template_photos, DIR_rejected, DIR_validated)
            finally:
                loading_manager.stop()

        elif args['action'] == "make-video":
            # Mode création de vidéo
            DIR_extracted = args['input']
            DIR_video_output = args['outV']
            frame_per_second = args['fps']
            morph_strength = args['morph_strength']
            print(f"{bcolors.JUST}\n[Arguments for {args['action']} mode are valid and stored]{bcolors.RESET}")
            print(f"{bcolors.JUST}\n[Starting video creation]{bcolors.RESET}")
            create_video(DIR_extracted, DIR_video_output, version, frame_per_second, morph_strength)

        elif args['action'] == "concatenate-videos":
            # Mode concaténation de vidéos
            DIR_videos_folder = args['source']
            print(f"{bcolors.JUST}\n[Arguments for {args['action']} mode are valid and stored]{bcolors.RESET}")
            print(f"{bcolors.JUST}\n[Starting video concatenation]{bcolors.RESET}")
            concatenate_videos(DIR_videos_folder)

        else:
            print(f"{bcolors.FAIL}Invalid action specified{bcolors.RESET}")
            sys.exit(1)

    except Exception as e:
        print(f"{bcolors.FAIL}An error occurred: {str(e)}{bcolors.RESET}")
        raise
    finally:
        loading_manager.stop()

    print(f"{bcolors.JUST}\n[Actions complete]{bcolors.RESET}") 