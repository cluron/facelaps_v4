import cv2 as cv
import numpy as np
from pathlib import Path

class BatchVerifier:
    def __init__(self, input_dir, grid_size=(4, 4)):
        self.input_dir = Path(input_dir)
        self.rejected_dir = self.input_dir.parent / "2_rejected"
        self.grid_size = grid_size
        self.images = list(self.input_dir.glob("*.jp*g"))
        self.current_batch = 0
        self.marked_for_rejection = set()
        self.cell_size = (200, 200)
        self.button_width = 200
        self.header_height = 50
        
    def create_grid(self, images):
        """Crée une grille d'images avec boutons"""
        rows, cols = self.grid_size
        cell_w, cell_h = self.cell_size
        
        # Augmenter la hauteur du bandeau pour deux lignes
        self.header_height = 80
        
        # Créer la grille avec l'en-tête
        grid = np.zeros((cell_h * rows + self.header_height, cell_w * cols, 3), dtype=np.uint8)
        
        # Calculer le nombre total d'écrans
        total_screens = (len(self.images) + (rows * cols - 1)) // (rows * cols)
        current_screen = self.current_batch + 1
        
        # Première ligne : titre centré
        instruction = "Cliquez sur les images a supprimer du timelapse"
        instruction_size = cv.getTextSize(instruction, cv.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
        start_x = (cell_w * cols - instruction_size[0]) // 2
        cv.putText(grid, instruction, (start_x, 25),
                  cv.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        
        # Deuxième ligne : navigation et boutons
        nav_width = 40
        validate_width = 150
        
        # Zone de navigation (à gauche)
        nav_start_x = 20
        
        # Bouton Précédent (toujours visible mais grisé si inactif)
        cv.rectangle(grid, (nav_start_x, 40), (nav_start_x + nav_width, 70), 
                    (70, 70, 70) if self.current_batch > 0 else (40, 40, 40), -1)
        cv.rectangle(grid, (nav_start_x, 40), (nav_start_x + nav_width, 70), 
                    (100, 100, 100) if self.current_batch > 0 else (60, 60, 60), 2)
        cv.putText(grid, "<", (nav_start_x + 15, 60),
                  cv.FONT_HERSHEY_SIMPLEX, 0.7, 
                  (255, 255, 255) if self.current_batch > 0 else (128, 128, 128), 2)
        
        # Compteur de pages (centré entre les boutons de navigation)
        counter_text = f"Page {current_screen}/{total_screens}"
        counter_size = cv.getTextSize(counter_text, cv.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]
        counter_x = nav_start_x + nav_width + 20
        cv.putText(grid, counter_text, (counter_x, 60),
                  cv.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 2)
        
        # Bouton Suivant (toujours visible mais grisé si inactif)
        next_x = counter_x + counter_size[0] + 20
        has_next = current_screen < total_screens
        cv.rectangle(grid, (next_x, 40), (next_x + nav_width, 70), 
                    (70, 70, 70) if has_next else (40, 40, 40), -1)
        cv.rectangle(grid, (next_x, 40), (next_x + nav_width, 70), 
                    (100, 100, 100) if has_next else (60, 60, 60), 2)
        cv.putText(grid, ">", (next_x + 15, 60),
                  cv.FONT_HERSHEY_SIMPLEX, 0.7, 
                  (255, 255, 255) if has_next else (128, 128, 128), 2)
        
        # Boutons (alignés à droite)
        quit_x = cell_w * cols - nav_width - 10
        validate_x = quit_x - validate_width - 20
        
        # Bouton Supprimer
        cv.rectangle(grid, (validate_x, 40), (validate_x + validate_width, 70), 
                    (0, 0, 100), -1)
        cv.rectangle(grid, (validate_x, 40), (validate_x + validate_width, 70), 
                    (0, 0, 150), 2)
        cv.putText(grid, "Supprimer", (validate_x + 30, 60),
                  cv.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # Bouton Quitter
        cv.rectangle(grid, (quit_x, 40), (quit_x + nav_width, 70), 
                    (70, 70, 70), -1)
        cv.rectangle(grid, (quit_x, 40), (quit_x + nav_width, 70), 
                    (100, 100, 100), 2)
        cv.putText(grid, "X", (quit_x + 13, 60),
                  cv.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # Séparateur entre les deux lignes
        cv.line(grid, (0, 30), (cell_w * cols, 30), (100, 100, 100), 1)
        
        # Séparateur final
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
        
        return grid

    def handle_click(self, event, x, y, flags, param):
        """Gère les clics souris"""
        if event == cv.EVENT_LBUTTONDOWN:
            cell_w, cell_h = self.cell_size
            rows, cols = self.grid_size
            
            if y < self.header_height:  # Clics dans le bandeau
                nav_width = 40
                validate_width = 150
                
                # Vérifier les clics uniquement sur la deuxième ligne (y > 30)
                if 40 <= y <= 70:
                    # Zone de navigation (à gauche)
                    nav_start_x = 20
                    counter_text = f"Page {self.current_batch + 1}/{(len(self.images) + (rows * cols - 1)) // (rows * cols)}"
                    counter_size = cv.getTextSize(counter_text, cv.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]
                    counter_x = nav_start_x + nav_width + 20
                    next_x = counter_x + counter_size[0] + 20
                    
                    # Clic sur Précédent
                    if nav_start_x <= x <= nav_start_x + nav_width and self.current_batch > 0:
                        self.current_batch -= 1
                        self.navigation_clicked = True
                        self.save_and_continue = True
                    # Clic sur Suivant
                    elif next_x <= x <= next_x + nav_width and self.current_batch + 1 < (len(self.images) + (rows * cols - 1)) // (rows * cols):
                        self.current_batch += 1
                        self.navigation_clicked = True
                        self.save_and_continue = True
                    
                    # Boutons de droite
                    quit_x = cell_w * cols - nav_width - 10
                    validate_x = quit_x - validate_width - 20
                    
                    # Clic sur Supprimer
                    if validate_x <= x <= validate_x + validate_width:
                        if self.marked_for_rejection:
                            print("\nDéplacement des images marquées...")
                            self.save_changes()
                            # Rester sur la même grille après suppression
                            # pour voir les nouvelles images qui ont "glissé"
                            self.save_and_continue = False
                            # Forcer le rafraîchissement de l'affichage
                            start_idx = self.current_batch * (rows * cols)
                            self.current_batch_images = self.images[start_idx:start_idx + (rows * cols)]
                            grid = self.create_grid(self.current_batch_images)
                            cv.imshow('Batch Verify', grid)
                        else:
                            # S'il n'y a pas d'images à supprimer, passer à la grille suivante
                            self.save_and_continue = True
                    # Clic sur Quitter
                    elif quit_x <= x <= quit_x + nav_width:
                        self.quit = True
                    return
            else:  # Clics sur les images
                y_adjusted = y - self.header_height
                col = x // cell_w
                row = y_adjusted // cell_h
                
                if row < rows and col < cols:
                    idx = row * cols + col
                    if idx < len(self.current_batch_images):
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
        print("- Cliquez sur 'Quitter' pour terminer\n")
        
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
                if cv.waitKey(1) & 0xFF == 27:
                    self.quit = True
                    break
            
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