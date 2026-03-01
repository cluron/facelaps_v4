import React, { useCallback, useEffect, useRef, useState } from 'react';

type Props = { onNext: () => void };

const DRAG_THRESHOLD = 5;

function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

const PAGE_SIZE = 24;

type TabId = 'validated' | 'rejected';

type RejectReasonId = 'no_face' | 'no_match' | 'face_turned' | 'low_quality';

const REJECT_REASON_LABELS: Record<RejectReasonId, string> = {
  no_face: 'Sans visage',
  no_match: 'Sans correspondance',
  face_turned: 'Visage tourné',
  low_quality: 'Qualité insuffisante',
};

function getRejectReasonFromFilename(filename: string): RejectReasonId | null {
  if (filename.startsWith('no_face_input_')) return 'no_face';
  if (filename.startsWith('no_match_')) return 'no_match'; // crop (no_match_xxx.jpg) ou original (no_match_input_xxx)
  if (filename.startsWith('face_turned_')) return 'face_turned';
  if (filename.startsWith('low_quality_')) return 'low_quality';
  if (filename.startsWith('input_')) return 'no_face'; // ancien format
  return null;
}

const RESTORABLE_PREFIXES = ['face_turned_', 'low_quality_', 'no_match_'];
/** Fichiers non récupérables : copies de référence (sans crop) en rejected. */
const NON_RESTORABLE_PREFIXES = ['no_face_input_', 'no_match_input_'];
function isRestorableRejected(filename: string): boolean {
  if (NON_RESTORABLE_PREFIXES.some((p) => filename.startsWith(p))) return false;
  if (filename.startsWith('input_')) return false; // ancien format
  return true; // crops (reason_xxx) et rejets manuels (nom inchangé) sont récupérables
}

