import React, { useRef, useState } from 'react';

type Props = {
  folder: 'templates' | 'input' | 'rejected' | 'validated' | 'video';
  accept?: string;
  onUploaded: (uploaded: string[]) => void;
  disabled?: boolean;
  label?: string;
};

export function UploadZone({ folder, accept = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', onUploaded, disabled, label = 'Glissez des fichiers ici ou cliquez pour parcourir' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    const form = new FormData();
    for (let i = 0; i < files.length; i++) form.append('files', files[i]);
    try {
      const res = await fetch(`/api/upload/${folder}`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur upload');
      onUploaded(data.uploaded ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Erreur');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="upload-zone-wrapper">
      <div
        className={`upload-zone ${dragging ? 'dragging' : ''} ${uploading ? 'uploading' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled && !uploading) upload(e.dataTransfer.files);
        }}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={folder === 'video' ? 'video/mp4,.mp4' : accept}
          multiple
          className="upload-zone-input"
          onChange={(e) => upload(e.target.files)}
          disabled={disabled || uploading}
        />
        {uploading ? (
          <span className="upload-zone-text"><span className="loading" /> Envoi en cours…</span>
        ) : (
          <span className="upload-zone-text">{label}</span>
        )}
      </div>
      {error && <p className="message error" role="alert">{error}</p>}
    </div>
  );
}
