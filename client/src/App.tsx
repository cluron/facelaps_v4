import React, { useState } from 'react';
import { TemplatesStep } from './steps/TemplatesStep';
import { InputStep } from './steps/InputStep';
import { ExtractStep } from './steps/ExtractStep';
import { ReviewStep } from './steps/ReviewStep';
import { VideoStep } from './steps/VideoStep';
import './App.css';

type Step = 'templates' | 'input' | 'extract' | 'review' | 'video';

export default function App() {
  const [step, setStep] = useState<Step>('templates');

  const steps: { id: Step; label: string; short: string }[] = [
    { id: 'templates', label: 'Référence (visage à reconnaître)', short: 'Référence' },
    { id: 'input', label: 'Photos à analyser', short: 'Photos' },
    { id: 'extract', label: 'Extraction des visages', short: 'Extraction' },
    { id: 'review', label: 'Vérification des visages', short: 'Vérification' },
    { id: 'video', label: 'Génération vidéo', short: 'Vidéo' },
  ];

  const currentIndex = steps.findIndex((s) => s.id === step) + 1;

  return (
    <div className="app">
      <header className="header">
        <h1>FaceLaps</h1>
        <p className="tagline">Timelapse de visages — extraction, alignement, montage</p>
        <nav className="steps-nav" aria-label="Étapes du pipeline">
          {steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`step-tab ${step === s.id ? 'active' : ''}`}
              onClick={() => setStep(s.id)}
              aria-current={step === s.id ? 'step' : undefined}
              aria-label={`Étape ${i + 1} : ${s.label}`}
              title={s.label}
            >
              <span className="step-tab-num">{i + 1}</span>
              <span className="step-tab-label">{s.short}</span>
            </button>
          ))}
        </nav>
        <p className="step-progress" aria-live="polite">
          Étape {currentIndex} sur {steps.length}
        </p>
      </header>

      <main className="main">
        {step === 'templates' && <TemplatesStep onNext={() => setStep('input')} />}
        {step === 'input' && <InputStep onNext={() => setStep('extract')} />}
        {step === 'extract' && <ExtractStep onNext={() => setStep('review')} />}
        {step === 'review' && <ReviewStep onNext={() => setStep('video')} />}
        {step === 'video' && <VideoStep />}
      </main>
    </div>
  );
}
