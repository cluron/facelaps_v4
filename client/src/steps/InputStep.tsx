import React, { useCallback, useEffect, useRef, useState } from 'react';
import { UploadZone } from '../components/UploadZone';

type Props = { onNext: () => void };

const PAGE_SIZE = 24;

export function InputStep({ onNext }: Props) {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/folders/input')
      .then((r) => r.json())
      .then((d) => {
        setFiles(d.files ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [files.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || files.length <= PAGE_SIZE) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting)
          setVisibleCount((n) => Math.min(n + PAGE_SIZE, files.length));
      },
      { rootMargin: '200px', threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [files.length, visibleCount]);

  const displayFiles = files.slice(0, visibleCount);
  const hasMore = visibleCount < files.length;

  const openLightbox = useCallback((index: number) => {
    if (index < 0 || index >= files.length) return;
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, [files.length]);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  const goPrev = useCallback(() => {
    setLightboxIndex((i) => (i - 1 + files.length) % files.length);
  }, [files.length]);

  const goNext = useCallback(() => {
    setLightboxIndex((i) => (i + 1) % files.length);
  }, [files.length]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxOpen, closeLightbox, goPrev, goNext]);

  const handleDelete = async (filename: string) => {
    setDeleting(filename);
    try {
      await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: 'input', files: [filename] }),
      });
      setFiles((prev) => prev.filter((f) => f !== filename));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section className="step-content" aria-labelledby="step-input-title">
      <h2 id="step-input-title" className="section-title">Photos à traiter</h2>
      <p className="step-intro">
        Ajoutez les photos dans lesquelles chercher le visage de référence. Après extraction, les visages reconnus seront alignés, recadrés et enregistrés dans <strong>3_validated</strong>. Cliquez sur une photo pour l’agrandir ; <kbd>←</kbd> <kbd>→</kbd> pour naviguer, <kbd>Échap</kbd> pour fermer.
      </p>

      <UploadZone
        folder="input"
        onUploaded={(uploaded) => setFiles((prev) => [...prev, ...uploaded])}
        label="Ajouter des photos (glisser-déposer ou clic)"
      />

      <div className="toolbar">
        <button type="button" className="btn-ghost" onClick={load} disabled={loading} title="Rafraîchir la liste">
          ↻ Rafraîchir
        </button>
      </div>

      <div className="actions actions-top">
        <button type="button" className="btn-primary" onClick={onNext} disabled={files.length === 0} aria-describedby={files.length === 0 ? 'input-next-hint-top' : undefined}>
          Lancer l’extraction →
        </button>
        {files.length === 0 && <p id="input-next-hint-top" className="muted actions-hint">Ajoutez au moins une photo pour continuer.</p>}
      </div>

      {loading ? (
        <p className="loading-line"><span className="loading" /> Chargement…</p>
      ) : files.length === 0 ? (
        <div className="empty-state">
          <p>Aucune photo à traiter. Ajoutez des images ci‑dessus pour lancer l’extraction.</p>
        </div>
      ) : (
        <>
          <div className="card-grid">
            {displayFiles.map((f, index) => (
              <div
                key={f}
                className="thumb-card clickable"
                role="button"
                tabIndex={0}
                onClick={() => openLightbox(index)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openLightbox(index);
                  }
                }}
                aria-label={`Voir ${f} en grand`}
              >
                <img src={`/files/input/${encodeURIComponent(f)}`} alt={f} loading="lazy" draggable={false} />
                <span className="thumb-label">{f}</span>
                <button
                  type="button"
                  className="thumb-delete"
                  onClick={(e) => { e.stopPropagation(); handleDelete(f); }}
                  disabled={deleting === f}
                  title="Supprimer"
                  aria-label="Supprimer"
                >
                  {deleting === f ? <span className="loading small" /> : '×'}
                </button>
              </div>
            ))}
          </div>
          {hasMore && <div ref={sentinelRef} className="infinite-scroll-sentinel" aria-hidden="true" />}
          {hasMore && (
            <p className="muted infinite-scroll-hint">
              Défilez pour charger plus de photos ({displayFiles.length} affichées sur {files.length})…
            </p>
          )}

          {lightboxOpen && files.length > 0 && lightboxIndex >= 0 && lightboxIndex < files.length && (
            <div
              className="lightbox-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Photo en grand"
              onClick={closeLightbox}
            >
              <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="lightbox-close" onClick={closeLightbox} aria-label="Fermer">
                  ×
                </button>
                <button type="button" className="lightbox-nav lightbox-prev" onClick={(e) => { e.stopPropagation(); goPrev(); }} aria-label="Photo précédente">
                  ‹
                </button>
                <img
                  src={`/files/input/${encodeURIComponent(files[lightboxIndex])}`}
                  alt={files[lightboxIndex]}
                  className="lightbox-img"
                />
                <button type="button" className="lightbox-nav lightbox-next" onClick={(e) => { e.stopPropagation(); goNext(); }} aria-label="Photo suivante">
                  ›
                </button>
                <p className="lightbox-caption">
                  {files[lightboxIndex]} <span className="lightbox-counter">({lightboxIndex + 1} / {files.length})</span>
                </p>
              </div>
            </div>
          )}
        </>
      )}

      <div className="actions">
        <button type="button" className="btn-primary" onClick={onNext} disabled={files.length === 0} aria-describedby={files.length === 0 ? 'input-next-hint' : undefined}>
          Lancer l’extraction →
        </button>
        {files.length === 0 && <p id="input-next-hint" className="muted actions-hint" aria-hidden="true">Ajoutez au moins une photo pour continuer.</p>}
      </div>
    </section>
  );
}
