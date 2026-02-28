import React, { useCallback, useEffect, useRef, useState } from 'react';

type Props = { onNext: () => void };

const DRAG_THRESHOLD = 5;

function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

export function ReviewStep({ onNext }: Props) {
  const [files, setFiles] = useState<string[]>([]);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState(false);
  const [selection, setSelection] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const isSelectingRef = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/folders/validated')
      .then((r) => r.json())
      .then((d) => {
        setFiles(d.files ?? []);
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
        Cliquez sur une image pour la marquer, ou <strong>maintenez et étirez</strong> pour sélectionner plusieurs images à la souris (elles iront dans <strong>2_rejected</strong>). Puis « Supprimer la sélection ».
      </p>

      <div className="toolbar">
        <button type="button" className="btn-ghost" onClick={load} title="Rafraîchir">
          ↻ Rafraîchir
        </button>
      </div>

      {files.length === 0 ? (
        <div className="empty-state">
          <p>Aucune image dans 3_validated. Lancez l’extraction d’abord.</p>
        </div>
      ) : (
        <>
          <div
            ref={gridRef}
            className="selection-grid-wrapper"
            onMouseDown={handleGridMouseDown}
          >
            <div className="card-grid">
              {files.map((f) => (
                <button
                  key={f}
                  type="button"
                  data-filename={f}
                  className={`thumb-card clickable ${marked.has(f) ? 'marked' : ''}`}
                >
                  <img src={`/files/validated/${encodeURIComponent(f)}`} alt={f} loading="lazy" draggable={false} />
                  <span className="thumb-label">{f}</span>
                </button>
              ))}
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
          <div className="actions">
            {marked.size > 0 && (
              <button type="button" className="btn-danger" onClick={confirmReject} disabled={rejecting}>
                {rejecting ? <span className="loading" /> : null} Supprimer la sélection ({marked.size})
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
