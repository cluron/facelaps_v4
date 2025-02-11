#!/usr/bin/env python3

# Redirection de stderr au niveau système
import os
import sys
import fcntl
import atexit  # Pour restaurer stderr à la fin

# Configuration des variables d'environnement avec des niveaux de log moins restrictifs
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '1'  # Show warnings and errors
os.environ['ABSL_LOGGING_MIN_LEVEL'] = '1'  # Show warnings and errors
os.environ['MEDIAPIPE_DISABLE_GPU'] = '1'
os.environ['PYTHONWARNINGS'] = 'default'
os.environ['OPENCV_LOG_LEVEL'] = '1'  # Show warnings and errors
os.environ['AUTOGRAPH_VERBOSITY'] = '1'
os.environ['CPP_MIN_LOG_LEVEL'] = '1'

# Imports qui génèrent des messages
import mediapipe as mp
mp_face_detection = mp.solutions.face_detection
mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils

# Fonction pour restaurer stderr à la fin
def restore_stderr():
    pass  # Temporairement désactivé
    # sys.stderr = stderr
    # os.close(r)

# Enregistrer la fonction pour qu'elle soit appelée à la fin
atexit.register(restore_stderr)

# Classe pour les couleurs de terminal
class bcolors:
    OK = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    RESET = '\033[0m'
    JUST = '\033[94m'

# Suppression des logs Python
import logging
logging.getLogger().setLevel(logging.ERROR)
logging.getLogger('mediapipe').setLevel(logging.ERROR)
logging.getLogger('tensorflow').setLevel(logging.ERROR)
logging.getLogger('absl').setLevel(logging.ERROR)

# Suppression des warnings
import warnings
warnings.filterwarnings('ignore', category=RuntimeWarning)
warnings.filterwarnings('ignore', category=UserWarning)
warnings.filterwarnings('ignore', category=FutureWarning)

import sys
import time
import itertools
import os
import argparse
import textwrap

def print_banner(version):
    print("")
    print(" _____              _")
    print("|  ___|_ _  ___ ___| |    __ _ _ __  ___")
    print("| |_ / _` |/ __/ _ \\ |   / _` | '_ \\/ __|")
    print("|  _| (_| | (_|  __/ |__| (_| | |_) \\__ \\")
    print("|_|  \\__,_|\\___\\___|_____\\__,_| .__/|___/")
    print("                              |_|")
    print("")
    print(f"{bcolors.OK}{version}{bcolors.RESET}")
    print(f"{bcolors.JUST}by Clure{bcolors.RESET}")
    print("")
    print("")

def loading_animation(done):
    for c in itertools.cycle(['|', '/', '-', '\\']):
        if done:
            break
        sys.stdout.write('\rLoading... ' + c)
        sys.stdout.flush()
        time.sleep(0.1)
    sys.stdout.write('\n')

def is_dir_path(path):
    """Vérifie si le chemin est un dossier valide"""
    if os.path.isdir(path):
        return path
    else:
        raise argparse.ArgumentTypeError(f"Your input: {path} is not a valid directory path")

def sysArgs():
    """Gestion des arguments en ligne de commande"""
    parser = argparse.ArgumentParser(
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent('''\
        examples of utilization:
            ./facelaps.py extract -t 0_template_photos -s 1_input -r 2_rejected -op 3_validated
            ./facelaps.py make-video -i 3_validated -o 4_video -f 7
            ./facelaps.py concatenate-videos -s 4_video
        '''))

    subparsers = parser.add_subparsers(
        help='Choose between extract, make-video or concatenate-videos modes',
        dest='action'
    )
    
    # Module 'extract'
    extract = subparsers.add_parser('extract', help='extract, recognize, scale, rotate and crop faces from files')
    extract.add_argument('-t', '--template', help='folder for template pictures', type=is_dir_path)
    extract.add_argument('-s', '--source', help='folder for source pictures', type=is_dir_path)
    extract.add_argument('-r', '--rejected', help='folder for rejected pictures', type=is_dir_path)
    extract.add_argument('-op', '--outP', help='folder for validated pictures', type=is_dir_path)

    # Module 'make-video'
    make_video = subparsers.add_parser('make-video', help='make a video from validated pictures folder')
    make_video.add_argument('-i', '--input', help='extracted pictures folder', type=is_dir_path)
    make_video.add_argument('-o', '--outV', help='folder for output video', type=is_dir_path)
    make_video.add_argument('-f', '--fps', help='frames per second in the output', type=int)    

    # Module 'concatenate-videos'
    concatenate_videos = subparsers.add_parser('concatenate-videos', help='concatenate several videos')
    concatenate_videos.add_argument('-s', '--source', help='extracted videos source folder', type=is_dir_path)

    args = vars(parser.parse_args())

    if len(sys.argv) < 2:
        parser.print_help()
        sys.exit(1)

    return args 