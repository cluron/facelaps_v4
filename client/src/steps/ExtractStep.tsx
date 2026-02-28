import React, { useState } from 'react';

type Props = { onNext: () => void };

type Result = { ok: true; path: string; similarity: number } | { ok: false; path: string; reason: string };

export function ExtractStep({ onNext }: Props) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [matched, setMatched] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runExtract = async () => {
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch('/api/extract', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur extraction');
      setResults(data.results ?? []);
      setMatched(data.matched ?? 0);
    } catch (e: any) {
      setError(e?.message ?? 'Erreur');
    } finally {
      setRunning(false);
    }
  };

  const total = results?.length ?? 0;
  const rejected = total - (matched ?? 0);

  return (
    <section className="step-content">
      <h2 className="section-title">Extraction des visages</h2>
      <p className="message info">
        Détection du visage, comparaison aux templates, alignement (redressement), recadrage et redimensionnement à une taille fixe. Les images qui ne correspondent pas sont déplacées dans 2_rejected.
      </p>
      <div className="actions">
        <button type="button" className="btn-primary" onClick={runExtract} disabled={running}>
          {running ? <><span className="loading" /> Extraction en cours…</> : 'Lancer l’extraction'}
        </button>
      </div>
      {error && <div className="message error">{error}</div>}
      {results && (
        <>
          <div className="message success">
            Terminé : <strong>{matched}</strong> visage(s) extrait(s) et enregistrés dans 3_validated, <strong>{rejected}</strong> rejeté(s).
          </div>
          <div className="actions">
            <button type="button" className="btn-primary" onClick={onNext}>
              Vérifier les visages →
            </button>
          </div>
        </>
      )}
    </section>
  );
}
