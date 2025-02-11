#!/usr/bin/env python3

# Imports de nos modules
from utils import print_banner, loading_animation, sysArgs, bcolors
from config import version, model, sensibility, harmony_ratio, quality_check_scale_factor, max_faces
from face_detection import extract_faces
from video_processing import create_video, concatenate_videos
from batch_verify import BatchVerifier
from face_quality import FaceQualityAnalyzer

# Autres imports standards
import threading
import time
import os
import sys
import argparse
import logging
from pathlib import Path

# Configuration du logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

def sysArgs():
    class ColoredHelpFormatter(argparse.HelpFormatter):
        def __init__(self, prog, indent_increment=2, max_help_position=30, width=None):
            super().__init__(prog, indent_increment, max_help_position, width)
            self._program_name = prog

        def _format_action(self, action):
            # Colorer les options en cyan
            result = super()._format_action(action)
            if action.option_strings:
                for opt in action.option_strings:
                    result = result.replace(opt, f"{bcolors.JUST}{opt}{bcolors.RESET}")
            return result

        def _format_usage(self, usage, actions, groups, prefix):
            # Colorer le mot "usage" en bleu
            if prefix is None:
                prefix = f"{bcolors.JUST}usage: {bcolors.RESET}"
            return super()._format_usage(usage, actions, groups, prefix)

        def _format_action_invocation(self, action):
            # Colorer les métavariables en jaune
            if not action.option_strings:
                metavar, = self._metavar_formatter(action, action.dest)(1)
                return f"{bcolors.WARNING}{metavar}{bcolors.RESET}"
            else:
                parts = []
                for option_string in action.option_strings:
                    parts.append(f"{bcolors.JUST}{option_string}{bcolors.RESET}")
                if action.nargs != 0:
                    default = action.dest.upper()
                    args_string = self._format_args(action, default)
                    parts[-1] += f" {bcolors.WARNING}{args_string}{bcolors.RESET}"
                return ', '.join(parts)

    parser = argparse.ArgumentParser(
        description=f'{bcolors.OK}FaceLaps - Create timelapse videos from face photos{bcolors.RESET}',
        formatter_class=ColoredHelpFormatter,
        epilog=f"""
{bcolors.OK}Initial Setup:{bcolors.RESET}

  1. Create and activate virtual environment:
     {bcolors.JUST}# On macOS/Linux:{bcolors.RESET}
     python3 -m venv venv
     source venv/bin/activate

     {bcolors.JUST}# On Windows:{bcolors.RESET}
     python -m venv venv
     venv\\Scripts\\activate

  2. Install dependencies:
     {bcolors.JUST}# Update pip{bcolors.RESET}
     python -m pip install --upgrade pip
     
     {bcolors.JUST}# Install required packages{bcolors.RESET}
     pip install -r requirements.txt

  3. Create directory structure:
     {bcolors.JUST}mkdir 0_template_photos 1_input 2_rejected 3_validated 4_video{bcolors.RESET}

{bcolors.OK}Examples:{bcolors.RESET}

  # Extract faces from photos:
  {bcolors.JUST}./facelaps.py extract -t 0_template_photos -s 1_input -r 2_rejected -op 3_validated{bcolors.RESET}

  # Extract faces and verify them immediately:
  {bcolors.JUST}./facelaps.py extract -t 0_template_photos -s 1_input -r 2_rejected -op 3_validated \\
      --batch-verify --grid 10x10{bcolors.RESET}

  # Verify faces in a grid interface:
  {bcolors.JUST}./facelaps.py batch-verify -i 3_validated --grid 10x10{bcolors.RESET}

  # Create a video with balanced transitions (50% morphing, 50% crossfade):
  {bcolors.JUST}./facelaps.py make-video -i 3_validated -o 4_video -f 7 -m 0.5{bcolors.RESET}

  # Create a video with smart transitions (auto-adjusts between morphing and crossfade):
  {bcolors.JUST}./facelaps.py make-video -i 3_validated -o 4_video -f 7 --adaptive{bcolors.RESET}

  # Concatenate multiple videos:
  {bcolors.JUST}./facelaps.py concatenate-videos -s 4_video{bcolors.RESET}

{bcolors.OK}Dependencies:{bcolors.RESET}
  - OpenCV (>=4.8.0) : Image and video processing
  - NumPy (>=1.24.0) : Numerical computations
  - MediaPipe (>=0.10.0) : Face detection and analysis
  - tqdm (>=4.65.0) : Progress bars
""")
    
    subparsers = parser.add_subparsers(dest='action', help=f'{bcolors.OK}Available commands{bcolors.RESET}')

    # Parser pour extract
    parser_extract = subparsers.add_parser('extract', 
        help=f'{bcolors.OK}Extract and align faces from photos{bcolors.RESET}',
        description=f'{bcolors.OK}Extract, align and validate faces from a set of photos using template matching{bcolors.RESET}',
        formatter_class=ColoredHelpFormatter,
        epilog=f"""
{bcolors.OK}Examples:{bcolors.RESET}

  # Basic extraction:
  {bcolors.JUST}./facelaps.py extract -t 0_template_photos -s 1_input -r 2_rejected -op 3_validated{bcolors.RESET}

  # With immediate batch verification:
  {bcolors.JUST}./facelaps.py extract -t 0_template_photos -s 1_input -r 2_rejected -op 3_validated \\
      --batch-verify --grid 10x10{bcolors.RESET}

  # With custom grid size:
  {bcolors.JUST}./facelaps.py extract -t 0_template_photos -s 1_input -r 2_rejected -op 3_validated \\
      --batch-verify --grid 5x4{bcolors.RESET}

{bcolors.OK}Directory structure:{bcolors.RESET}
  {bcolors.JUST}0_template_photos/{bcolors.RESET}  - Contains reference photos of the face to match
  {bcolors.JUST}1_input/{bcolors.RESET}           - Contains all photos to process
  {bcolors.JUST}2_rejected/{bcolors.RESET}        - Where non-matching photos will be moved
  {bcolors.JUST}3_validated/{bcolors.RESET}       - Where extracted faces will be saved
  {bcolors.JUST}4_video/{bcolors.RESET}          - Where generated videos will be saved
""")
    parser_extract.add_argument('-t', '--template', required=True, 
        help=f'{bcolors.OK}Directory containing reference face photos (e.g., 0_template_photos){bcolors.RESET}')
    parser_extract.add_argument('-s', '--source', required=True, 
        help=f'{bcolors.OK}Directory containing photos to process (e.g., 1_input){bcolors.RESET}')
    parser_extract.add_argument('-r', '--rejected', required=True, 
        help=f'{bcolors.OK}Directory where rejected photos will be moved (e.g., 2_rejected){bcolors.RESET}')
    parser_extract.add_argument('-op', '--outP', required=True, 
        help=f'{bcolors.OK}Directory where validated faces will be saved (e.g., 3_validated){bcolors.RESET}')
    parser_extract.add_argument('--batch-verify', action='store_true', 
        help=f'{bcolors.OK}Launch the batch verification interface after extraction{bcolors.RESET}')
    parser_extract.add_argument('--grid', default='10x10', 
        help=f'{bcolors.OK}Grid size for batch verification (e.g., 10x10, 5x4){bcolors.RESET}')

    # Parser pour make-video
    parser_video = subparsers.add_parser('make-video',
        help=f'{bcolors.OK}Create a video from validated faces{bcolors.RESET}',
        description=f'{bcolors.OK}Create a timelapse video from validated face photos with crossfade transitions{bcolors.RESET}',
        formatter_class=ColoredHelpFormatter,
        epilog=f"""
{bcolors.OK}Examples:{bcolors.RESET}

  # Create video with default settings:
  {bcolors.JUST}./facelaps.py make-video -i validated -o video -f 7{bcolors.RESET}

  # Create video with custom fps:
  {bcolors.JUST}./facelaps.py make-video -i validated -o video -f 10{bcolors.RESET}

Note: All transitions use smooth crossfade for consistent results
""")
    parser_video.add_argument('-i', '--input', required=True, 
        help=f'{bcolors.OK}Directory containing validated face photos (e.g., 3_validated){bcolors.RESET}')
    parser_video.add_argument('-o', '--outV', required=True, 
        help=f'{bcolors.OK}Output directory for the generated video (e.g., 4_video){bcolors.RESET}')
    parser_video.add_argument('-f', '--fps', type=int, required=True, 
        help=f'{bcolors.OK}Frames per second (e.g., 7 for smooth transitions){bcolors.RESET}')

    # Parser pour batch-verify
    parser_verify = subparsers.add_parser('batch-verify',
        help=f'{bcolors.OK}Visual interface to verify and remove faces{bcolors.RESET}',
        description=f'{bcolors.OK}Interactive grid interface to review and remove unwanted faces{bcolors.RESET}',
        formatter_class=ColoredHelpFormatter,
        epilog=f"""
{bcolors.OK}Examples:{bcolors.RESET}

  # Verify with default 10x10 grid:
  {bcolors.JUST}./facelaps.py batch-verify -i validated{bcolors.RESET}

  # Verify with custom grid size:
  {bcolors.JUST}./facelaps.py batch-verify -i validated --grid 5x4{bcolors.RESET}

{bcolors.OK}Interface controls:{bcolors.RESET}
  - Click on faces to mark/unmark them for deletion
  - Use arrow buttons to navigate between pages
  - Click "Supprimer" to confirm deletions
  - Click "X" to exit
""")
    parser_verify.add_argument('-i', '--input', required=True, 
        help=f'{bcolors.OK}Directory containing faces to verify (e.g., 3_validated){bcolors.RESET}')
    parser_verify.add_argument('--grid', default='10x10', 
        help=f'{bcolors.OK}Grid size for the visual interface (e.g., 10x10, 5x4){bcolors.RESET}')

    # Parser pour concatenate-videos
    parser_concat = subparsers.add_parser('concatenate-videos',
        help=f'{bcolors.OK}Concatenate multiple videos{bcolors.RESET}',
        description=f'{bcolors.OK}Combine multiple timelapse videos into a single video{bcolors.RESET}',
        formatter_class=ColoredHelpFormatter,
        epilog=f"""
{bcolors.OK}Example:{bcolors.RESET}

  # Concatenate videos in a folder:
  {bcolors.JUST}./facelaps.py concatenate-videos -s video_folder{bcolors.RESET}

Note: Videos will be concatenated in alphabetical order
""")
    parser_concat.add_argument('-s', '--source', required=True, 
        help=f'{bcolors.OK}Directory containing videos to concatenate (e.g., 4_video){bcolors.RESET}')

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
    logger.debug("Starting program...")
    print_banner(version)
    args = sysArgs()
    logger.debug(f"Command line arguments: {args}")
    
    loading_manager = LoadingAnimationManager()
    
    try:        
        if args['action'] == "extract":
            logger.debug("Starting face extraction...")
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
                logger.debug("Starting batch verification...")
                print(f"{bcolors.JUST}\n[Analyzing face quality...]{bcolors.RESET}")
                analyzer = FaceQualityAnalyzer(DIR_validated, DIR_rejected)
                quality_report = analyzer.analyze_faces()
                print(f"{bcolors.JUST}{quality_report}{bcolors.RESET}")
                
                print(f"{bcolors.JUST}\n[Starting batch verification]{bcolors.RESET}")
                rows, cols = map(int, args['grid'].split('x'))
                verifier = BatchVerifier(DIR_validated, grid_size=(rows, cols))
                verifier.run()

        elif args['action'] == "make-video":
            logger.debug("Starting video creation...")
            # Mode création de vidéo
            DIR_extracted = args['input']
            DIR_video_output = args['outV']
            frame_per_second = args['fps']
            print(f"{bcolors.JUST}\n[Arguments for {args['action']} mode are valid and stored]{bcolors.RESET}")
            print(f"{bcolors.JUST}\n[Starting video creation]{bcolors.RESET}")
            create_video(DIR_extracted, DIR_video_output, version, frame_per_second)

        elif args['action'] == "concatenate-videos":
            logger.debug("Starting video concatenation...")
            # Mode concaténation de vidéos
            DIR_videos_folder = args['source']
            print(f"{bcolors.JUST}\n[Arguments for {args['action']} mode are valid and stored]{bcolors.RESET}")
            print(f"{bcolors.JUST}\n[Starting video concatenation]{bcolors.RESET}")
            concatenate_videos(DIR_videos_folder)

        elif args['action'] == "batch-verify":
            logger.debug("Starting batch verification...")
            # Analyser la qualité avant de lancer la vérification
            print(f"{bcolors.JUST}\n[Analyzing face quality...]{bcolors.RESET}")
            analyzer = FaceQualityAnalyzer(args['input'], Path(args['input']).parent / "2_rejected")
            quality_report = analyzer.analyze_faces()
            print(f"{bcolors.JUST}{quality_report}{bcolors.RESET}")
            print(f"{bcolors.JUST}\n[Preparing grid interface...]{bcolors.RESET}")
            
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