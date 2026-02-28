import React, { useCallback, useEffect, useState } from 'react';
import { UploadZone } from '../components/UploadZone';

export function VideoStep() {
  const [fps, setFps] = useState(7);
  const [making, setMaking] = useState(false);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [concatting, setConcatting] = useState(false);
  const [concatPath, setConcatPath] = useState<string | null>(null);
  const [videos, setVideos] = useState<string[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadVideos = useCallback(() => {
    setLoadingVideos(true);
    fetch('/api/folders/video')
      .then((r) => r.json())
      .then((d) => {
        setVideos(d.files ?? []);
        setLoadingVideos(false);
      })
      .catch(() => setLoadingVideos(false));
  }, []);

  useEffect(() => loadVideos(), [loadVideos]);

  const makeVideo = async () => {
    setMaking(true);
    setError(null);
    setVideoPath(null);
    try {
      const res = await fetch('/api/make-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fps }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setVideoPath(data.path);
      loadVideos();
    } catch (e: any) {
      setError(e?.message ?? 'Erreur');
    } finally {
      setMaking(false);
    }
  };

  const concatenate = async () => {
    setConcatting(true);
    setError(null);
    setConcatPath(null);
    try {
      const res = await fetch('/api/concatenate-videos', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setConcatPath(data.path);
      loadVideos();
    } catch (e: any) {
      setError(e?.message ?? 'Erreur');
    } finally {
      setConcatting(false);
    }
  };

  const deleteVideo = async (filename: string) => {
    setDeleting(filename);
    try {
      await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: 'video', files: [filename] }),
      });
      setVideos((prev) => prev.filter((f) => f !== filename));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section className="step-content">
      <h2 className="section-title">Création de la vidéo</h2>
      <p className="message info">
        Les images du dossier <strong>3_validated</strong> (ordre alphabétique) sont enchaînées en vidéo. Indiquez le nombre d’images par seconde (fps). FFmpeg doit être installé.
      </p>

      <div className="form-row">
        <label className="label-inline">
          Images par seconde
          <input
            type="number"
            min={1}
            max={30}
            value={fps}
            onChange={(e) => setFps(Number(e.target.value) || 7)}
            className="input-narrow"
          />
        </label>
        <button type="button" className="btn-primary" onClick={makeVideo} disabled={making}>
          {making ? <><span className="loading" /> Génération…</> : 'Générer la vidéo'}
        </button>
      </div>

      {error && <div className="message error">{error}</div>}
      {videoPath && (
        <div className="message success">
          Vidéo créée : <code>{videoPath.split(/[/\\]/).pop()}</code>
        </div>
      )}

      <h3 className="section-title sub">Vidéos dans 4_video</h3>
      <UploadZone
        folder="video"
        accept="video/mp4,.mp4"
        onUploaded={(uploaded) => setVideos((prev) => [...prev, ...uploaded])}
        label="Ajouter un MP4 (glisser-déposer ou clic)"
      />
      <div className="toolbar">
        <button type="button" className="btn-ghost" onClick={loadVideos} disabled={loadingVideos}>
          ↻ Rafraîchir
        </button>
      </div>
      {loadingVideos ? (
        <p className="loading-line"><span className="loading" /> Chargement…</p>
      ) : videos.length > 0 ? (
        <ul className="video-list">
          {videos.map((f) => (
            <li key={f} className="video-item">
              <a href={`/files/video/${encodeURIComponent(f)}`} target="_blank" rel="noopener noreferrer" className="video-link">
                {f}
              </a>
              <button
                type="button"
                className="btn-ghost danger"
                onClick={() => deleteVideo(f)}
                disabled={deleting === f}
                title="Supprimer la vidéo"
              >
                {deleting === f ? <span className="loading small" /> : 'Supprimer'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Aucune vidéo dans le dossier.</p>
      )}

      <h3 className="section-title sub">Concaténer plusieurs vidéos</h3>
      <p className="message info">
        Si vous avez plusieurs MP4 dans 4_video, concaténez-les en une seule (ordre alphabétique).
      </p>
      <div className="actions">
        <button type="button" className="btn-secondary" onClick={concatenate} disabled={concatting || videos.length < 2}>
          {concatting ? <><span className="loading" /> Concaténation…</> : 'Concaténer les vidéos'}
        </button>
      </div>
      {concatPath && (
        <div className="message success">
          Fichier créé : <code>{concatPath.split(/[/\\]/).pop()}</code>
        </div>
      )}
    </section>
  );
}
