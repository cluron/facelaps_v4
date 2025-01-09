#!/usr/bin/env python3

# Imports de nos modules
from utils import print_banner, loading_animation, sysArgs, bcolors
from config import version, model, sensibility, harmony_ratio, quality_check_scale_factor, max_faces
from face_detection import extract_faces
from video_processing import create_video, concatenate_videos
from batch_verify import BatchVerifier

# Autres imports standards
import threading
import time
import os
import sys
import argparse

def sysArgs():
    parser = argparse.ArgumentParser(
        description='FaceLaps - Create timelapse videos from face photos',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Extract faces from photos:
  ./facelaps.py extract -t template_photos -s 1_input -r 2_rejected -op 3_validated

  # Extract faces and verify them immediately:
  ./facelaps.py extract -t template_photos -s 1_input -r 2_rejected -op 3_validated --batch-verify --grid 10x10

  # Verify faces in a grid interface:
  ./facelaps.py batch-verify -i 3_validated --grid 10x10

  # Create a video from verified faces:
  ./facelaps.py make-video -i 3_validated -o 4_video -f 7 -m 0.5

  # Concatenate multiple videos:
  ./facelaps.py concatenate-videos -s 4_video
""")
    
    subparsers = parser.add_subparsers(dest='action', help='Available commands')

    # Parser pour extract
    parser_extract = subparsers.add_parser('extract', 
        help='Extract and align faces from photos',
        description='Extract, align and validate faces from a set of photos using template matching',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic extraction:
  ./facelaps.py extract -t template_photos -s 1_input -r 2_rejected -op 3_validated

  # With immediate batch verification:
  ./facelaps.py extract -t template_photos -s 1_input -r 2_rejected -op 3_validated --batch-verify --grid 10x10

  # With custom grid size:
  ./facelaps.py extract -t template_photos -s 1_input -r 2_rejected -op 3_validated --batch-verify --grid 5x4

Directory structure:
  template_photos/  - Contains reference photos of the face to match
  1_input/         - Contains all photos to process
  2_rejected/      - Where non-matching photos will be moved
  3_validated/     - Where extracted faces will be saved
  4_video/         - Where generated videos will be saved
""")
    parser_extract.add_argument('-t', '--template', required=True, 
        help='Directory containing reference face photos (e.g., template_photos)')
    parser_extract.add_argument('-s', '--source', required=True, 
        help='Directory containing photos to process (e.g., 1_input)')
    parser_extract.add_argument('-r', '--rejected', required=True, 
        help='Directory where rejected photos will be moved (e.g., 2_rejected)')
    parser_extract.add_argument('-op', '--outP', required=True, 
        help='Directory where validated faces will be saved (e.g., 3_validated)')
    parser_extract.add_argument('--batch-verify', action='store_true', 
        help='Launch the batch verification interface after extraction')
    parser_extract.add_argument('--grid', default='10x10', 
        help='Grid size for batch verification (e.g., 10x10, 5x4)')

    # Parser pour make-video
    parser_video = subparsers.add_parser('make-video',
        help='Create a video from validated faces',
        description='Create a timelapse video from validated face photos with morphing transitions',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Create video with default morphing:
  ./facelaps.py make-video -i validated -o video -f 7

  # Create video with custom morphing strength:
  ./facelaps.py make-video -i validated -o video -f 7 -m 0.8

  # Create video with crossfade only:
  ./facelaps.py make-video -i validated -o video -f 7 -m 0.0
""")
    parser_video.add_argument('-i', '--input', required=True, 
        help='Directory containing validated face photos (e.g., 3_validated)')
    parser_video.add_argument('-o', '--outV', required=True, 
        help='Output directory for the generated video (e.g., 4_video)')
    parser_video.add_argument('-f', '--fps', type=int, required=True, 
        help='Frames per second (e.g., 7 for smooth transitions)')
    parser_video.add_argument('-m', '--morph-strength', type=float, default=0.5,
        help='Morphing strength: 0.0 for crossfade, 1.0 for full morphing (default: 0.5)')

    # Parser pour batch-verify
    parser_verify = subparsers.add_parser('batch-verify',
        help='Visual interface to verify and remove faces',
        description='Interactive grid interface to review and remove unwanted faces',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Verify with default 10x10 grid:
  ./facelaps.py batch-verify -i validated

  # Verify with custom grid size:
  ./facelaps.py batch-verify -i validated --grid 5x4

Interface controls:
  - Click on faces to mark/unmark them for deletion
  - Use arrow buttons to navigate between pages
  - Click "Supprimer" to confirm deletions
  - Click "X" to exit
""")
    parser_verify.add_argument('-i', '--input', required=True, 
        help='Directory containing faces to verify (e.g., 3_validated)')
    parser_verify.add_argument('--grid', default='10x10', 
        help='Grid size for the visual interface (e.g., 10x10, 5x4)')

    # Parser pour concatenate-videos
    parser_concat = subparsers.add_parser('concatenate-videos',
        help='Concatenate multiple videos',
        description='Combine multiple timelapse videos into a single video',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example:
  ./facelaps.py concatenate-videos -s video_folder

Note: Videos will be concatenated in alphabetical order
""")
    parser_concat.add_argument('-s', '--source', required=True, 
        help='Directory containing videos to concatenate (e.g., 4_video)')

    args = parser.parse_args()
    if args.action is None:
        parser.print_help()
        sys.exit(1)

    return vars(args)

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

            # Lancer la vérification par lots si demandé
            if args.get('batch_verify'):
                print(f"{bcolors.JUST}\n[Starting batch verification]{bcolors.RESET}")
                rows, cols = map(int, args['grid'].split('x'))
                verifier = BatchVerifier(args['outP'], grid_size=(rows, cols))
                verifier.run()

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

        elif args['action'] == "batch-verify":
            rows, cols = map(int, args['grid'].split('x'))
            verifier = BatchVerifier(args['input'], grid_size=(rows, cols))
            print(f"{bcolors.JUST}\n[Starting batch verification]{bcolors.RESET}")
            verifier.run()

        else:
            print(f"{bcolors.FAIL}Invalid action specified{bcolors.RESET}")
            sys.exit(1)

    except Exception as e:
        print(f"{bcolors.FAIL}An error occurred: {str(e)}{bcolors.RESET}")
        raise
    finally:
        loading_manager.stop()

    print(f"{bcolors.JUST}\n[Actions complete]{bcolors.RESET}") 