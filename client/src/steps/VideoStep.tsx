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

  const lastVideoName = videoPath?.split(/[/\\]/).pop() ?? null;
  const lastConcatName = concatPath?.split(/[/\\]/).pop() ?? null;

  return (
    <section className="step-content video-step">
      <h2 className="section-title">Vidéo</h2>
      <p className="step-desc">
        Les images de <strong>3_validated</strong> (ordre alphabétique) sont enchaînées en vidéo. FFmpeg doit être installé sur la machine.
      </p>

      <div className="video-block video-generate">
        <h3 className="block-title">Générer une vidéo</h3>
        <p className="block-desc">Choisissez le nombre d’images par seconde (fps) pour le timelapse.</p>
        <div className="form-row form-row-video">
          <label className="label-inline">
            <span>Images / seconde</span>
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
          <div className="message success video-success">
            <strong>Vidéo créée.</strong>{' '}
            <a href={`/files/video/${encodeURIComponent(lastVideoName!)}`} target="_blank" rel="noopener noreferrer">
              Voir / télécharger
            </a>
          </div>
        )}
      </div>

      <div className="video-block video-list-block">
        <h3 className="block-title">Vidéos dans 4_video</h3>
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
      </div>

      <div className="video-block video-concat">
        <h3 className="block-title">Concaténer plusieurs vidéos</h3>
        <p className="block-desc">Fusionnez tous les MP4 du dossier en un seul fichier (ordre alphabétique).</p>
        <button type="button" className="btn-secondary" onClick={concatenate} disabled={concatting || videos.length < 2}>
          {concatting ? <><span className="loading" /> Concaténation…</> : 'Concaténer les vidéos'}
        </button>
        {concatPath && (
          <div className="message success video-success">
            <strong>Fichier créé.</strong>{' '}
            <a href={`/files/video/${encodeURIComponent(lastConcatName!)}`} target="_blank" rel="noopener noreferrer">
              Voir / télécharger
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