export function ReviewStep({ onNext }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('validated');
  const [validatedFiles, setValidatedFiles] = useState<string[]>([]);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [filterRejectReason, setFilterRejectReason] = useState<RejectReasonId | ''>('');
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selection, setSelection] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const isSelectingRef = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const filteredRejectedFiles =
    activeTab === 'rejected' && filterRejectReason
      ? rejectedFiles.filter((f) => getRejectReasonFromFilename(f) === filterRejectReason)
      : rejectedFiles;

  const files = activeTab === 'validated' ? validatedFiles : filteredRejectedFiles;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeTab, filterRejectReason, files.length]);

  const displayedFiles = files.slice(0, visibleCount);
  const hasMore = visibleCount < files.length;

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

  const load = useCallback((): Promise<{ validatedFiles: string[]; rejectedFiles: string[] }> => {
    setLoading(true);
    const safeJson = (r: Response) => (r.ok ? r.json() : Promise.resolve({ files: [] }));
    return Promise.all([
      fetch('/api/folders/validated').then(safeJson).catch(() => ({ files: [] })),
      fetch('/api/folders/rejected').then(safeJson).catch(() => ({ files: [] })),
    ])
      .then(([validatedData, rejectedData]) => {
        const validated = validatedData?.files ?? [];
        const rejected = rejectedData?.files ?? [];
        setValidatedFiles(validated);
        setRejectedFiles(rejected);
        setMarked(new Set());
        setLoading(false);
        return { validatedFiles: validated, rejectedFiles: rejected };
      })
      .catch(() => {
        setLoading(false);
        setValidatedFiles([]);
        setRejectedFiles([]);
        return { validatedFiles: [], rejectedFiles: [] };
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (files.length === 0 && lightboxOpen) setLightboxOpen(false);
  }, [files.length, lightboxOpen]);

  const toggle = useCallback((f: string) => {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }, []);

  const confirmReject = async () => {
    if (marked.size === 0) return;
    setRejecting(true);
    try {
      await fetch('/api/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: Array.from(marked) }),
      });
      load();
    } finally {
      setRejecting(false);
    }
  };

  const confirmRestore = async () => {
    const toRestore = Array.from(marked).filter(isRestorableRejected);
    if (toRestore.length === 0) return;
    setRestoring(true);
    try {
      await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: toRestore }),
      });
      load();
    } finally {
      setRestoring(false);
    }
  };

  const restorableCount = activeTab === 'rejected' ? Array.from(marked).filter(isRestorableRejected).length : 0;

  const handleGridMouseDown = useCallback((e: React.MouseEvent) => {
    if (!gridRef.current?.contains(e.target as Node)) return;
    e.preventDefault();
    startRef.current = { x: e.clientX, y: e.clientY };
    isSelectingRef.current = false;
    setSelection(null);
  }, []);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (startRef.current == null) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (!isSelectingRef.current && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        isSelectingRef.current = true;
      }
      if (isSelectingRef.current) {
        setSelection({
          x1: Math.min(startRef.current.x, e.clientX),
          y1: Math.min(startRef.current.y, e.clientY),
          x2: Math.max(startRef.current.x, e.clientX),
          y2: Math.max(startRef.current.y, e.clientY),
        });
      }
    };
    const handleUp = (e: MouseEvent) => {
      if (startRef.current == null) return;
      if (isSelectingRef.current) {
        const selRect = {
          left: Math.min(startRef.current.x, e.clientX),
          top: Math.min(startRef.current.y, e.clientY),
          right: Math.max(startRef.current.x, e.clientX),
          bottom: Math.max(startRef.current.y, e.clientY),
        };
        const cards = gridRef.current?.querySelectorAll<HTMLElement>('[data-filename]') ?? [];
        const toAdd: string[] = [];
        cards.forEach((el) => {
          const r = el.getBoundingClientRect();
          if (rectsOverlap(selRect, r)) {
            const f = el.getAttribute('data-filename');
            if (f) toAdd.push(f);
          }
        });
        if (toAdd.length > 0) {
          setMarked((prev) => {
            const next = new Set(prev);
            toAdd.forEach((f) => next.add(f));
            return next;
          });
        }
      } else {
        const el = document.elementFromPoint(startRef.current.x, startRef.current.y);
        const card = el?.closest?.('[data-filename]') as HTMLElement | null;
        if (card?.getAttribute('data-filename')) {
          toggle(card.getAttribute('data-filename')!);
        }
      }
      startRef.current = null;
      isSelectingRef.current = false;
      setSelection(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [toggle]);

  const lightboxRejectCurrent = useCallback(async () => {
    if (activeTab !== 'validated' || files.length === 0) return;
    const current = files[lightboxIndex];
    const currentIndex = lightboxIndex;
    setRejecting(true);
    try {
      await fetch('/api/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [current] }),
      });
      const data = await load();
      setMarked((prev) => {
        const next = new Set(prev);
        next.delete(current);
        return next;
      });
      if (data.validatedFiles.length === 0) closeLightbox();
      else setLightboxIndex((i) => Math.min(currentIndex, data.validatedFiles.length - 1));
    } finally {
      setRejecting(false);
    }
  }, [activeTab, files, lightboxIndex, load, closeLightbox]);

  const lightboxRestoreCurrent = useCallback(async () => {
    if (activeTab !== 'rejected' || files.length === 0) return;
    const current = files[lightboxIndex];
    if (typeof current !== 'string' || !isRestorableRejected(current)) return;
    const currentIndex = lightboxIndex;
    setRestoring(true);
    try {
      await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [current] }),
      });
      const data = await load();
      setMarked((prev) => {
        const next = new Set(prev);
        next.delete(current);
        return next;
      });
      const nextList = filterRejectReason
        ? data.rejectedFiles.filter((f) => getRejectReasonFromFilename(f) === filterRejectReason)
        : data.rejectedFiles;
      if (nextList.length === 0) closeLightbox();
      else setLightboxIndex((i) => Math.min(currentIndex, nextList.length - 1));
    } finally {
      setRestoring(false);
    }
  }, [activeTab, files, lightboxIndex, filterRejectReason, load, closeLightbox]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (activeTab === 'validated' && files.length > 0) lightboxRejectCurrent();
        else if (activeTab === 'rejected') lightboxRestoreCurrent();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxOpen, closeLightbox, goPrev, goNext, activeTab, files.length, lightboxRejectCurrent, lightboxRestoreCurrent]);

  const handleCardKeyDown = useCallback((e: React.KeyboardEvent, globalIndex: number) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      openLightbox(globalIndex);
      return;
    }
    const grid = gridRef.current;
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-index]'));
    const pos = cards.findIndex((c) => Number(c.getAttribute('data-index')) === globalIndex);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = cards[pos + 1];
      if (next) (next as HTMLButtonElement).focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = cards[pos - 1];
      if (prev) (prev as HTMLButtonElement).focus();
    }
  }, [openLightbox]);

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== ' ' || lightboxOpen || files.length === 0) return;
      const card = (e.target as HTMLElement).closest?.('[data-index]');
      if (!card) return;
      const index = Number((card as HTMLElement).getAttribute('data-index'));
      if (Number.isNaN(index)) return;
      e.preventDefault();
      e.stopPropagation();
      openLightbox(index);
    },
    [lightboxOpen, files.length, openLightbox]
  );

  if (loading) {
    return (
      <section className="step-content">
        <p className="loading-line"><span className="loading" /> Chargement…</p>
      </section>
    );
  }

  return (
    <section className="step-content" aria-labelledby="step-review-title">
      <h2 id="step-review-title" className="section-title">Vérification des visages</h2>
      <div className="message info review-instructions" role="region" aria-label="Instructions">
        <p><strong>Validés</strong> — Clic ou sélection à la souris pour marquer les images à retirer du timelapse, puis « Supprimer la sélection ».</p>
        <p><strong>Rejetés</strong> — Les visages extraits mais refusés (sans correspondance, pose, qualité) peuvent être récupérés vers 3_validated. Seules les photos sans visage détecté ne sont pas récupérables.</p>
        <p><strong>Vue agrandie</strong> — Double-clic sur une image ; <kbd>←</kbd> <kbd>→</kbd> pour naviguer ; <kbd>R</kbd> ou le bouton : « Rejeter » (Validés) ou « Récupérer » (Rejetés), puis image suivante ; <kbd>Échap</kbd> pour fermer.</p>
      </div>

      <div className="content-tabs" role="tablist" aria-label="Validés ou Rejetés">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'validated'}
          aria-controls="review-panel"
          id="tab-validated"
          className={`content-tab ${activeTab === 'validated' ? 'active' : ''}`}
          onClick={() => setActiveTab('validated')}
        >
          Validés — {validatedFiles.length}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'rejected'}
          aria-controls="review-panel"
          id="tab-rejected"
          className={`content-tab ${activeTab === 'rejected' ? 'active' : ''}`}
          onClick={() => setActiveTab('rejected')}
        >
          Rejetés — {rejectedFiles.length}
        </button>
      </div>

      <div className="toolbar">
        {activeTab === 'rejected' && rejectedFiles.length > 0 && (
          <>
            <div className="reject-filters">
              <span className="reject-filters-label">Filtrer :</span>
              <button
                type="button"
                className={`reject-filter-btn ${!filterRejectReason ? 'active' : ''}`}
                onClick={() => setFilterRejectReason('')}
              >
                Tous ({rejectedFiles.length})
              </button>
              {(['no_face', 'no_match', 'face_turned', 'low_quality'] as const).map((reason) => {
                const count = rejectedFiles.filter((f) => getRejectReasonFromFilename(f) === reason).length;
                if (count === 0) return null;
                return (
                  <button
                    key={reason}
                    type="button"
                    className={`reject-filter-btn ${filterRejectReason === reason ? 'active' : ''}`}
                    onClick={() => setFilterRejectReason(reason)}
                  >
                    {REJECT_REASON_LABELS[reason]} ({count})
                  </button>
                );
              })}
            </div>
            <span className="toolbar-sep" aria-hidden />
          </>
        )}
        <button type="button" className="btn-ghost" onClick={load} title="Rafraîchir la liste">
          ↻ Rafraîchir
        </button>
      </div>

      <div className="actions actions-top">
        {marked.size > 0 && activeTab === 'validated' && (
          <button type="button" className="btn-danger" onClick={confirmReject} disabled={rejecting}>
            {rejecting ? <span className="loading" /> : null} Supprimer la sélection ({marked.size})
          </button>
        )}
        {marked.size > 0 && activeTab === 'rejected' && (
          <button type="button" className="btn-primary" onClick={confirmRestore} disabled={restoring || restorableCount === 0} title={restorableCount === 0 ? 'Les copies « sans visage » ne sont pas récupérables' : ''}>
            {restoring ? <span className="loading" /> : null} Récupérer la sélection ({restorableCount})
          </button>
        )}
        <button type="button" className="btn-primary" onClick={onNext}>
          Passer à la vidéo →
        </button>
      </div>

      <div id="review-panel" role="tabpanel" aria-labelledby={activeTab === 'validated' ? 'tab-validated' : 'tab-rejected'}>
      {files.length === 0 ? (
        <div className="empty-state">
          <p>
            {activeTab === 'validated'
              ? 'Aucune image dans 3_validated. Lancez l’extraction d’abord.'
              : filterRejectReason
                ? `Aucune image pour « ${REJECT_REASON_LABELS[filterRejectReason]} ».`
                : 'Aucune image dans 2_rejected.'}
          </p>
        </div>
      ) : (
        <>
          <div
            ref={gridRef}
            className="selection-grid-wrapper"
            onMouseDown={handleGridMouseDown}
            onKeyDownCapture={handleGridKeyDown}
          >
            <div className="card-grid">
              {displayedFiles.map((f, i) => {
                const globalIndex = i;
                const reason = activeTab === 'rejected' ? getRejectReasonFromFilename(f) : null;
                return (
                  <button
                    key={f}
                    type="button"
                    data-filename={f}
                    data-index={globalIndex}
                    tabIndex={0}
                    className={`thumb-card clickable ${marked.has(f) ? 'marked' : ''}`}
                    onDoubleClick={() => openLightbox(globalIndex)}
                    onKeyDown={(e) => handleCardKeyDown(e, globalIndex)}
                  >
                    {activeTab === 'rejected' && reason && (
                      <span className={`thumb-badge reason-${reason}`} title={REJECT_REASON_LABELS[reason]}>
                        {REJECT_REASON_LABELS[reason]}
                      </span>
                    )}
                    <img
                      src={`/files/${activeTab}/${encodeURIComponent(f)}`}
                      alt={f}
                      loading="lazy"
                      draggable={false}
                    />
                    <span className="thumb-label">{f}</span>
                  </button>
                );
              })}
            </div>
            {selection && gridRef.current && (() => {
              const wr = gridRef.current.getBoundingClientRect();
              return (
                <div
                  className="selection-rect"
                  style={{
                    left: selection.x1 - wr.left,
                    top: selection.y1 - wr.top,
                    width: selection.x2 - selection.x1,
                    height: selection.y2 - selection.y1,
                  }}
                />
              );
            })()}
          </div>

          {hasMore && <div ref={sentinelRef} className="infinite-scroll-sentinel" aria-hidden="true" />}
          {hasMore && (
            <p className="muted infinite-scroll-hint">
              Défilez pour charger plus ({displayedFiles.length} affichées sur {files.length})…
            </p>
          )}

          {lightboxOpen && files.length > 0 && lightboxIndex >= 0 && lightboxIndex < files.length && (
            <div
              className="lightbox-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Image en grand"
              onClick={closeLightbox}
            >
              <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="lightbox-close" onClick={closeLightbox} aria-label="Fermer">
                  ×
                </button>
                <button type="button" className="lightbox-nav lightbox-prev" onClick={(e) => { e.stopPropagation(); goPrev(); }} aria-label="Image précédente">
                  ‹
                </button>
                <img
                  src={`/files/${activeTab}/${encodeURIComponent(files[lightboxIndex])}`}
                  alt={files[lightboxIndex]}
                  className="lightbox-img"
                />
                <button type="button" className="lightbox-nav lightbox-next" onClick={(e) => { e.stopPropagation(); goNext(); }} aria-label="Image suivante">
                  ›
                </button>
                {activeTab === 'validated' && (
                  <button
                    type="button"
                    className="lightbox-reject-btn"
                    onClick={(e) => { e.stopPropagation(); lightboxRejectCurrent(); }}
                    disabled={rejecting}
                    aria-label="Rejeter cette image (R)"
                    title="Rejeter (R)"
                  >
                    {rejecting ? <><span className="loading" /> Envoi…</> : 'Rejeter (R)'}
                  </button>
                )}
                {activeTab === 'rejected' && (() => {
                  const current = files[lightboxIndex];
                  const canRestore = typeof current === 'string' && isRestorableRejected(current);
                  return (
                    <button
                      type="button"
                      className="lightbox-restore-btn"
                      onClick={(e) => { e.stopPropagation(); lightboxRestoreCurrent(); }}
                      disabled={restoring || !canRestore}
                      aria-label={canRestore ? 'Récupérer cette image (R)' : 'Cette image n’est pas récupérable'}
                      title={canRestore ? 'Récupérer (R)' : 'Cette image (copie sans visage) n’est pas récupérable'}
                    >
                      {restoring ? <><span className="loading" /> Envoi…</> : 'Récupérer (R)'}
                    </button>
                  );
                })()}
                <p className="lightbox-caption">
                  {files[lightboxIndex]} <span className="lightbox-counter">({lightboxIndex + 1} / {files.length})</span>
                </p>
              </div>
            </div>
          )}

          <div className="actions">
            {marked.size > 0 && activeTab === 'validated' && (
              <button type="button" className="btn-danger" onClick={confirmReject} disabled={rejecting}>
                {rejecting ? <span className="loading" /> : null} Supprimer la sélection ({marked.size})
              </button>
            )}
            {marked.size > 0 && activeTab === 'rejected' && (
              <button type="button" className="btn-primary" onClick={confirmRestore} disabled={restoring || restorableCount === 0} title={restorableCount === 0 ? 'Les copies « sans visage » ne sont pas récupérables' : ''}>
                {restoring ? <span className="loading" /> : null} Récupérer la sélection ({restorableCount})
              </button>
            )}
            <button type="button" className="btn-primary" onClick={onNext}>
              Passer à la vidéo →
            </button>
          </div>
        </>
      )}
      </div>
    </section>
  );
}
