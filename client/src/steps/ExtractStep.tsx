import React, { useState } from 'react';
import { extractInBrowser, type ExtractResult, type ExtractOptions } from '../face/browserExtract';

type Props = { onNext: () => void };

export function ExtractStep({ onNext }: Props) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [liveResults, setLiveResults] = useState<ExtractResult[]>([]);
  const [results, setResults] = useState<ExtractResult[] | null>(null);
  const [matched, setMatched] = useState<number | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const [eyeSpanRatio, setEyeSpanRatio] = useState(0.2);
  const [canonEyeY, setCanonEyeY] = useState(0.5);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.4);
  const [detectionMinConfidence, setDetectionMinConfidence] = useState(0.28);
  const [faceTurnEnabled, setFaceTurnEnabled] = useState(true);
  const [faceTurnThreshold, setFaceTurnThreshold] = useState(0.55);
  const [blurCheckEnabled, setBlurCheckEnabled] = useState(true);
  const [minBlurVariance, setMinBlurVariance] = useState(80);

  const runExtract = async () => {
    setRunning(true);
    setError(null);
    setResults(null);
    setLiveResults([]);
    setRejectReasons({});
    setProgress('Récupération de la liste des images…');
    try {
      const [templatesRes, inputRes] = await Promise.all([
        fetch('/api/folders/templates'),
        fetch('/api/folders/input'),
      ]);
      const templatesData = await templatesRes.json();
      const inputData = await inputRes.json();
      const templateFiles: string[] = templatesData.files ?? [];
      const inputFiles: string[] = inputData.files ?? [];

      if (templateFiles.length === 0) {
        setError('Aucune image dans les templates (0_template_photos).');
        return;
      }
      if (inputFiles.length === 0) {
        setError('Aucune image dans l’entrée (1_input).');
        return;
      }

      const templateUrls = templateFiles.map((f: string) => `/files/templates/${encodeURIComponent(f)}`);
      const inputWithUrls = inputFiles.map((name: string) => ({
        name,
        url: `/files/input/${encodeURIComponent(name)}`,
      }));

      const extractOptions: ExtractOptions = {
        eyeSpanRatio,
        canonEyeY,
        similarityThreshold,
        detectionMinConfidence,
        faceTurnThreshold: faceTurnEnabled ? faceTurnThreshold : 0,
        minBlurVariance: blurCheckEnabled ? minBlurVariance : 0,
      };
      const { results: res, validated, rejected } = await extractInBrowser(
        templateUrls,
        inputWithUrls,
        (msg) => setProgress(msg),
        extractOptions,
        (item) => setLiveResults((prev) => [...prev, item])
      );

      setProgress('Envoi des résultats au serveur…');
      const form = new FormData();
      validated.forEach(({ name, blob }) => form.append('validated', blob, name));
      const rejectedCopyFromInput = rejected.filter((r) => !r.blob).map((r) => ({ sourceName: r.sourceName, reason: r.reason }));
      rejected.filter((r) => r.blob).forEach((r) => {
        const outName = r.sourceName.replace(/\.[a-z]+$/i, '.jpg');
        form.append('rejectedCrop', r.blob!, `${r.reason}_${outName}`);
      });
      form.append('rejected', JSON.stringify(rejectedCopyFromInput));
      form.append('validatedSourceNames', JSON.stringify(validated.map((v) => v.sourceName)));

      const completeRes = await fetch('/api/extract/complete', { method: 'POST', body: form });
      const completeData = await completeRes.json().catch(() => ({}));
      if (!completeRes.ok) {
        setError(completeData?.error ?? `Erreur ${completeRes.status}`);
        return;
      }

      setResults(res);
      setMatched(validated.length);
      setRejectReasons(
        res.reduce(
          (acc, r) => {
            if (!r.ok) acc[r.reason] = (acc[r.reason] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        )
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur réseau ou extraction');
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const total = results?.length ?? 0;
  const rejected = total - (matched ?? 0);

  return (
    <section className="step-content extract-step" aria-labelledby="step-extract-title">
      <h2 id="step-extract-title" className="section-title">Extraction des visages</h2>
      <p className="step-desc">
        Ajustez les options ci‑dessous puis lancez l’extraction. Détection et comparaison au template dans le navigateur, alignement et recadrage. Les photos non retenues sont copiées dans <strong>2_rejected</strong>.
      </p>

      {running && (
        <div className="extract-live-progress extract-live-progress--top">
          <p className="extract-live-message">{progress ?? 'Extraction…'}</p>
          {liveResults.length > 0 && (
            <div className="extract-live-counts">
              Validés : <strong>{liveResults.filter((r) => r.ok).length}</strong>
              {' · '}
              Rejetés : <strong>{liveResults.filter((r) => !r.ok).length}</strong>
            </div>
          )}
        </div>
      )}

      <div className="extract-params">
        <fieldset className="param-group">
          <legend>Cadrage</legend>
          <div className="param-row">
            <label>
              <span className="param-label">Zoom</span>
              <span className="param-hint">Plus bas = moins zoomé, plus de contexte</span>
              <div className="param-input">
                <input
                  type="range"
                  min={0.12}
                  max={0.35}
                  step={0.01}
                  value={eyeSpanRatio}
                  onChange={(e) => setEyeSpanRatio(Number(e.target.value))}
                  disabled={running}
                />
                <span className="param-value">{Math.round(eyeSpanRatio * 100)} %</span>
              </div>
            </label>
          </div>
          <div className="param-row">
            <label>
              <span className="param-label">Position verticale des yeux</span>
              <span className="param-hint">0,5 = centre de l’image</span>
              <div className="param-input">
                <input
                  type="range"
                  min={0.4}
                  max={0.6}
                  step={0.02}
                  value={canonEyeY}
                  onChange={(e) => setCanonEyeY(Number(e.target.value))}
                  disabled={running}
                />
                <span className="param-value">{canonEyeY.toFixed(2)}</span>
              </div>
            </label>
          </div>
        </fieldset>
        <fieldset className="param-group">
          <legend>Filtrage</legend>
          <div className="param-row">
            <label>
              <span className="param-label">Seuil de similarité</span>
              <span className="param-hint">Plus bas = plus de photos acceptées (même personne)</span>
              <div className="param-input">
                <input
                  type="range"
                  min={0.3}
                  max={0.6}
                  step={0.05}
                  value={similarityThreshold}
                  onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
                  disabled={running}
                />
                <span className="param-value">{similarityThreshold.toFixed(2)}</span>
              </div>
            </label>
          </div>
          <div className="param-row">
            <label>
              <span className="param-label">Seuil de confiance du détecteur</span>
              <span className="param-hint">Plus bas = on accepte plus de détections (visages de profil, petits ou flous). Plus haut = uniquement les visages très nets.</span>
              <div className="param-input">
                <input
                  type="range"
                  min={0.15}
                  max={0.45}
                  step={0.02}
                  value={detectionMinConfidence}
                  onChange={(e) => setDetectionMinConfidence(Number(e.target.value))}
                  disabled={running}
                />
                <span className="param-value">{detectionMinConfidence.toFixed(2)}</span>
              </div>
            </label>
          </div>
        </fieldset>
        <fieldset className="param-group">
          <legend>Qualité et pose</legend>
          <div className="param-row param-row-checkbox">
            <label className="param-checkbox-label">
              <input
                type="checkbox"
                checked={faceTurnEnabled}
                onChange={(e) => setFaceTurnEnabled(e.target.checked)}
                disabled={running}
              />
              <span>Rejeter les visages trop tournés (de profil)</span>
            </label>
            {faceTurnEnabled && (
              <div className="param-inline-block">
                <div className="param-input-inline">
                  <span className="param-label">Seuil</span>
                  <input
                    type="range"
                    min={0.3}
                    max={0.8}
                    step={0.05}
                    value={faceTurnThreshold}
                    onChange={(e) => setFaceTurnThreshold(Number(e.target.value))}
                    disabled={running}
                  />
                  <span className="param-value">{faceTurnThreshold.toFixed(2)}</span>
                </div>
                <span className="param-hint">Plus haut = uniquement visages bien de face. 0,5–0,6 = bon compromis. Plus bas = on accepte des visages un peu de profil.</span>
              </div>
            )}
          </div>
          <div className="param-row param-row-checkbox">
            <label className="param-checkbox-label">
              <input
                type="checkbox"
                checked={blurCheckEnabled}
                onChange={(e) => setBlurCheckEnabled(e.target.checked)}
                disabled={running}
              />
              <span>Rejeter les photos floues</span>
            </label>
            {blurCheckEnabled && (
              <div className="param-inline-block">
                <div className="param-input-inline">
                  <span className="param-label">Netteté min.</span>
                  <input
                    type="range"
                    min={20}
                    max={200}
                    step={10}
                    value={minBlurVariance}
                    onChange={(e) => setMinBlurVariance(Number(e.target.value))}
                    disabled={running}
                  />
                  <span className="param-value">{minBlurVariance}</span>
                </div>
                <span className="param-hint">Plus haut = on rejette plus de photos floues. ~80 = valeur typique. Baisser si trop d’images valides sont rejetées pour « qualité insuffisante ».</span>
              </div>
            )}
          </div>
        </fieldset>
      </div>

      <div className="actions actions-main">
        <button type="button" className="btn-primary btn-large" onClick={runExtract} disabled={running}>
          {running ? <><span className="loading" /> {progress ?? 'Extraction…'}</> : 'Lancer l’extraction'}
        </button>
      </div>

      {error && (
        <div className="message error" role="alert">
          <strong>Erreur</strong> — {error}
        </div>
      )}
      {results && !running && (
        <div className="extract-result">
          <div className="message success" role="status">
            <strong>Extraction terminée</strong> — {matched} visage(s) dans <strong>3_validated</strong>, {rejected} rejeté(s).
            {rejected > 0 && (
              <span className="reject-detail">
                {' '}({rejectReasons.no_face ?? 0} sans visage, {rejectReasons.no_match ?? 0} sans correspondance
                {(rejectReasons.face_turned ?? 0) + (rejectReasons.low_quality ?? 0) > 0 && (
                  <>, {rejectReasons.face_turned ?? 0} visage tourné, {rejectReasons.low_quality ?? 0} qualité insuffisante</>
                )}
                )
              </span>
            )}
          </div>
          <button type="button" className="btn-primary" onClick={onNext}>
            Vérifier les visages →
          </button>
        </div>
      )}
    </section>
  );
}
