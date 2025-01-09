import cv2 as cv
import numpy as np
from pathlib import Path
from face_quality import FaceQualityAnalyzer
from utils import bcolors

class BatchVerifier:
    def __init__(self, input_dir, grid_size=(4, 4)):
        self.input_dir = Path(input_dir)
        self.rejected_dir = self.input_dir.parent / "2_rejected"
        self.grid_size = grid_size
        self.images = list(self.input_dir.glob("*.jp*g"))
        self.current_batch = 0
        self.marked_for_rejection = set()
        self.cell_size = (200, 200)
        self.header_height = 80
        self.selected_image = None  # Pour tracker l'image sélectionnée
        
        # Initialiser l'analyseur de qualité
        self.analyzer = FaceQualityAnalyzer(self.input_dir, self.rejected_dir)
        
        # Trier les images par qualité
        self.image_qualities = {}
        for img_path in self.images:
            quality = self.analyzer.get_image_quality(img_path)
            self.image_qualities[img_path] = quality['score']
        
        # Trier les images par score de qualité (croissant)
        self.images.sort(key=lambda x: self.image_qualities[x])
        
    def create_grid(self, images):
        rows, cols = self.grid_size
        cell_w, cell_h = self.cell_size
        
        # Augmenter la hauteur du bandeau pour avoir 8 lignes de texte
        self.header_height = 250  # Augmenté pour ajouter les 3 lignes de légende
        
        # Créer la grille avec l'en-tête
        grid = np.zeros((cell_h * rows + self.header_height, cell_w * cols, 3), dtype=np.uint8)
        
        # Première ligne : navigation et boutons (y = 35)
        nav_width = 40
        validate_width = 150
        nav_start_x = 20
        
        # Calculer le nombre total de pages en fonction du nombre actuel d'images
        total_pages = max(1, (len(self.images) + (rows * cols - 1)) // (rows * cols))
        current_page = min(self.current_batch + 1, total_pages)  # S'assurer que la page courante ne dépasse pas le total
        
        # Boutons de navigation
        cv.rectangle(grid, (nav_start_x, 10), (nav_start_x + nav_width, 40), 
                    (70, 70, 70) if self.current_batch > 0 else (40, 40, 40), -1)
        cv.putText(grid, "<", (nav_start_x + 15, 30),
                  cv.FONT_HERSHEY_SIMPLEX, 0.7, 
                  (255, 255, 255) if self.current_batch > 0 else (128, 128, 128), 2)
        
        # Compteur de pages
        counter_text = f"Page {current_page}/{total_pages}"
        counter_x = nav_start_x + nav_width + 20
        cv.putText(grid, counter_text, (counter_x, 30),
                  cv.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 2)
        
        # Bouton Suivant
        next_x = counter_x + 100
        cv.rectangle(grid, (next_x, 10), (next_x + nav_width, 40), 
                    (70, 70, 70) if current_page < total_pages else (40, 40, 40), -1)
        cv.putText(grid, ">", (next_x + 15, 30),
                  cv.FONT_HERSHEY_SIMPLEX, 0.7, 
                  (255, 255, 255) if current_page < total_pages else (128, 128, 128), 2)
        
        # Boutons alignés à droite
        quit_x = cell_w * cols - nav_width - 10
        validate_x = quit_x - validate_width - 20
        
        cv.rectangle(grid, (validate_x, 10), (validate_x + validate_width, 40), 
                    (0, 0, 100), -1)
        cv.putText(grid, "Supprimer", (validate_x + 30, 30),
                  cv.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        cv.rectangle(grid, (quit_x, 10), (quit_x + nav_width, 40), 
                    (70, 70, 70), -1)
        cv.putText(grid, "X", (quit_x + 13, 30),
                  cv.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # Ligne de séparation après les boutons
        cv.line(grid, (0, 45), (cell_w * cols, 45), (100, 100, 100), 1)
        
        # Messages alignés à gauche avec une ligne par message
        margin_left = 20  # Marge gauche pour tous les messages
        
        # Deuxième ligne : titre principal (y = 70)
        title = "Cliquer pour supprimer certaines images du timelapse"
        cv.putText(grid, title, (margin_left, 70),
                  cv.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        
        # Troisième ligne : instructions (y = 95)
        instructions = "Clic : marquer/demarquer une image pour suppression"
        cv.putText(grid, instructions, (margin_left, 95),
                  cv.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
        
        # Quatrième ligne : instructions supplémentaires (y = 120)
        instructions2 = "Clic puis Espace : visualiser l'image en grand"
        cv.putText(grid, instructions2, (margin_left, 120),
                  cv.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
        
        # Cinquième ligne : information sur la qualité (y = 145)
        quality_note = "Les images sont triees par qualite (moins bonnes en premier)"
        cv.putText(grid, quality_note, (margin_left, 145),
                  cv.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
        
        # Sixième ligne : légende qualité bonne (y = 170)
        cv.putText(grid, "Vert : Bonne qualite (>= 75%)", (margin_left, 170),
                  cv.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        
        # Septième ligne : légende qualité acceptable (y = 195)
        cv.putText(grid, "Jaune : Qualite acceptable (60-74%)", (margin_left, 195),
                  cv.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        
        # Huitième ligne : légende qualité médiocre (y = 220)
        cv.putText(grid, "Rouge : Qualite mediocre (< 60%)", (margin_left, 220),
                  cv.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        
        # Ligne de séparation finale
        cv.line(grid, (0, self.header_height-1), (cell_w * cols, self.header_height-1), 
               (100, 100, 100), 1)
        
        # Ajouter les images
        for idx, img_path in enumerate(images):
            if idx >= rows * cols:
                break
                
            img = cv.imread(str(img_path))
            if img is None:
                continue
            img = cv.resize(img, (cell_w, cell_h))
            
            r, c = idx // cols, idx % cols
            y, x = r * cell_h + self.header_height, c * cell_w
            
            # Ajouter l'image
            grid[y:y+cell_h, x:x+cell_w] = img
            
            # Calculer l'index global pour la vérification
            global_idx = self.current_batch * (rows * cols) + idx
            
            # Ajouter un overlay rouge si l'image est marquée
            if global_idx in self.marked_for_rejection:
                overlay = img.copy()
                cv.rectangle(overlay, (0, 0), (cell_w, cell_h), (0, 0, 255), -1)
                cv.addWeighted(overlay, 0.3, img, 0.7, 0, img)
                grid[y:y+cell_h, x:x+cell_w] = img
            
            # Afficher uniquement le score avec la couleur appropriée
            quality = self.image_qualities[img_path]
            score_text = f"{quality:.0f}%"
            
            if quality >= 75:
                color = (0, 255, 0)  # Vert pour "Bonne"
            elif quality >= 60:
                color = (0, 255, 255)  # Jaune pour "Acceptable"
            else:
                color = (0, 0, 255)  # Rouge pour "Médiocre"
            
            cv.putText(grid, score_text, (x+10, y+25),
                      cv.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
            
            # Suppression de l'affichage des problèmes sur les miniatures
        
        return grid

    def handle_click(self, event, x, y, flags, param):
        """Gère les clics souris"""
        if event == cv.EVENT_LBUTTONDOWN:
            cell_w, cell_h = self.cell_size
            rows, cols = self.grid_size
            
            # Ajuster la zone de clic des boutons pour qu'elle soit plus large
            if y <= 45:  # Zone des boutons (augmentée)
                nav_width = 40
                validate_width = 150
                nav_start_x = 20
                counter_x = nav_start_x + nav_width + 20
                next_x = counter_x + 100
                
                # Boutons de droite
                quit_x = cell_w * cols - nav_width - 10
                validate_x = quit_x - validate_width - 20
                
                # Clic sur Précédent (zone plus large)
                if 0 <= x <= nav_start_x + nav_width + 10 and self.current_batch > 0:
                    self.current_batch -= 1
                    self.navigation_clicked = True
                    self.save_and_continue = True
                # Clic sur Suivant (zone plus large)
                elif next_x - 10 <= x <= next_x + nav_width + 10 and self.current_batch + 1 < (len(self.images) + (rows * cols - 1)) // (rows * cols):
                    self.current_batch += 1
                    self.navigation_clicked = True
                    self.save_and_continue = True
                # Clic sur Supprimer (zone plus large)
                elif validate_x - 10 <= x <= validate_x + validate_width + 10:
                    if self.marked_for_rejection:
                        print("\nDéplacement des images marquées...")
                        self.save_changes()
                        self.save_and_continue = False
                        start_idx = self.current_batch * (rows * cols)
                        self.current_batch_images = self.images[start_idx:start_idx + (rows * cols)]
                        grid = self.create_grid(self.current_batch_images)
                        cv.imshow('Batch Verify', grid)
                    else:
                        self.save_and_continue = True
                # Clic sur Quitter (zone plus large)
                elif quit_x - 10 <= x <= quit_x + nav_width + 20:
                    self.quit = True
            else:  # Clics sur les images
                y_adjusted = y - self.header_height
                col = x // cell_w
                row = y_adjusted // cell_h
                
                if row < rows and col < cols:
                    idx = row * cols + col
                    if idx < len(self.current_batch_images):
                        # Stocker uniquement la dernière image sélectionnée
                        self.selected_image = self.current_batch_images[idx]
                        # Calculer l'index global
                        global_idx = self.current_batch * (rows * cols) + idx
                        
                        # Basculer l'état de sélection
                        if global_idx in self.marked_for_rejection:
                            self.marked_for_rejection.remove(global_idx)
                        else:
                            self.marked_for_rejection.add(global_idx)
                        
                        # Rafraîchir l'affichage
                        grid = self.create_grid(self.current_batch_images)
                        cv.imshow('Batch Verify', grid)

    def run(self):
        """Lance l'interface de vérification par lots"""
        print("\nMode de vérification par lots")
        print("Instructions:")
        print("- Cliquez sur les images à rejeter")
        print("- Cliquez sur 'Supprimer' pour confirmer")
        print("- Cliquez sur 'Quitter' ou 'q' pour terminer\n")
        
        cv.namedWindow('Batch Verify', cv.WINDOW_NORMAL)
        cv.setMouseCallback('Batch Verify', self.handle_click)
        
        while True:
            start_idx = self.current_batch * (self.grid_size[0] * self.grid_size[1])
            self.current_batch_images = self.images[start_idx:start_idx + (self.grid_size[0] * self.grid_size[1])]
            
            if not self.current_batch_images:
                break
            
            self.save_and_continue = False
            self.quit = False
            self.navigation_clicked = False
            
            grid = self.create_grid(self.current_batch_images)
            cv.imshow('Batch Verify', grid)
            
            while not (self.save_and_continue or self.quit or self.navigation_clicked):
                key = cv.waitKey(1) & 0xFF
                if key == 27 or key == ord('q'):  # Échap ou 'q'
                    self.quit = True
                    break
                elif key == 32 and self.selected_image:  # Espace
                    # Afficher l'image en grand dans la même fenêtre
                    img = cv.imread(str(self.selected_image))
                    if img is not None:
                        # Obtenir les dimensions de l'écran
                        screen_w = cv.getWindowImageRect('Batch Verify')[2]
                        screen_h = cv.getWindowImageRect('Batch Verify')[3]
                        
                        # Redimensionner l'image pour qu'elle tienne dans l'écran
                        h, w = img.shape[:2]
                        ratio = min(screen_w/w, screen_h/h) * 0.8
                        new_size = (int(w*ratio), int(h*ratio))
                        img_resized = cv.resize(img, new_size)
                        
                        # Afficher les problèmes de qualité
                        if self.selected_image in self.image_qualities:
                            quality = self.image_qualities[self.selected_image]
                            if quality < 60:
                                quality_info = self.analyzer.get_image_quality(self.selected_image)
                                issues_text = f"Qualité: {quality:.0f}% - " + ", ".join(quality_info['issues'])
                                cv.putText(img_resized, issues_text, (10, 30),
                                         cv.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
                        
                        # Afficher dans la même fenêtre
                        cv.imshow('Batch Verify', img_resized)
                        
                        # Attendre la touche espace pour revenir à la grille
                        while True:
                            k = cv.waitKey(1) & 0xFF
                            if k == 32 or k == 27 or k == ord('q'):  # Espace, Échap ou 'q' pour revenir
                                break
                        
                        # Revenir à la grille
                        grid = self.create_grid(self.current_batch_images)
                        cv.imshow('Batch Verify', grid)
            
            if self.quit:
                break
            
            # Incrémenter seulement si on n'a pas utilisé la navigation
            # et qu'on a explicitement demandé à continuer
            if not self.navigation_clicked and self.save_and_continue:
                self.current_batch += 1
        
        cv.destroyAllWindows()
        
        if self.marked_for_rejection:
            print("\nSauvegarde des changements...")
            self.save_changes()
    
    def save_changes(self):
        """Déplace les images marquées vers le dossier rejected"""
        if not self.marked_for_rejection:
            return
            
        self.rejected_dir.mkdir(exist_ok=True)
        
        # Créer une copie car on va modifier le set pendant l'itération
        marked_copy = self.marked_for_rejection.copy()
        
        for idx in marked_copy:
            if idx < len(self.images):
                img_path = self.images[idx]
                try:
                    img_path.rename(self.rejected_dir / img_path.name)
                    print(f"✗ Rejeté : {img_path.name}")
                    self.marked_for_rejection.remove(idx)
                except Exception as e:
                    print(f"Erreur lors du déplacement de {img_path.name}: {str(e)}")
        
        # Mettre à jour la liste des images et recalculer les indices
        self.images = list(self.input_dir.glob("*.jp*g"))
        
        # Ajuster les indices restants dans marked_for_rejection
        new_marked = set()
        rows, cols = self.grid_size
        batch_size = rows * cols
        
        for old_idx in self.marked_for_rejection:
            # Calculer la position relative dans la grille
            batch_num = old_idx // batch_size
            pos_in_batch = old_idx % batch_size
            
            # Calculer le nouvel index en tenant compte des suppressions
            new_idx = batch_num * batch_size + pos_in_batch
            if new_idx < len(self.images):
                new_marked.add(new_idx)
        
        self.marked_for_rejection = new_marked 