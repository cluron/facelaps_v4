import React, { useCallback, useEffect, useState } from 'react';
import { UploadZone } from '../components/UploadZone';

type Props = { onNext: () => void };

export function TemplatesStep({ onNext }: Props) {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/folders/templates')
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
        body: JSON.stringify({ folder: 'templates', files: [filename] }),
      });
      setFiles((prev) => prev.filter((f) => f !== filename));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section className="step-content">
      <h2 className="section-title">Photos de référence (templates)</h2>
      <p className="message info">
        Quelques photos du visage à reconnaître (même personne, face de préférence). Vous pouvez les déposer ici ou les placer dans le dossier <strong>0_template_photos</strong>.
      </p>

      <UploadZone
        folder="templates"
        onUploaded={(uploaded) => setFiles((prev) => [...prev, ...uploaded])}
        label="Ajouter des photos de référence (glisser-déposer ou clic)"
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
          <p>Aucune image. Ajoutez au moins une photo de référence ci‑dessus.</p>
        </div>
      ) : (
        <div className="card-grid">
          {files.map((f) => (
            <div key={f} className="thumb-card">
              <img src={`/files/templates/${encodeURIComponent(f)}`} alt={f} loading="lazy" />
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
      )}

      <div className="actions">
        <button type="button" className="btn-primary" onClick={onNext} disabled={files.length === 0}>
          Continuer →
        </button>
      </div>
    </section>
  );
}
