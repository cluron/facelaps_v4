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

  const steps: { id: Step; label: string }[] = [
    { id: 'templates', label: 'Templates' },
    { id: 'input', label: 'Photos source' },
    { id: 'extract', label: 'Extraction' },
    { id: 'review', label: 'Vérification' },
    { id: 'video', label: 'Vidéo' },
  ];

  return (
    <div className="app">
      <header className="header">
        <h1>FaceLaps</h1>
        <p className="tagline">Timelapse de visages — extraction, alignement, montage</p>
        <nav className="steps-nav">
          {steps.map((s) => (
            <button
              key={s.id}
              className={`step-tab ${step === s.id ? 'active' : ''}`}
              onClick={() => setStep(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
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
