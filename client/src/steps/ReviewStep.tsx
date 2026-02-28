import React, { useCallback, useEffect, useRef, useState } from 'react';

type Props = { onNext: () => void };

const DRAG_THRESHOLD = 5;

function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

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

const RESTORABLE_PREFIXES = ['face_turned_', 'low_quality_'];
function isRestorableRejected(filename: string): boolean {
  return RESTORABLE_PREFIXES.some((p) => filename.startsWith(p));
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
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const isSelectingRef = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const filteredRejectedFiles =
    activeTab === 'rejected' && filterRejectReason
      ? rejectedFiles.filter((f) => getRejectReasonFromFilename(f) === filterRejectReason)
      : rejectedFiles;

  const files = activeTab === 'validated' ? validatedFiles : filteredRejectedFiles;

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

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/folders/validated').then((r) => r.json()),
      fetch('/api/folders/rejected').then((r) => r.json()),
    ])
      .then(([validatedData, rejectedData]) => {
        setValidatedFiles(validatedData.files ?? []);
        setRejectedFiles(rejectedData.files ?? []);
        setMarked(new Set());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load]);

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

  const handleCardKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      openLightbox(index);
      return;
    }
    const grid = gridRef.current;
    if (!grid) return;
    const cards = grid.querySelectorAll<HTMLElement>('[data-index]');
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = cards[index + 1];
      if (next) (next as HTMLButtonElement).focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = cards[index - 1];
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
    <section className="step-content">
      <h2 className="section-title">Vérification des visages extraits</h2>
      <p className="message info">
        <strong>Validés</strong> : cliquez ou sélectionnez à la souris les images à retirer du timelapse, puis « Supprimer la sélection » (elles iront dans 2_rejected).<br />
        <strong>Rejetés</strong> : les visages extraits mais refusés (pose/qualité) peuvent être récupérés vers 3_validated. Les <code>input_xxx</code> sont les photos d’origine sans visage reconnu et ne sont pas récupérables.<br />
        <strong>Vue agrandie</strong> : double-clic sur une image pour l’ouvrir en grand ; <kbd>←</kbd> <kbd>→</kbd> pour naviguer ; <kbd>Échap</kbd> pour fermer.
      </p>

      <div className="review-tabs">
        <button
          type="button"
          className={`review-tab ${activeTab === 'validated' ? 'active' : ''}`}
          onClick={() => setActiveTab('validated')}
        >
          Validés (3_validated) — {validatedFiles.length}
        </button>
        <button
          type="button"
          className={`review-tab ${activeTab === 'rejected' ? 'active' : ''}`}
          onClick={() => setActiveTab('rejected')}
        >
          Rejetés (2_rejected) — {rejectedFiles.length}
        </button>
      </div>

      <div className="toolbar">
        {activeTab === 'rejected' && rejectedFiles.length > 0 && (
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
        )}
        <button type="button" className="btn-ghost" onClick={load} title="Rafraîchir">
          ↻ Rafraîchir
        </button>
      </div>

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
              {files.map((f, index) => {
                const reason = activeTab === 'rejected' ? getRejectReasonFromFilename(f) : null;
                return (
                  <button
                    key={f}
                    type="button"
                    data-filename={f}
                    data-index={index}
                    tabIndex={0}
                    className={`thumb-card clickable ${marked.has(f) ? 'marked' : ''}`}
                    onDoubleClick={() => openLightbox(index)}
                    onKeyDown={(e) => handleCardKeyDown(e, index)}
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

          {lightboxOpen && files.length > 0 && (
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
              <button type="button" className="btn-primary" onClick={confirmRestore} disabled={restoring || restorableCount === 0} title={restorableCount === 0 ? 'Seules les images extraites (crops) sont récupérables' : ''}>
                {restoring ? <span className="loading" /> : null} Récupérer la sélection ({restorableCount})
              </button>
            )}
            <button type="button" className="btn-primary" onClick={onNext}>
              Créer la vidéo →
            </button>
          </div>
        </>
      )}
    </section>
  );
}
