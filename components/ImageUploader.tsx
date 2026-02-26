import React, { useRef } from 'react';
import { Upload, Image as ImageIcon, Camera, LoaderCircle } from 'lucide-react';

interface ImageUploaderProps {
  onImageUpload: (base64: string) => void;
  isAnalyzing?: boolean;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload, isAnalyzing }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryAccept = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

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
      className={`premium-surface rounded-[2rem] p-8 sm:p-12 text-center transition-all duration-500 border-2 border-dashed border-[var(--color-border)] shadow-soft ${isAnalyzing ? 'opacity-75 cursor-not-allowed' : 'hover:border-[var(--color-primary)]/30 hover:shadow-strong hover-lift'
        }`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {isAnalyzing ? (
        <div className="flex flex-col items-center gap-4 py-3">
          <LoaderCircle size={44} className="text-[var(--color-accent)] animate-spin" />
          <div>
            <h3 className="font-display text-2xl font-semibold text-[var(--color-ink)]">Analyzing Space</h3>
            <p className="mt-1 text-sm text-[var(--color-text)]/80">Extracting room type and dominant palette.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl subtle-card text-[var(--color-primary)] animate-float">
            <ImageIcon size={32} />
          </div>
          <h3 className="font-display text-3xl font-semibold leading-tight text-[var(--color-ink)] tracking-tight">Drop Room Photo</h3>
          <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[var(--color-text)]/70">
            Upload a listing photo to generate staging, renovation, and cleanup concepts in one workspace.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={triggerFileUpload}
              className="cta-primary hover-lift rounded-2xl px-6 py-4 text-sm font-semibold tracking-wide"
            >
              <span className="inline-flex items-center gap-2">
                <Upload size={16} /> Photo Library
              </span>
            </button>
            <button
              type="button"
              onClick={triggerCameraUpload}
              className="cta-secondary hover-lift rounded-2xl px-6 py-4 text-sm font-semibold tracking-wide"
            >
              <span className="inline-flex items-center gap-2">
                <Camera size={16} /> Take Photo
              </span>
            </button>
          </div>
        </>
      )}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept={galleryAccept}
        className="hidden"
      />
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleFileChange}
        accept={galleryAccept}
        className="hidden"
        capture="environment"
      />
    </div>
  );
};

export default ImageUploader;
