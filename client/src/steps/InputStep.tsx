import React, { useCallback, useEffect, useState } from 'react';
import { UploadZone } from '../components/UploadZone';

type Props = { onNext: () => void };

const PREVIEW_MAX = 24;

export function InputStep({ onNext }: Props) {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

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

  const displayFiles = files.slice(0, PREVIEW_MAX);
  const restCount = files.length - PREVIEW_MAX;

  return (
    <section className="step-content" aria-labelledby="step-input-title">
      <h2 id="step-input-title" className="section-title">Photos à traiter</h2>
      <p className="step-intro">
        Ajoutez les photos dans lesquelles chercher le visage de référence. Après extraction, les visages reconnus seront alignés, recadrés et enregistrés dans <strong>3_validated</strong>.
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

      {loading ? (
        <p className="loading-line"><span className="loading" /> Chargement…</p>
      ) : files.length === 0 ? (
        <div className="empty-state">
          <p>Aucune photo à traiter. Ajoutez des images ci‑dessus pour lancer l’extraction.</p>
        </div>
      ) : (
        <>
          <div className="card-grid">
            {displayFiles.map((f) => (
              <div key={f} className="thumb-card">
                <img src={`/files/input/${encodeURIComponent(f)}`} alt={f} loading="lazy" />
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
          {restCount > 0 && (
            <p className="muted-count">… et {restCount} autre{restCount > 1 ? 's' : ''}</p>
          )}
        </>
      )}

      <div className="actions">
        <button type="button" className="btn-primary" onClick={onNext} disabled={files.length === 0} aria-describedby={files.length === 0 ? 'input-next-hint' : undefined}>
          Lancer l’extraction →
        </button>
        {files.length === 0 && <p id="input-next-hint" className="muted actions-hint">Ajoutez au moins une photo pour continuer.</p>}
      </div>
    </section>
  );
}
