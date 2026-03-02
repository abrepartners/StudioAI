import React, { useRef } from 'react';
import { Upload, Image as ImageIcon, Camera, LoaderCircle } from 'lucide-react';

interface ImageUploaderProps {
  onImageUpload: (base64: string) => void;
  isAnalyzing?: boolean;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload, isAnalyzing }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
    // Allow selecting the same file again after upload.
    event.target.value = '';
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      onImageUpload(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    if (isAnalyzing) return;
    const file = event.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) processFile(file);
  };

  const triggerFileUpload = () => {
    if (isAnalyzing) return;
    fileInputRef.current?.click();
  };

  const triggerCameraUpload = () => {
    if (isAnalyzing) return;
    cameraInputRef.current?.click();
  };

  return (
    <div
      className={`premium-surface rounded-2xl p-6 text-center transition-all duration-200 ${
        isAnalyzing ? 'opacity-75 cursor-not-allowed' : 'hover:-translate-y-0.5 hover:shadow-md'
      }`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {isAnalyzing ? (
        <div className="flex flex-col items-center gap-3 py-2">
          <LoaderCircle size={32} className="text-[var(--color-primary)] animate-spin" />
          <div>
            <h3 className="font-display text-lg font-semibold text-[var(--color-ink)]">Analyzing Space</h3>
            <p className="mt-1 text-xs text-[var(--color-text)]">Extracting room type and palette...</p>
          </div>
        </div>
      ) : (
        <>
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-bg-deep)] text-[var(--color-primary)]">
            <ImageIcon size={20} />
          </div>
          <h3 className="font-display text-lg font-semibold text-[var(--color-ink)]">Drop a room photo</h3>
          <p className="mx-auto mt-1 text-sm text-[var(--color-text)]">
            or choose an option below
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={triggerFileUpload}
              className="cta-primary rounded-xl px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              <Upload size={14} /> Upload
            </button>
            <button
              type="button"
              onClick={triggerCameraUpload}
              className="cta-secondary rounded-xl px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              <Camera size={14} /> Camera
            </button>
          </div>
        </>
      )}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
        capture="environment"
      />
    </div>
  );
};

export default ImageUploader;
