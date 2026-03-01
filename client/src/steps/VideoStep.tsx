import React, { useCallback, useEffect, useState } from 'react';
import { UploadZone } from '../components/UploadZone';

type VideoTabId = 'generate' | 'concat';

export function VideoStep() {
  const [activeTab, setActiveTab] = useState<VideoTabId>('generate');
  const [fps, setFps] = useState(7);
  const [making, setMaking] = useState(false);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [concatting, setConcatting] = useState(false);
  const [concatPath, setConcatPath] = useState<string | null>(null);
  const [videos, setVideos] = useState<string[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [imageCount, setImageCount] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<'chronological' | 'color' | 'similarity'>('chronological');

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
    setImageCount(null);
    try {
      const res = await fetch('/api/make-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fps, sortOrder }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setVideoPath(data.path);
      setImageCount(data.imageCount ?? null);
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
    <section className="step-content video-step" aria-labelledby="step-video-title">
      <h2 id="step-video-title" className="section-title">Vidéo</h2>
      <p className="step-intro">
        Générez un timelapse à partir des images validées ou fusionnez plusieurs MP4. FFmpeg doit être installé sur la machine.
      </p>

      <div className="content-tabs" role="tablist" aria-label="Génération ou concaténation">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'generate'}
          id="tab-video-generate"
          className={`content-tab ${activeTab === 'generate' ? 'active' : ''}`}
          onClick={() => setActiveTab('generate')}
          aria-controls="video-panel-generate"
        >
          Génération vidéo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'concat'}
          id="tab-video-concat"
          className={`content-tab ${activeTab === 'concat' ? 'active' : ''}`}
          onClick={() => setActiveTab('concat')}
          aria-controls="video-panel-concat"
        >
          Concaténation
        </button>
      </div>

      <div
        id="video-panel-generate"
        role="tabpanel"
        aria-labelledby="tab-video-generate"
        hidden={activeTab !== 'generate'}
        className="video-panel"
      >
        <p className="block-desc">Les images de <strong>3_validated</strong> sont enchaînées en vidéo. Choisissez l’ordre et le nombre d’images par seconde.</p>
        <div className="video-block video-generate">
          <div className="form-row form-row-video">
            <label className="label-inline">
              <span>Ordre des images</span>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'chronological' | 'color' | 'similarity')}
                className="video-sort-select"
                aria-describedby="sort-order-hint"
              >
                <option value="chronological">Chronologique (EXIF / date / nom)</option>
                <option value="color">Par couleur (teinte)</option>
                <option value="similarity">Par similarité (transition douce)</option>
              </select>
            </label>
            <span id="sort-order-hint" className="muted form-hint">
              {sortOrder === 'chronological' && 'Date de prise de vue ou du fichier.'}
              {sortOrder === 'color' && 'Arc-en-ciel : rouge → orange → vert → bleu…'}
              {sortOrder === 'similarity' && 'Chaque image suivante est la plus proche en couleur.'}
            </span>
          </div>
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
          {error && activeTab === 'generate' && <div className="message error">{error}</div>}
          {videoPath && (
            <div className="message success video-success">
              <strong>Vidéo créée</strong>
              {imageCount != null && <> avec {imageCount} image{imageCount > 1 ? 's' : ''}</>}.
              {' '}
              <a href={`/files/video/${encodeURIComponent(lastVideoName!)}`} target="_blank" rel="noopener noreferrer">
                Voir / télécharger
              </a>
            </div>
          )}
        </div>
      </div>

      <div
        id="video-panel-concat"
        role="tabpanel"
        aria-labelledby="tab-video-concat"
        hidden={activeTab !== 'concat'}
        className="video-panel"
      >
        <p className="block-desc">Fusionnez tous les MP4 du dossier <strong>4_video</strong> en un seul fichier (ordre alphabétique).</p>
        <div className="video-block video-list-block">
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
          <button type="button" className="btn-primary" onClick={concatenate} disabled={concatting || videos.length < 2}>
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
        {error && activeTab === 'concat' && <div className="message error">{error}</div>}
      </div>
    </section>
  );
}
